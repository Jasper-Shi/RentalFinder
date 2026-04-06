-- Migration 002: Multi-user subscription model
-- Replaces the recipients + recipient_listings design with
-- users + subscriptions + subscription_listings.
--
-- Run this in the Supabase SQL Editor AFTER 001_initial_schema.sql.

-- ============================================================
-- 1. CREATE NEW TABLES
-- ============================================================

-- 1a. users (replaces recipients)
CREATE TABLE IF NOT EXISTS users (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email      TEXT NOT NULL UNIQUE,
    name       TEXT,
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1b. subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id              BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                 TEXT NOT NULL DEFAULT 'Default',
    is_active            BOOLEAN NOT NULL DEFAULT TRUE,

    -- Schedule
    email_frequency_hours INTEGER NOT NULL DEFAULT 2,
    last_polled_at       TIMESTAMPTZ,
    last_emailed_at      TIMESTAMPTZ,
    next_email_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- First-class filter columns (used to build the 51.ca API query)
    price_min            NUMERIC(12, 2) NOT NULL DEFAULT 0,
    price_max            NUMERIC(12, 2) NOT NULL DEFAULT 2100,
    bounding_box         TEXT NOT NULL DEFAULT '43.73011028547862,-79.39059001147473,43.83019234938175,-79.31074182853408',
    building_types       TEXT NOT NULL DEFAULT 'apartment',
    rental_types         TEXT NOT NULL DEFAULT 'whole',

    -- Extensible filter bucket for less common / future filters.
    -- Example: {"includesWater":"1","independentKitchen":"1","floor":"[0,)"}
    extra_filters        JSONB NOT NULL DEFAULT '{}'::JSONB,

    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_active_email ON subscriptions (is_active, next_email_at)
    WHERE is_active = TRUE;

-- 1c. subscription_listings (replaces recipient_listings)
CREATE TABLE IF NOT EXISTS subscription_listings (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    subscription_id  BIGINT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    listing_id       BIGINT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    delivery_status  TEXT NOT NULL DEFAULT 'pending',
    matched_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at          TIMESTAMPTZ,
    error_message    TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (subscription_id, listing_id)
);

CREATE INDEX IF NOT EXISTS idx_sl_sub_status ON subscription_listings (subscription_id, delivery_status);
CREATE INDEX IF NOT EXISTS idx_sl_listing_id ON subscription_listings (listing_id);

-- ============================================================
-- 2. ADD subscription_id TO polling_history
-- ============================================================

ALTER TABLE polling_history
    ADD COLUMN IF NOT EXISTS subscription_id BIGINT REFERENCES subscriptions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ph_subscription_id ON polling_history (subscription_id);

-- ============================================================
-- 3. ENFORCE MAX 5 ACTIVE SUBSCRIPTIONS PER USER (trigger)
-- ============================================================

CREATE OR REPLACE FUNCTION check_max_active_subscriptions()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    active_count INTEGER;
BEGIN
    IF NEW.is_active = TRUE THEN
        SELECT COUNT(*) INTO active_count
        FROM subscriptions
        WHERE user_id = NEW.user_id
          AND is_active = TRUE
          AND id != COALESCE(NEW.id, 0);

        IF active_count >= 5 THEN
            RAISE EXCEPTION 'User % already has 5 active subscriptions', NEW.user_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_max_active_subscriptions ON subscriptions;
CREATE TRIGGER trg_max_active_subscriptions
    BEFORE INSERT OR UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION check_max_active_subscriptions();

-- ============================================================
-- 4. RPC: get pending listings for a subscription
-- ============================================================

CREATE OR REPLACE FUNCTION get_pending_listings_for_subscription(
    p_subscription_id BIGINT,
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    sl_id               BIGINT,
    listing_id          BIGINT,
    source_listing_id   TEXT,
    title               TEXT,
    source              TEXT,
    location_en         TEXT,
    location_cn         TEXT,
    includes_text       TEXT,
    intersection        TEXT,
    province            TEXT,
    city                TEXT,
    slug                TEXT,
    latitude            DOUBLE PRECISION,
    longitude           DOUBLE PRECISION,
    sublocality         TEXT,
    price_amount        NUMERIC(12,2),
    available_date_raw  TEXT,
    user_modified_at    TIMESTAMPTZ,
    raw_json            JSONB
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        sl.id           AS sl_id,
        l.id            AS listing_id,
        l.source_listing_id,
        l.title,
        l.source,
        l.location_en,
        l.location_cn,
        l.includes_text,
        l.intersection,
        l.province,
        l.city,
        l.slug,
        l.latitude,
        l.longitude,
        l.sublocality,
        l.price_amount,
        l.available_date_raw,
        l.user_modified_at,
        l.raw_json
    FROM subscription_listings sl
    JOIN listings l ON l.id = sl.listing_id
    WHERE sl.subscription_id = p_subscription_id
      AND sl.delivery_status = 'pending'
    ORDER BY l.created_at DESC
    LIMIT p_limit;
$$;

-- ============================================================
-- 5. RPC: get subscriptions due for email
-- ============================================================

CREATE OR REPLACE FUNCTION get_subscriptions_due_for_email()
RETURNS TABLE (
    subscription_id      BIGINT,
    user_id              BIGINT,
    subscription_name    TEXT,
    user_email           TEXT,
    user_name            TEXT,
    email_frequency_hours INTEGER
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        s.id                AS subscription_id,
        u.id                AS user_id,
        s.name              AS subscription_name,
        u.email             AS user_email,
        u.name              AS user_name,
        s.email_frequency_hours
    FROM subscriptions s
    JOIN users u ON u.id = s.user_id
    WHERE s.is_active = TRUE
      AND u.is_active = TRUE
      AND s.next_email_at <= NOW()
    ORDER BY s.next_email_at ASC;
$$;

-- ============================================================
-- 6. DROP OLD TABLES (after confirming migration is successful)
--    Uncomment these when you are ready to remove the old schema.
-- ============================================================

-- DROP FUNCTION IF EXISTS get_unsent_listings_for_recipient;
-- DROP TABLE IF EXISTS recipient_listings;
-- DROP TABLE IF EXISTS recipients;
