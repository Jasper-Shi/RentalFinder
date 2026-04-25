import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface MatchedListing {
  id: number;
  matched_at: string;
  listing: {
    title: string | null;
    intersection: string | null;
    slug: string | null;
  } | null;
}

const LIMIT = 100;

interface MatchedListingsProps {
  subscriptionId: number;
}

export default function MatchedListings({ subscriptionId }: MatchedListingsProps) {
  const [rows, setRows] = useState<MatchedListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    supabase
      .from('subscription_listings')
      .select('id, matched_at, listing:listings (title, intersection, slug)')
      .eq('subscription_id', subscriptionId)
      .order('matched_at', { ascending: false })
      .limit(LIMIT)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          console.error('Failed to load matched listings:', err);
          setError(err.message);
          setLoading(false);
          return;
        }
        setRows((data as unknown as MatchedListing[]) ?? []);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [subscriptionId]);

  if (loading) {
    return <p className="text-sm text-gray-400">Loading matched listings...</p>;
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3">
        Failed to load matched listings: {error}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-10 bg-white rounded-xl border border-gray-200">
        <p className="text-gray-500 text-sm">
          No listings matched yet — they'll appear here as they come in.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <ul className="divide-y divide-gray-100">
        {rows.map((row) => {
          const listing = row.listing;
          if (!listing) return null;
          const href = listing.slug
            ? `https://house.51.ca/rental/${listing.slug}`
            : null;
          const Inner = (
            <div className="px-5 py-3">
              <p className="text-sm font-medium text-gray-900 truncate">
                {listing.title || 'Untitled listing'}
              </p>
              {listing.intersection && (
                <p className="text-xs text-gray-500 mt-0.5 truncate">
                  {listing.intersection}
                </p>
              )}
            </div>
          );
          return (
            <li key={row.id}>
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block hover:bg-gray-50 transition"
                >
                  {Inner}
                </a>
              ) : (
                <div className="opacity-60">{Inner}</div>
              )}
            </li>
          );
        })}
      </ul>
      {rows.length === LIMIT && (
        <p className="px-5 py-2 text-xs text-gray-400 border-t border-gray-100">
          Showing the {LIMIT} most recent matches.
        </p>
      )}
    </div>
  );
}
