-- Switch embeddings from Gemini text-embedding-004 (768-dim) to OpenAI text-embedding-3-small (1536-dim)
-- IMPORTANT: This truncates all existing embeddings. After running:
--   1. Re-run USDA sync in the super admin panel to rebuild food embeddings
--   2. Re-upload platform training documents
--   3. Nutritionists should re-upload personal KB documents
-- Ensure OPENAI_API_KEY is set on the backend before re-ingesting.

-- 1) Clear all existing Gemini-produced embeddings (incompatible dimension)
TRUNCATE public.nutrition_embeddings;

-- 2) Drop the old HNSW index (built on 768-dim vectors)
DROP INDEX IF EXISTS public.idx_nutrition_embeddings_hnsw;

-- 3) Change embedding column from vector(768) to vector(1536)
ALTER TABLE public.nutrition_embeddings
  ALTER COLUMN embedding TYPE vector(1536);

-- 4) Rebuild HNSW index for 1536 dimensions
CREATE INDEX IF NOT EXISTS idx_nutrition_embeddings_hnsw
  ON public.nutrition_embeddings
  USING hnsw (embedding vector_cosine_ops);

-- 5) Update column comment
COMMENT ON COLUMN public.nutrition_embeddings.embedding IS 'OpenAI text-embedding-3-small = 1536 dims';

-- 6) Replace match_nutrition_embeddings RPC with 1536-dim signature
--    (Drops the old 768-dim overload first)
DROP FUNCTION IF EXISTS public.match_nutrition_embeddings(vector(768), integer);

CREATE OR REPLACE FUNCTION public.match_nutrition_embeddings(
  query_embedding vector(1536),
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

REVOKE ALL ON FUNCTION public.match_nutrition_embeddings(vector(1536), integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_nutrition_embeddings(vector(1536), integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_nutrition_embeddings(vector(1536), integer) TO service_role;
