-- Migration: Add metabolic metrics (BMR, metabolic age, visceral fat)
-- Run this in your Supabase SQL Editor if these columns are missing.
-- Visceral fat is stored as a numeric "level/score" (unitless).

-- clients.bmr
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'clients'
      AND column_name = 'bmr'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN bmr numeric;
    RAISE NOTICE 'Added bmr column to clients table';
  ELSE
    RAISE NOTICE 'bmr column already exists on clients table';
  END IF;
END $$;

-- clients.metabolic_age
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'clients'
      AND column_name = 'metabolic_age'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN metabolic_age integer;
    RAISE NOTICE 'Added metabolic_age column to clients table';
  ELSE
    RAISE NOTICE 'metabolic_age column already exists on clients table';
  END IF;
END $$;

-- clients.visceral_fat
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'clients'
      AND column_name = 'visceral_fat'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN visceral_fat numeric;
    RAISE NOTICE 'Added visceral_fat column to clients table';
  ELSE
    RAISE NOTICE 'visceral_fat column already exists on clients table';
  END IF;
END $$;

-- progress_logs.bmr
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'progress_logs'
      AND column_name = 'bmr'
  ) THEN
    ALTER TABLE public.progress_logs ADD COLUMN bmr numeric;
    RAISE NOTICE 'Added bmr column to progress_logs table';
  ELSE
    RAISE NOTICE 'bmr column already exists on progress_logs table';
  END IF;
END $$;

-- progress_logs.metabolic_age
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'progress_logs'
      AND column_name = 'metabolic_age'
  ) THEN
    ALTER TABLE public.progress_logs ADD COLUMN metabolic_age integer;
    RAISE NOTICE 'Added metabolic_age column to progress_logs table';
  ELSE
    RAISE NOTICE 'metabolic_age column already exists on progress_logs table';
  END IF;
END $$;

-- progress_logs.visceral_fat
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'progress_logs'
      AND column_name = 'visceral_fat'
  ) THEN
    ALTER TABLE public.progress_logs ADD COLUMN visceral_fat numeric;
    RAISE NOTICE 'Added visceral_fat column to progress_logs table';
  ELSE
    RAISE NOTICE 'visceral_fat column already exists on progress_logs table';
  END IF;
END $$;

