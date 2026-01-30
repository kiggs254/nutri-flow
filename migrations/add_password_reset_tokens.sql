-- Migration: Add backend-driven password reset tokens
-- Run this in your Supabase SQL editor (self-hosted Postgres)
--
-- Creates:
-- - pgcrypto extension (often required by auth/password functions in self-hosted setups)
-- - public.password_reset_tokens table to store one-time reset tokens (hash only)
-- - RLS policies restricting access to service_role
-- - SECURITY DEFINER function to lookup auth.users.id by email for service_role only

-- 1) Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2) Token table
CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON public.password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON public.password_reset_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_used_at ON public.password_reset_tokens(used_at);

ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- 3) RLS policies: service_role only
DROP POLICY IF EXISTS "service_role_select_password_reset_tokens" ON public.password_reset_tokens;
CREATE POLICY "service_role_select_password_reset_tokens"
  ON public.password_reset_tokens
  FOR SELECT
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role_insert_password_reset_tokens" ON public.password_reset_tokens;
CREATE POLICY "service_role_insert_password_reset_tokens"
  ON public.password_reset_tokens
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role_update_password_reset_tokens" ON public.password_reset_tokens;
CREATE POLICY "service_role_update_password_reset_tokens"
  ON public.password_reset_tokens
  FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role_delete_password_reset_tokens" ON public.password_reset_tokens;
CREATE POLICY "service_role_delete_password_reset_tokens"
  ON public.password_reset_tokens
  FOR DELETE
  USING (auth.role() = 'service_role');

-- 4) SECURITY DEFINER lookup function (service_role only)
-- This lets the backend map email -> auth.users.id without exposing auth.users via RLS.
CREATE OR REPLACE FUNCTION public.get_auth_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT id
    INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower(p_email)
  LIMIT 1;

  RETURN v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_auth_user_id_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_user_id_by_email(text) TO service_role;

