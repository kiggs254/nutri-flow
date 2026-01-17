-- Migration: Add push notification subscriptions support
-- Run this in your Supabase SQL Editor

-- Create push_subscriptions table
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh_key text NOT NULL,
  auth_key text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  is_active boolean DEFAULT true NOT NULL
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_client_id ON public.push_subscriptions(client_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active ON public.push_subscriptions(client_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON public.push_subscriptions(endpoint);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_push_subscription_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER push_subscriptions_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_push_subscription_updated_at();

-- Enable RLS
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Clients can only see their own subscriptions
CREATE POLICY "Clients can view their own push subscriptions"
  ON public.push_subscriptions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id = push_subscriptions.client_id
      AND clients.portal_token = current_setting('request.jwt.claims', true)::json->>'portal_token'
    )
  );

-- Clients can insert their own subscriptions
CREATE POLICY "Clients can insert their own push subscriptions"
  ON public.push_subscriptions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id = push_subscriptions.client_id
      AND clients.portal_token = current_setting('request.jwt.claims', true)::json->>'portal_token'
    )
  );

-- Clients can update their own subscriptions
CREATE POLICY "Clients can update their own push subscriptions"
  ON public.push_subscriptions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id = push_subscriptions.client_id
      AND clients.portal_token = current_setting('request.jwt.claims', true)::json->>'portal_token'
    )
  );

-- Clients can delete their own subscriptions
CREATE POLICY "Clients can delete their own push subscriptions"
  ON public.push_subscriptions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id = push_subscriptions.client_id
      AND clients.portal_token = current_setting('request.jwt.claims', true)::json->>'portal_token'
    )
  );

-- Function to get active push subscriptions for a client
CREATE OR REPLACE FUNCTION get_client_push_subscriptions(p_client_id uuid)
RETURNS SETOF push_subscriptions AS $$
  SELECT * FROM public.push_subscriptions
  WHERE client_id = p_client_id
    AND is_active = true
  ORDER BY created_at DESC;
$$ LANGUAGE sql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_client_push_subscriptions(uuid) TO authenticated;

-- Function to get active push subscriptions for portal token (for client portal)
CREATE OR REPLACE FUNCTION get_portal_push_subscriptions(p_portal_token text)
RETURNS SETOF push_subscriptions AS $$
  SELECT ps.* FROM public.push_subscriptions ps
  INNER JOIN public.clients c ON c.id = ps.client_id
  WHERE c.portal_token = p_portal_token
    AND ps.is_active = true
  ORDER BY ps.created_at DESC;
$$ LANGUAGE sql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_portal_push_subscriptions(text) TO authenticated;
