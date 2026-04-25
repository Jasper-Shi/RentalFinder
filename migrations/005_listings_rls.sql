-- Migration 005: RLS for subscription_listings and listings
-- Run this in the Supabase SQL Editor.
--
-- Context:
-- The frontend now joins subscription_listings with listings to display the
-- matched listings on the subscription detail screen. Without RLS, an
-- authenticated user could query any subscription's matched listings or any
-- listing row. We restrict the join so users can only see rows tied to their
-- own subscriptions; listings themselves are read-only public data (scraped
-- from a public site) so we keep them readable to all authenticated users.

-- ============================================================
-- 1. subscription_listings: enable RLS, SELECT only own
-- ============================================================

ALTER TABLE subscription_listings ENABLE ROW LEVEL SECURITY;

-- Users can read subscription_listings rows whose subscription belongs to them.
CREATE POLICY subscription_listings_select_own ON subscription_listings
    FOR SELECT USING (
        subscription_id IN (
            SELECT id FROM subscriptions
            WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
        )
    );

-- No INSERT/UPDATE/DELETE policies for normal users; only the backend's
-- service_role key writes to this table (service_role bypasses RLS).

-- ============================================================
-- 2. listings: enable RLS, SELECT open to authenticated users
-- ============================================================

ALTER TABLE listings ENABLE ROW LEVEL SECURITY;

-- Listings are public information. Any logged-in user can read any listing.
-- We don't grant access to anon to avoid exposing the table to unauthenticated
-- traffic via the auto-generated REST API.
CREATE POLICY listings_select_authenticated ON listings
    FOR SELECT TO authenticated USING (TRUE);

-- No write policies for normal users; only the backend's service_role inserts.
