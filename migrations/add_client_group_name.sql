-- Add optional group_name to clients for grouping in the UI
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public'
                   AND table_name = 'clients'
                   AND column_name = 'group_name') THEN
        ALTER TABLE public.clients ADD COLUMN group_name text;
        RAISE NOTICE 'Added group_name column to clients table';
    ELSE
        RAISE NOTICE 'group_name column already exists';
    END IF;
END $$;
