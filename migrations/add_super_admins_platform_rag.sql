-- Super admins, platform-wide training docs, and RAG match update
-- Run after add_nutrition_knowledge_base.sql

-- 1) Super admins (backend reads with service_role only)
CREATE TABLE IF NOT EXISTS public.super_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.super_admins FORCE ROW LEVEL SECURITY;
-- No policies: authenticated cannot read/write; service_role bypasses RLS

COMMENT ON TABLE public.super_admins IS 'Platform super admins; manage via SQL INSERT. Backend checks with service role.';

-- 2) Platform training documents (visible to all nutritionists via RAG)
CREATE TABLE IF NOT EXISTS public.platform_nutrition_documents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  content_text text NOT NULL,
  doc_type text NOT NULL DEFAULT 'guide' CHECK (doc_type IN ('guide', 'recipe', 'protocol', 'other')),
  file_name text,
  mime_type text,
  chunk_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_platform_nutrition_documents_created_at ON public.platform_nutrition_documents (created_at DESC);

ALTER TABLE public.platform_nutrition_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_nutrition_documents FORCE ROW LEVEL SECURITY;

-- 3) Allow source_type 'platform' on embeddings
ALTER TABLE public.nutrition_embeddings DROP CONSTRAINT IF EXISTS nutrition_embeddings_source_type_check;
ALTER TABLE public.nutrition_embeddings
  ADD CONSTRAINT nutrition_embeddings_source_type_check
  CHECK (source_type IN ('food', 'document', 'platform'));

-- 4) Updated similarity search: food + user docs + platform docs
CREATE OR REPLACE FUNCTION public.match_nutrition_embeddings(
  query_embedding vector(768),
  match_count integer DEFAULT 24
)
RETURNS TABLE (
  id uuid,
  content text,
  similarity double precision,
  source_type text,
  source_id uuid,
  metadata jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ne.id,
    ne.content,
    (1 - (ne.embedding <=> query_embedding))::double precision AS similarity,
    ne.source_type,
    ne.source_id,
    ne.metadata
  FROM public.nutrition_embeddings ne
  WHERE
    ne.source_type = 'food'
    OR ne.source_type = 'platform'
    OR (
      ne.source_type = 'document'
      AND EXISTS (
        SELECT 1 FROM public.nutrition_documents nd
        WHERE nd.id = ne.source_id AND nd.user_id = auth.uid()
      )
    )
  ORDER BY ne.embedding <=> query_embedding
  LIMIT LEAST(GREATEST(match_count, 1), 100);
$$;

REVOKE ALL ON FUNCTION public.match_nutrition_embeddings(vector, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_nutrition_embeddings(vector, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_nutrition_embeddings(vector, integer) TO service_role;

COMMENT ON TABLE public.platform_nutrition_documents IS 'Global training docs for RAG; ingested with service role';
