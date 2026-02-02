-- Client groups: create groups and assign clients via group_id
CREATE TABLE IF NOT EXISTS public.client_groups (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_client_groups_user_id ON public.client_groups(user_id);

ALTER TABLE public.client_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_groups FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own client groups" ON public.client_groups;
CREATE POLICY "Users can manage their own client groups" ON public.client_groups
    FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Add group_id to clients (optional FK; keep group_name for legacy/display)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public'
                   AND table_name = 'clients'
                   AND column_name = 'group_id') THEN
        ALTER TABLE public.clients
            ADD COLUMN group_id uuid REFERENCES public.client_groups(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_clients_group_id ON public.clients(group_id);
        RAISE NOTICE 'Added group_id column to clients table';
    END IF;
END $$;
