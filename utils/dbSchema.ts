
export const SETUP_SQL = `
-- 1. Extensions & Table Creation (Idempotent)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.clients (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    name text NOT NULL,
    email text,
    status text,
    goal text,
    last_check_in date,
    avatar_url text,
    medical_history text,
    medications text,
    habits jsonb,
    age integer,
    gender text,
    weight numeric,
    height numeric,
    activity_level text,
    allergies text,
    preferences text,
    body_fat_percentage numeric,
    skeletal_muscle_mass numeric,
    body_fat_mass numeric,
    skeletal_muscle_percentage numeric,
    portal_access_token uuid UNIQUE DEFAULT uuid_generate_v4() NOT NULL,
    dietary_history text,
    social_background text
);
-- Performance index
CREATE INDEX IF NOT EXISTS idx_clients_user_id ON public.clients(user_id);

-- (Create other tables if they don't exist, like invoices, appointments, etc.)
CREATE TABLE IF NOT EXISTS public.invoices ( id uuid default uuid_generate_v4() primary key, client_id uuid references public.clients(id) on delete cascade not null, created_at timestamp with time zone default timezone('utc'::text, now()) not null, amount numeric not null, currency text default 'USD', status text default 'Pending', due_date timestamp with time zone, items jsonb, payment_method text, transaction_ref text );
CREATE TABLE IF NOT EXISTS public.appointments ( id uuid default uuid_generate_v4() primary key, client_id uuid references public.clients(id) on delete cascade not null, created_at timestamp with time zone default timezone('utc'::text, now()) not null, date timestamp with time zone not null, type text not null, status text default 'Scheduled', notes text );
CREATE TABLE IF NOT EXISTS public.food_logs ( id uuid default uuid_generate_v4() primary key, client_id uuid references public.clients(id) on delete cascade not null, created_at timestamp with time zone default timezone('utc'::text, now()) not null, ai_analysis text, image_url text, notes text );
CREATE TABLE IF NOT EXISTS public.progress_logs ( id uuid default uuid_generate_v4() primary key, client_id uuid references public.clients(id) on delete cascade, created_at timestamp with time zone default now(), date date not null, weight numeric not null, compliance_score integer, notes text, body_fat_percentage numeric, skeletal_muscle_mass numeric, body_fat_mass numeric, skeletal_muscle_percentage numeric );
CREATE TABLE IF NOT EXISTS public.meal_plans ( id uuid not null default uuid_generate_v4() primary key, client_id uuid references public.clients(id) on delete cascade not null, created_at timestamp with time zone not null default now(), plan_data jsonb, day_label text );
CREATE TABLE IF NOT EXISTS public.messages ( id uuid default uuid_generate_v4() primary key, client_id uuid references public.clients(id) on delete cascade not null, created_at timestamp with time zone default timezone('utc'::text, now()) not null, sender text not null check (sender in ('client', 'nutritionist')), content text not null, is_read boolean default false );
CREATE TABLE IF NOT EXISTS public.medical_documents ( id uuid default uuid_generate_v4() primary key, client_id uuid references public.clients(id) on delete cascade not null, created_at timestamp with time zone default timezone('utc'::text, now()) not null, file_name text not null, file_path text not null unique );
CREATE TABLE IF NOT EXISTS public.billing_settings ( id uuid default uuid_generate_v4() primary key, user_id uuid references auth.users(id) on delete cascade not null unique, currency text default 'USD' not null, paystack_public_key text, created_at timestamp with time zone default timezone('utc'::text, now()) not null );

-- 2. RLS Policies for Nutritionists (Authenticated Users)
-- Helper function to check ownership securely.
DROP FUNCTION IF EXISTS public.check_client_owner(uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.check_client_owner(p_client_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = p_client_id AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS on all tables
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;

-- CRITICAL SECURITY FIX: Force RLS for table owners as well.
ALTER TABLE public.clients FORCE ROW LEVEL SECURITY;
ALTER TABLE public.invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.appointments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.food_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.progress_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plans FORCE ROW LEVEL SECURITY;
ALTER TABLE public.messages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.medical_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_settings FORCE ROW LEVEL SECURITY;

-- Drop ALL existing policies to ensure idempotency
DROP POLICY IF EXISTS "Nutritionists can manage their own clients" ON public.clients;
DROP POLICY IF EXISTS "Nutritionists can manage client invoices" ON public.invoices;
DROP POLICY IF EXISTS "Nutritionists can manage client appointments" ON public.appointments;
DROP POLICY IF EXISTS "Nutritionists can manage client food_logs" ON public.food_logs;
DROP POLICY IF EXISTS "Nutritionists can manage client progress_logs" ON public.progress_logs;
DROP POLICY IF EXISTS "Nutritionists can manage client meal_plans" ON public.meal_plans;
DROP POLICY IF EXISTS "Nutritionists can manage client messages" ON public.messages;
DROP POLICY IF EXISTS "Nutritionists can manage client medical_documents" ON public.medical_documents;
DROP POLICY IF EXISTS "Nutritionists can manage their own billing settings" ON public.billing_settings;

-- Create new, strict policies for authenticated users
CREATE POLICY "Nutritionists can manage their own clients" ON public.clients FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Nutritionists can manage client invoices" ON public.invoices FOR ALL TO authenticated USING (check_client_owner(client_id)) WITH CHECK (check_client_owner(client_id));
CREATE POLICY "Nutritionists can manage client appointments" ON public.appointments FOR ALL TO authenticated USING (check_client_owner(client_id)) WITH CHECK (check_client_owner(client_id));
CREATE POLICY "Nutritionists can manage client food_logs" ON public.food_logs FOR ALL TO authenticated USING (check_client_owner(client_id)) WITH CHECK (check_client_owner(client_id));
CREATE POLICY "Nutritionists can manage client progress_logs" ON public.progress_logs FOR ALL TO authenticated USING (check_client_owner(client_id)) WITH CHECK (check_client_owner(client_id));
CREATE POLICY "Nutritionists can manage client meal_plans" ON public.meal_plans FOR ALL TO authenticated USING (check_client_owner(client_id)) WITH CHECK (check_client_owner(client_id));
CREATE POLICY "Nutritionists can manage client messages" ON public.messages FOR ALL TO authenticated USING (check_client_owner(client_id)) WITH CHECK (check_client_owner(client_id));
CREATE POLICY "Nutritionists can manage client medical_documents" ON public.medical_documents FOR ALL TO authenticated USING (check_client_owner(client_id)) WITH CHECK (check_client_owner(client_id));
CREATE POLICY "Nutritionists can manage their own billing settings" ON public.billing_settings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- 3. Secure RPC Functions for Client Portal (Anonymous Access)
CREATE OR REPLACE FUNCTION get_client_id_by_token(p_portal_token uuid) RETURNS uuid AS $$ SELECT id FROM public.clients WHERE portal_access_token = p_portal_token; $$ LANGUAGE sql SECURITY DEFINER;
CREATE OR REPLACE FUNCTION get_portal_client_data(p_portal_token uuid) RETURNS SETOF clients AS $$ SELECT * FROM public.clients WHERE portal_access_token = p_portal_token; $$ LANGUAGE sql SECURITY DEFINER;
CREATE OR REPLACE FUNCTION get_portal_meal_plans(p_portal_token uuid) RETURNS SETOF meal_plans AS $$ SELECT * FROM public.meal_plans WHERE client_id = get_client_id_by_token(p_portal_token) ORDER BY created_at DESC; $$ LANGUAGE sql SECURITY DEFINER;
CREATE OR REPLACE FUNCTION get_portal_progress_logs(p_portal_token uuid) RETURNS SETOF progress_logs AS $$ SELECT * FROM public.progress_logs WHERE client_id = get_client_id_by_token(p_portal_token) ORDER BY date ASC; $$ LANGUAGE sql SECURITY DEFINER;
CREATE OR REPLACE FUNCTION get_portal_invoices(p_portal_token uuid) RETURNS SETOF invoices AS $$ SELECT * FROM public.invoices WHERE client_id = get_client_id_by_token(p_portal_token) ORDER BY created_at DESC; $$ LANGUAGE sql SECURITY DEFINER;
CREATE OR REPLACE FUNCTION get_portal_food_logs(p_portal_token uuid) RETURNS SETOF food_logs AS $$ SELECT * FROM public.food_logs WHERE client_id = get_client_id_by_token(p_portal_token) ORDER BY created_at DESC; $$ LANGUAGE sql SECURITY DEFINER;
CREATE OR REPLACE FUNCTION get_portal_appointments(p_portal_token uuid) RETURNS SETOF appointments AS $$ SELECT * FROM public.appointments WHERE client_id = get_client_id_by_token(p_portal_token) ORDER BY date DESC; $$ LANGUAGE sql SECURITY DEFINER;
CREATE OR REPLACE FUNCTION get_portal_messages(p_portal_token uuid) RETURNS SETOF messages AS $$ SELECT * FROM public.messages WHERE client_id = get_client_id_by_token(p_portal_token) ORDER BY created_at ASC; $$ LANGUAGE sql SECURITY DEFINER;
CREATE OR REPLACE FUNCTION get_paystack_key_for_client(p_portal_token uuid) RETURNS text AS $$ SELECT paystack_public_key FROM public.billing_settings WHERE user_id = (SELECT user_id FROM public.clients WHERE portal_access_token = p_portal_token); $$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION insert_portal_message(p_portal_token uuid, p_content text) RETURNS SETOF messages AS $$ DECLARE v_client_id uuid; BEGIN v_client_id := get_client_id_by_token(p_portal_token); IF v_client_id IS NULL THEN RAISE EXCEPTION 'Invalid token'; END IF; RETURN QUERY INSERT INTO public.messages (client_id, sender, content) VALUES (v_client_id, 'client', p_content) RETURNING *; END; $$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE OR REPLACE FUNCTION insert_portal_food_log(p_portal_token uuid, p_ai_analysis text, p_image_url text, p_notes text) RETURNS SETOF food_logs AS $$ DECLARE v_client_id uuid; BEGIN v_client_id := get_client_id_by_token(p_portal_token); IF v_client_id IS NULL THEN RAISE EXCEPTION 'Invalid token'; END IF; RETURN QUERY INSERT INTO public.food_logs (client_id, ai_analysis, image_url, notes) VALUES (v_client_id, p_ai_analysis, p_image_url, p_notes) RETURNING *; END; $$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE OR REPLACE FUNCTION update_invoice_after_payment(p_portal_token uuid, p_invoice_id uuid, p_payment_method text, p_transaction_ref text) RETURNS SETOF invoices AS $$ DECLARE v_client_id uuid; BEGIN v_client_id := get_client_id_by_token(p_portal_token); IF v_client_id IS NULL THEN RAISE EXCEPTION 'Invalid token'; END IF; RETURN QUERY UPDATE public.invoices SET status = 'Paid', payment_method = p_payment_method, transaction_ref = p_transaction_ref WHERE id = p_invoice_id AND client_id = v_client_id RETURNING *; END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant anonymous access to only these specific functions
GRANT EXECUTE ON FUNCTION get_portal_client_data(uuid) TO anon;
GRANT EXECUTE ON FUNCTION get_portal_meal_plans(uuid) TO anon;
GRANT EXECUTE ON FUNCTION get_portal_progress_logs(uuid) TO anon;
GRANT EXECUTE ON FUNCTION get_portal_invoices(uuid) TO anon;
GRANT EXECUTE ON FUNCTION get_portal_food_logs(uuid) TO anon;
GRANT EXECUTE ON FUNCTION get_portal_appointments(uuid) TO anon;
GRANT EXECUTE ON FUNCTION get_portal_messages(uuid) TO anon;
GRANT EXECUTE ON FUNCTION get_paystack_key_for_client(uuid) TO anon;
GRANT EXECUTE ON FUNCTION insert_portal_message(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION insert_portal_food_log(uuid, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION update_invoice_after_payment(uuid, uuid, text, text) TO anon;


-- 4. Storage RLS Policies
-- Create the bucket if it doesn't exist (e.g., for new setups). Usually done in UI.
INSERT INTO storage.buckets (id, name, public)
VALUES ('medical_documents', 'medical_documents', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('food_logs', 'food_logs', true)
ON CONFLICT (id) DO NOTHING;

-- Drop existing storage policy
DROP POLICY IF EXISTS "Nutritionists can manage own client medical docs" ON storage.objects;
DROP POLICY IF EXISTS "Public can view food logs" ON storage.objects;
DROP POLICY IF EXISTS "Portal can upload food logs" ON storage.objects;

-- Medical Documents Policy (Private)
CREATE POLICY "Nutritionists can manage own client medical docs"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'medical_documents' AND
  check_client_owner( (storage.foldername(name))[1]::uuid )
)
WITH CHECK (
  bucket_id = 'medical_documents' AND
  check_client_owner( (storage.foldername(name))[1]::uuid )
);

-- Food Logs Policies (Public Read, Anon Write)
CREATE POLICY "Public can view food logs"
ON storage.objects FOR SELECT
TO public
USING ( bucket_id = 'food_logs' );

CREATE POLICY "Portal can upload food logs"
ON storage.objects FOR INSERT
TO anon
WITH CHECK ( bucket_id = 'food_logs' );
`;
