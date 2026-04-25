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

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  return (
    <div className="space-y-2">
      <ul className="bg-white rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
        {rows.map((row) => {
          const listing = row.listing;
          if (!listing) return null;
          const href = listing.slug
            ? `https://house.51.ca/rental/${listing.slug}`
            : null;
          const Inner = (
            <div className="px-4 py-3 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 line-clamp-2 break-words">
                  {listing.title || 'Untitled listing'}
                </p>
                {listing.intersection && (
                  <p className="text-xs text-gray-500 mt-1 truncate">
                    {listing.intersection}
                  </p>
                )}
                <p className="text-[11px] text-gray-400 mt-1">
                  Matched {formatDate(row.matched_at)}
                </p>
              </div>
              {href && (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-gray-300 shrink-0 mt-1"
                >
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
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
                  className="block hover:bg-gray-50 active:bg-gray-100 transition"
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
        <p className="text-xs text-gray-400 px-1">
          Showing the {LIMIT} most recent matches.
        </p>
      )}
    </div>
  );
}
