import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import BoundingBoxMap from '../components/BoundingBoxMap';
import MatchedListings from '../components/MatchedListings';
import type { ExtraFilters, Subscription } from '../types';

const BUILDING_TYPE_OPTIONS = ['apartment', 'townhouse', 'semi-detached', 'detached'];
const RENTAL_TYPE_OPTIONS = ['whole'];

const DEFAULT_BOUNDING_BOX =
  '43.640990267992834,-79.38644479872552,43.671784241717916,-79.38319149385921';

const DEFAULT_EXTRA: ExtraFilters = {
  floor: '[0,)',
  origin: 'web',
  perPage: '150',
  isVerified: '0',
  isPersonalPost: '0',
  includesWater: '1',
  includesHydro: '0',
  independentKitchen: '1',
  independentBathroom: '1',
};

interface FormState {
  name: string;
  is_active: boolean;
  email_frequency_hours: number;
  price_min: number;
  price_max: number;
  bounding_box: string;
  building_types: string;
  rental_types: string;
  parkingSpaces: string;
  includesWater: string;
  includesHydro: string;
  independentKitchen: string;
  independentBathroom: string;
}

function RadioGroup({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = label.replace(/\s+/g, '-').toLowerCase();
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex gap-4">
        {(['1', '0'] as const).map((v) => (
          <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input
              type="radio"
              name={id}
              value={v}
              checked={value === v}
              onChange={() => onChange(v)}
              className="accent-blue-600"
            />
            {v === '1' ? 'Yes' : 'No'}
          </label>
        ))}
      </div>
    </div>
  );
}

export default function SubscriptionFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = id !== undefined && id !== 'new';
  const navigate = useNavigate();
  const { publicUser } = useAuth();

  const [form, setForm] = useState<FormState>({
    name: '',
    is_active: true,
    email_frequency_hours: 2,
    price_min: 0,
    price_max: 2100,
    bounding_box: DEFAULT_BOUNDING_BOX,
    building_types: 'apartment',
    rental_types: 'whole',
    parkingSpaces: '',
    includesWater: '1',
    includesHydro: '0',
    independentKitchen: '1',
    independentBathroom: '1',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pageLoading, setPageLoading] = useState(isEdit);

  useEffect(() => {
    if (!isEdit) {
      setPageLoading(false);
      return;
    }
    let cancelled = false;
    setPageLoading(true);
    supabase
      .from('subscriptions')
      .select('*')
      .eq('id', Number(id))
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          console.error('Failed to load subscription:', err);
          setError(err.message);
          setPageLoading(false);
          return;
        }
        if (!data) {
          setError('Subscription not found');
          setPageLoading(false);
          return;
        }
        const s = data as Subscription;
        const ef = s.extra_filters ?? {};
        setForm({
          name: s.name,
          is_active: s.is_active,
          email_frequency_hours: s.email_frequency_hours,
          price_min: Number(s.price_min),
          price_max: Number(s.price_max),
          bounding_box: s.bounding_box || DEFAULT_BOUNDING_BOX,
          building_types: s.building_types,
          rental_types: s.rental_types,
          parkingSpaces: ef.parkingSpaces ?? '',
          includesWater: ef.includesWater ?? '1',
          includesHydro: ef.includesHydro ?? '0',
          independentKitchen: ef.independentKitchen ?? '1',
          independentBathroom: ef.independentBathroom ?? '1',
        });
        setPageLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, isEdit]);

  const set = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicUser) return;
    setSaving(true);
    setError('');

    const extraFilters: ExtraFilters = {
      ...DEFAULT_EXTRA,
      includesWater: form.includesWater,
      includesHydro: form.includesHydro,
      independentKitchen: form.independentKitchen,
      independentBathroom: form.independentBathroom,
    };
    if (form.parkingSpaces) {
      extraFilters.parkingSpaces = form.parkingSpaces;
    }

    const payload = {
      user_id: publicUser.id,
      name: form.name.trim() || 'Untitled',
      is_active: form.is_active,
      email_frequency_hours: Math.max(1, form.email_frequency_hours),
      price_min: form.price_min,
      price_max: form.price_max,
      bounding_box: form.bounding_box,
      building_types: form.building_types,
      rental_types: form.rental_types,
      extra_filters: extraFilters,
    };

    let result;
    if (isEdit) {
      result = await supabase
        .from('subscriptions')
        .update(payload)
        .eq('id', Number(id));
    } else {
      result = await supabase.from('subscriptions').insert(payload);
    }

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }

    navigate('/');
  };

  if (pageLoading) {
    return <p className="text-gray-400 text-center mt-12">Loading...</p>;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">
        {isEdit ? form.name || 'Subscription' : 'New Subscription'}
      </h2>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
          {error}
        </div>
      )}

      {isEdit && id && (
        <section className="mb-8">
          <h3 className="text-base font-semibold text-gray-900 mb-3">
            Matched Listings
          </h3>
          <MatchedListings subscriptionId={Number(id)} />
        </section>
      )}

      {isEdit && (
        <h3 className="text-base font-semibold text-gray-900 mb-3">Settings</h3>
      )}

      <form onSubmit={handleSubmit} className="space-y-5 bg-white rounded-xl border border-gray-200 p-6">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Subscription Name
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="e.g. North York Apartments"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>

        {/* Active toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => set('is_active', e.target.checked)}
            className="accent-blue-600 w-4 h-4"
          />
          <span className="text-sm font-medium text-gray-700">Active</span>
        </label>

        {/* Email frequency */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email Frequency (hours)
          </label>
          <input
            type="number"
            min={1}
            value={form.email_frequency_hours}
            onChange={(e) => set('email_frequency_hours', Number(e.target.value))}
            className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>

        {/* Price range */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Min Price ($)</label>
            <input
              type="number"
              min={0}
              value={form.price_min}
              onChange={(e) => set('price_min', Number(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max Price ($)</label>
            <input
              type="number"
              min={0}
              value={form.price_max}
              onChange={(e) => set('price_max', Number(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
        </div>

        {/* Bounding box (map) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Search Area</label>
          <BoundingBoxMap
            value={form.bounding_box}
            onChange={(v) => set('bounding_box', v)}
          />
        </div>

        {/* Building types */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Building Type</label>
          <select
            value={form.building_types}
            onChange={(e) => set('building_types', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
          >
            {BUILDING_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* Rental types */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Rental Type</label>
          <select
            value={form.rental_types}
            onChange={(e) => set('rental_types', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
          >
            {RENTAL_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* Parking spaces */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Parking Spaces
          </label>
          <input
            type="number"
            min={0}
            value={form.parkingSpaces}
            onChange={(e) => set('parkingSpaces', e.target.value)}
            placeholder="Any"
            className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>

        {/* Radio toggles */}
        <div className="grid grid-cols-2 gap-4">
          <RadioGroup
            label="Includes Water"
            value={form.includesWater}
            onChange={(v) => set('includesWater', v)}
          />
          <RadioGroup
            label="Includes Hydro"
            value={form.includesHydro}
            onChange={(v) => set('includesHydro', v)}
          />
          <RadioGroup
            label="Independent Kitchen"
            value={form.independentKitchen}
            onChange={(v) => set('independentKitchen', v)}
          />
          <RadioGroup
            label="Independent Bathroom"
            value={form.independentBathroom}
            onChange={(v) => set('independentBathroom', v)}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Subscription'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-sm text-gray-500 hover:text-gray-800 transition"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
