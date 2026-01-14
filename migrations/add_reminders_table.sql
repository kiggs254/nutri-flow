-- Migration: Add reminders table for nutritionist-to-client notifications
-- Run this in your Supabase SQL Editor

-- Create reminders table
CREATE TABLE IF NOT EXISTS public.reminders (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    is_dismissed boolean DEFAULT false NOT NULL,
    dismissed_at timestamp with time zone
);

-- Performance index
CREATE INDEX IF NOT EXISTS idx_reminders_client_id ON public.reminders(client_id);
CREATE INDEX IF NOT EXISTS idx_reminders_dismissed ON public.reminders(client_id, is_dismissed);

-- Enable RLS
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders FORCE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Nutritionists can manage client reminders" ON public.reminders;

-- Create policy for authenticated users (nutritionists)
CREATE POLICY "Nutritionists can manage client reminders" 
ON public.reminders 
FOR ALL 
TO authenticated 
USING (check_client_owner(client_id)) 
WITH CHECK (check_client_owner(client_id));

-- RPC function for client portal to get reminders
CREATE OR REPLACE FUNCTION get_portal_reminders(p_portal_token uuid) 
RETURNS SETOF reminders AS $$ 
SELECT * FROM public.reminders 
WHERE client_id = get_client_id_by_token(p_portal_token) 
  AND is_dismissed = false
ORDER BY created_at DESC; 
$$ LANGUAGE sql SECURITY DEFINER;

-- RPC function for client portal to dismiss a reminder
CREATE OR REPLACE FUNCTION dismiss_portal_reminder(p_portal_token uuid, p_reminder_id uuid) 
RETURNS SETOF reminders AS $$ 
DECLARE 
  v_client_id uuid; 
BEGIN 
  v_client_id := get_client_id_by_token(p_portal_token); 
  IF v_client_id IS NULL THEN 
    RAISE EXCEPTION 'Invalid token'; 
  END IF; 
  RETURN QUERY 
  UPDATE public.reminders 
  SET is_dismissed = true, dismissed_at = timezone('utc'::text, now())
  WHERE id = p_reminder_id 
    AND client_id = v_client_id 
    AND is_dismissed = false
  RETURNING *; 
END; 
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant anonymous access to these functions
GRANT EXECUTE ON FUNCTION get_portal_reminders(uuid) TO anon;
GRANT EXECUTE ON FUNCTION dismiss_portal_reminder(uuid, uuid) TO anon;
