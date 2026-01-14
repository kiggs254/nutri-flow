-- Migration: Add dietary_history and social_background columns to clients table
-- Run this in your Supabase SQL Editor if these columns are missing

-- Add dietary_history if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'clients' 
                   AND column_name = 'dietary_history') THEN
        ALTER TABLE public.clients ADD COLUMN dietary_history text;
        RAISE NOTICE 'Added dietary_history column to clients table';
    ELSE
        RAISE NOTICE 'dietary_history column already exists';
    END IF;
END $$;

-- Add social_background if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'clients' 
                   AND column_name = 'social_background') THEN
        ALTER TABLE public.clients ADD COLUMN social_background text;
        RAISE NOTICE 'Added social_background column to clients table';
    ELSE
        RAISE NOTICE 'social_background column already exists';
    END IF;
END $$;
