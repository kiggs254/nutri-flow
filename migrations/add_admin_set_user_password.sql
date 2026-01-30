-- Migration: Add service_role-only function to set a user's password hash directly
-- This is a fallback for self-hosted setups where GoTrue admin updateUserById fails with 500.
--
-- Requires: pgcrypto (already added in add_password_reset_tokens.sql)
-- Security: Only executable by service_role; function is SECURITY DEFINER.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.admin_set_user_password(p_user_id uuid, p_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_user_id IS NULL OR p_password IS NULL OR length(p_password) < 6 THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;

  UPDATE auth.users
  SET
    encrypted_password = crypt(p_password, gen_salt('bf')),
    updated_at = now()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_password(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_user_password(uuid, text) TO service_role;

