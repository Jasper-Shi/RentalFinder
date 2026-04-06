-- RentalFinder MVP: Initial Schema
-- Run this in the Supabase SQL Editor or via the Supabase CLI.

-- 1. listings
CREATE TABLE IF NOT EXISTS listings (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_listing_id  TEXT NOT NULL UNIQUE,
    title              TEXT,
    source             TEXT,
    location_en        TEXT,
    location_cn        TEXT,
    includes_text      TEXT,
    intersection       TEXT,
    province           TEXT,
    city               TEXT,
    slug               TEXT,
    latitude           DOUBLE PRECISION,
    longitude          DOUBLE PRECISION,
    sublocality        TEXT,
    price_amount       NUMERIC(12, 2),
    available_date_raw TEXT,
    user_modified_at   TIMESTAMPTZ,
    raw_json           JSONB NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listings_source_listing_id ON listings (source_listing_id);
CREATE INDEX IF NOT EXISTS idx_listings_created_at ON listings (created_at DESC);

-- 2. recipients
CREATE TABLE IF NOT EXISTS recipients (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email      TEXT NOT NULL UNIQUE,
    name       TEXT,
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. recipient_listings (bridge table for delivery tracking)
CREATE TABLE IF NOT EXISTS recipient_listings (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    recipient_id    BIGINT NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
    listing_id      BIGINT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    delivery_status TEXT NOT NULL DEFAULT 'pending',
    first_sent_at   TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ,
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (recipient_id, listing_id)
);

CREATE INDEX IF NOT EXISTS idx_rl_recipient_status ON recipient_listings (recipient_id, delivery_status);
CREATE INDEX IF NOT EXISTS idx_rl_listing_id ON recipient_listings (listing_id);

-- 4. polling_history
CREATE TABLE IF NOT EXISTS polling_history (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    started_at              TIMESTAMPTZ NOT NULL,
    finished_at             TIMESTAMPTZ,
    status                  TEXT NOT NULL DEFAULT 'running',
    total_fetched           INTEGER DEFAULT 0,
    new_inserted_count      INTEGER DEFAULT 0,
    skipped_existing_count  INTEGER DEFAULT 0,
    error_message           TEXT,
    request_url             TEXT,
    request_params_snapshot JSONB,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Supabase RPC: find listings not yet sent to a given recipient.
-- Used by the email service to efficiently query unsent listings.
CREATE OR REPLACE FUNCTION get_unsent_listings_for_recipient(p_recipient_id BIGINT, p_limit INTEGER DEFAULT 50)
RETURNS SETOF listings
LANGUAGE sql
STABLE
AS $$
    SELECT l.*
    FROM listings l
    WHERE NOT EXISTS (
        SELECT 1
        FROM recipient_listings rl
        WHERE rl.listing_id = l.id
          AND rl.recipient_id = p_recipient_id
    )
    ORDER BY l.created_at DESC
    LIMIT p_limit;
$$;
