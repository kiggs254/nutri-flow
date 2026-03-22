-- Async platform document ingestion status
-- Run after add_super_admins_platform_rag.sql

ALTER TABLE public.platform_nutrition_documents
  ADD COLUMN IF NOT EXISTS ingest_status text NOT NULL DEFAULT 'ready';

ALTER TABLE public.platform_nutrition_documents
  ADD COLUMN IF NOT EXISTS ingest_error text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'platform_nutrition_documents_ingest_status_check'
  ) THEN
    ALTER TABLE public.platform_nutrition_documents
      ADD CONSTRAINT platform_nutrition_documents_ingest_status_check
      CHECK (ingest_status IN ('pending', 'processing', 'ready', 'failed'));
  END IF;
END $$;

COMMENT ON COLUMN public.platform_nutrition_documents.ingest_status IS 'pending: queued; processing: embedding; ready: searchable; failed: see ingest_error';
