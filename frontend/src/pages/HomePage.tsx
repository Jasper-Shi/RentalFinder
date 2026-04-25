import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Subscription } from '../types';

export default function HomePage() {
  const { publicUser } = useAuth();
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!publicUser) {
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', publicUser.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('Failed to load subscriptions:', error);
        setSubs((data as Subscription[]) ?? []);
        setLoading(false);
      });
  }, [publicUser]);

  if (loading) {
    return <p className="text-gray-400 text-center mt-12">Loading subscriptions...</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">My Subscriptions</h2>
        <Link
          to="/subscriptions/new"
          className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition"
        >
          + New Subscription
        </Link>
      </div>

      {subs.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500 mb-4">You don't have any subscriptions yet.</p>
          <Link
            to="/subscriptions/new"
            className="text-blue-600 font-medium hover:underline"
          >
            Create your first subscription
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {subs.map((s) => (
            <Link
              key={s.id}
              to={`/subscriptions/${s.id}`}
              className="block bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{s.name}</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    ${Number(s.price_min).toFixed(0)} – ${Number(s.price_max).toFixed(0)}
                    &nbsp;&middot;&nbsp;{s.building_types}
                    &nbsp;&middot;&nbsp;Every {s.email_frequency_hours}h
                  </p>
                </div>
                <span
                  className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    s.is_active
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {s.is_active ? 'Active' : 'Paused'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
