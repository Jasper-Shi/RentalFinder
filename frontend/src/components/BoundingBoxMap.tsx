import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';

// Default Toronto box (matches the DB default for new subscriptions).
const DEFAULT_BBOX =
  '43.640990267992834,-79.38644479872552,43.671784241717916,-79.38319149385921';

interface ParsedBBox {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
}

function parseBBox(value: string | undefined | null): ParsedBBox {
  const fallback = DEFAULT_BBOX;
  const parts = (value && value.split(',').length === 4 ? value : fallback)
    .split(',')
    .map((s) => Number(s.trim()));
  if (parts.some((n) => !Number.isFinite(n))) {
    return parseBBox(fallback);
  }
  const [a, b, c, d] = parts;
  return {
    swLat: Math.min(a, c),
    swLng: Math.min(b, d),
    neLat: Math.max(a, c),
    neLng: Math.max(b, d),
  };
}

function boundsToBBoxString(b: L.LatLngBounds): string {
  return `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
}

const RECT_STYLE: L.PathOptions = {
  color: '#2563eb',
  weight: 2,
  fillOpacity: 0.08,
};

/**
 * Renders a single editable rectangle on the map and exposes
 * draw/edit/remove controls via leaflet-geoman.
 *
 * - The rectangle defines the search bounding box.
 * - Drag corners to resize, drag the whole shape to move it.
 * - Use the "Draw Rectangle" toolbar button to replace it with a new one.
 * - The map itself can be panned/zoomed independently — the rectangle stays put.
 */
function RectangleEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const map = useMap();
  const layerRef = useRef<L.Rectangle | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Wire up geoman controls and the initial rectangle once when the map mounts.
  useEffect(() => {
    map.pm.addControls({
      position: 'topright',
      drawCircle: false,
      drawCircleMarker: false,
      drawMarker: false,
      drawPolyline: false,
      drawPolygon: false,
      drawText: false,
      drawRectangle: true,
      cutPolygon: false,
      rotateMode: false,
      editMode: true,
      dragMode: true,
      removalMode: false,
    });
    // Override the default toolbar button tooltips so each mode reads naturally.
    // setLang supports custom language names but the TS types restrict to
    // built-in locales, so we cast.
    (map.pm.setLang as unknown as (
      name: string,
      lang: Record<string, unknown>,
      fallback: string,
    ) => void)(
      'rentalfinder',
      {
        buttonTitles: {
          drawRectButton: 'Draw new search area',
          editButton: 'Resize search area',
          dragButton: 'Move search area',
        },
      },
      'en',
    );

    // Per-mode "exit this mode" action button text. The built-in shared
    // `actions.finish` would label all three modes the same, so we replace
    // each control's actions with a custom one that has its own text and
    // calls the matching disable function.
    type ToolbarAction = { text: string; onClick: () => void; title?: string };
    type ToolbarApi = {
      changeActionsOfControl: (name: string, actions: ToolbarAction[]) => void;
    };
    const toolbar = map.pm.Toolbar as unknown as ToolbarApi;

    toolbar.changeActionsOfControl('Rectangle', [
      {
        text: 'Done drawing',
        title: 'Done drawing',
        onClick: () => map.pm.disableDraw(),
      },
    ]);
    toolbar.changeActionsOfControl('editMode', [
      {
        text: 'Done resizing',
        title: 'Done resizing',
        onClick: () => map.pm.disableGlobalEditMode(),
      },
    ]);
    toolbar.changeActionsOfControl('dragMode', [
      {
        text: 'Done moving',
        title: 'Done moving',
        onClick: () => map.pm.disableGlobalDragMode(),
      },
    ]);

    const wireRectangleEvents = (rect: L.Rectangle) => {
      const report = () => onChangeRef.current(boundsToBBoxString(rect.getBounds()));
      rect.on('pm:edit', report);
      rect.on('pm:dragend', report);
    };

    const initial = parseBBox(value);
    const rect = L.rectangle(
      [
        [initial.swLat, initial.swLng],
        [initial.neLat, initial.neLng],
      ],
      RECT_STYLE,
    ).addTo(map);
    layerRef.current = rect;
    wireRectangleEvents(rect);

    // When user draws a NEW rectangle from the toolbar, replace the existing one.
    const handleCreate = (e: { layer: L.Layer; shape: string }) => {
      if (e.shape !== 'Rectangle') return;
      if (layerRef.current) map.removeLayer(layerRef.current);
      const newRect = e.layer as L.Rectangle;
      newRect.setStyle(RECT_STYLE);
      layerRef.current = newRect;
      wireRectangleEvents(newRect);
      onChangeRef.current(boundsToBBoxString(newRect.getBounds()));
    };
    map.on('pm:create', handleCreate);

    return () => {
      map.off('pm:create', handleCreate);
      map.pm.removeControls();
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
    // We deliberately ignore `value` changes after mount — the rectangle is
    // the source of truth; we only seed it from the prop on first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  return null;
}

interface BoundingBoxMapProps {
  value: string;
  onChange: (value: string) => void;
}

export default function BoundingBoxMap({ value, onChange }: BoundingBoxMapProps) {
  const initial = useMemo(() => parseBBox(value), [value]);

  // Centre the map on the initial rectangle, but with a bit of padding so the
  // rectangle isn't flush with the edges of the viewport.
  const initialBounds = useMemo<L.LatLngBoundsExpression>(
    () => [
      [initial.swLat, initial.swLng],
      [initial.neLat, initial.neLng],
    ],
    [initial],
  );

  return (
    <div>
      <div className="h-80 w-full rounded-lg overflow-hidden border border-gray-300">
        <MapContainer
          bounds={initialBounds}
          boundsOptions={{ padding: [40, 40] }}
          scrollWheelZoom
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <RectangleEditor value={value} onChange={onChange} />
        </MapContainer>
      </div>
      <p className="mt-2 text-xs text-gray-500 break-all font-mono">{value}</p>
      <p className="mt-1 text-xs text-gray-400">
        Drag the rectangle's corners to resize, or drag the whole shape to move
        it. Use the rectangle tool in the top-right to draw a new area.
      </p>
    </div>
  );
}
