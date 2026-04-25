-- Migration 004: RPC to safely claim or create a public.users row on login
-- Run this in the Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.claim_or_create_user(
  p_auth_id UUID,
  p_email TEXT,
  p_name TEXT
)
RETURNS SETOF users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Try to claim an existing row that has matching email but no auth_id
  UPDATE users SET auth_id = p_auth_id, name = COALESCE(p_name, name)
  WHERE email = p_email AND auth_id IS NULL;

  IF FOUND THEN
    RETURN QUERY SELECT * FROM users WHERE auth_id = p_auth_id;
    RETURN;
  END IF;

  -- Try to insert; if email already taken (with a different auth_id), do nothing
  BEGIN
    INSERT INTO users (auth_id, email, name, is_active)
    VALUES (p_auth_id, p_email, COALESCE(p_name, ''), TRUE);
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  RETURN QUERY SELECT * FROM users WHERE auth_id = p_auth_id;
END;
$$;
