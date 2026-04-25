import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Rectangle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Default Toronto box (matches the DB default for new subscriptions).
const DEFAULT_BBOX = '43.640990267992834,-79.38644479872552,43.671784241717916,-79.38319149385921';

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
  // Normalize: ensure first pair is the SW corner, second is NE.
  const [a, b, c, d] = parts;
  return {
    swLat: Math.min(a, c),
    swLng: Math.min(b, d),
    neLat: Math.max(a, c),
    neLng: Math.max(b, d),
  };
}

function formatBBox(b: ParsedBBox): string {
  return `${b.swLat},${b.swLng},${b.neLat},${b.neLng}`;
}

/**
 * Listens to the Leaflet map's move/zoom events and reports the
 * current viewport bounds as a "lat_sw,lng_sw,lat_ne,lng_ne" string.
 */
function ViewportTracker({ onChange }: { onChange: (value: string) => void }) {
  const map = useMap();
  const lastReported = useRef<string>('');

  useEffect(() => {
    const report = () => {
      const b = map.getBounds();
      const next = formatBBox({
        swLat: b.getSouth(),
        swLng: b.getWest(),
        neLat: b.getNorth(),
        neLng: b.getEast(),
      });
      if (next !== lastReported.current) {
        lastReported.current = next;
        onChange(next);
      }
    };
    // Initial report once the map has settled.
    map.whenReady(report);
    map.on('moveend', report);
    map.on('zoomend', report);
    return () => {
      map.off('moveend', report);
      map.off('zoomend', report);
    };
  }, [map, onChange]);

  return null;
}

interface BoundingBoxMapProps {
  value: string;
  onChange: (value: string) => void;
}

export default function BoundingBoxMap({ value, onChange }: BoundingBoxMapProps) {
  const initial = useMemo(() => parseBBox(value), [value]);
  const initialBounds = useMemo<L.LatLngBoundsExpression>(
    () => [
      [initial.swLat, initial.swLng],
      [initial.neLat, initial.neLng],
    ],
    [initial],
  );

  // Show a rectangle representing the saved value (kept in sync with `value`).
  const currentBounds = useMemo<L.LatLngBoundsExpression>(() => {
    const b = parseBBox(value);
    return [
      [b.swLat, b.swLng],
      [b.neLat, b.neLng],
    ];
  }, [value]);

  return (
    <div>
      <div className="h-72 w-full rounded-lg overflow-hidden border border-gray-300">
        <MapContainer
          bounds={initialBounds}
          scrollWheelZoom
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Rectangle
            bounds={currentBounds}
            pathOptions={{
              color: '#2563eb',
              weight: 2,
              fillOpacity: 0.05,
            }}
          />
          <ViewportTracker onChange={onChange} />
        </MapContainer>
      </div>
      <p className="mt-2 text-xs text-gray-500 break-all font-mono">{value}</p>
      <p className="mt-1 text-xs text-gray-400">
        Pan and zoom — the visible area defines the search bounding box.
      </p>
    </div>
  );
}
