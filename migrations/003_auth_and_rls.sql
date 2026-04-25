-- Migration 003: Add Supabase Auth integration and Row Level Security
-- Run this in the Supabase SQL Editor.

-- ============================================================
-- 1. Add auth_id column to users table (links to auth.users.id)
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_id UUID UNIQUE;

CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users (auth_id);

-- ============================================================
-- 2. Enable RLS on tables the frontend accesses
-- ============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. RLS policies for users table
-- ============================================================

-- Users can read their own row, or an unclaimed row matching their email (for the claim flow)
CREATE POLICY users_select_own ON users
    FOR SELECT USING (
        auth_id = auth.uid()
        OR (auth_id IS NULL AND email = auth.jwt()->>'email')
    );

-- Users can insert their own row (on first Google login)
CREATE POLICY users_insert_own ON users
    FOR INSERT WITH CHECK (auth_id = auth.uid());

-- Users can update their own row, or claim an unclaimed row matching their email
CREATE POLICY users_update_own ON users
    FOR UPDATE USING (
        auth_id = auth.uid()
        OR (auth_id IS NULL AND email = auth.jwt()->>'email')
    );

-- ============================================================
-- 4. RLS policies for subscriptions table
-- ============================================================

-- Users can only see their own subscriptions
CREATE POLICY subscriptions_select_own ON subscriptions
    FOR SELECT USING (
        user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    );

-- Users can create subscriptions for themselves
CREATE POLICY subscriptions_insert_own ON subscriptions
    FOR INSERT WITH CHECK (
        user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    );

-- Users can update their own subscriptions
CREATE POLICY subscriptions_update_own ON subscriptions
    FOR UPDATE USING (
        user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    );

-- Users can delete their own subscriptions
CREATE POLICY subscriptions_delete_own ON subscriptions
    FOR DELETE USING (
        user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    );

-- ============================================================
-- 5. Grant the backend service role full bypass (it already has
--    this via the service_role key, but explicit for clarity).
--    No action needed -- service_role key bypasses RLS by default.
-- ============================================================
