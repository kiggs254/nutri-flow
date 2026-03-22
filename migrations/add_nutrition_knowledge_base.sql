-- Nutrition knowledge base + pgvector for RAG meal planning
-- Run on Supabase SQL editor or via migration pipeline.

CREATE EXTENSION IF NOT EXISTS vector;

-- Verified food items (USDA + optional custom rows)
CREATE TABLE IF NOT EXISTS public.nutrition_foods (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  category text,
  source text NOT NULL DEFAULT 'usda' CHECK (source IN ('usda', 'custom')),
  usda_fdc_id bigint UNIQUE,
  calories_per_100g numeric,
  protein_per_100g numeric,
  carbs_per_100g numeric,
  fats_per_100g numeric,
  fiber_per_100g numeric,
  serving_size_g numeric,
  serving_description text,
  common_portions jsonb DEFAULT '[]'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_nutrition_foods_name ON public.nutrition_foods USING gin (to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_nutrition_foods_source ON public.nutrition_foods (source);
CREATE INDEX IF NOT EXISTS idx_nutrition_foods_usda ON public.nutrition_foods (usda_fdc_id) WHERE usda_fdc_id IS NOT NULL;

-- Custom documents per nutritionist
CREATE TABLE IF NOT EXISTS public.nutrition_documents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title text NOT NULL,
  content_text text NOT NULL,
  doc_type text NOT NULL DEFAULT 'guide' CHECK (doc_type IN ('guide', 'recipe', 'protocol', 'other')),
  file_name text,
  mime_type text,
  metadata jsonb DEFAULT '{}'::jsonb,
  chunk_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_nutrition_documents_user_id ON public.nutrition_documents (user_id);

-- Embeddings (Gemini text-embedding-004 = 768 dims)
CREATE TABLE IF NOT EXISTS public.nutrition_embeddings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  content text NOT NULL,
  embedding vector(768) NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('food', 'document')),
  source_id uuid NOT NULL,
  chunk_index integer NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_nutrition_embeddings_source ON public.nutrition_embeddings (source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_nutrition_embeddings_hnsw ON public.nutrition_embeddings
  USING hnsw (embedding vector_cosine_ops);

-- RLS
ALTER TABLE public.nutrition_foods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nutrition_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nutrition_embeddings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.nutrition_foods FORCE ROW LEVEL SECURITY;
ALTER TABLE public.nutrition_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.nutrition_embeddings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nutrition_foods_select_authenticated" ON public.nutrition_foods;
CREATE POLICY "nutrition_foods_select_authenticated"
  ON public.nutrition_foods FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "nutrition_documents_all_own" ON public.nutrition_documents;
CREATE POLICY "nutrition_documents_all_own"
  ON public.nutrition_documents FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Embeddings: users may insert/delete chunks for their own documents; food rows use service_role
DROP POLICY IF EXISTS "nutrition_embeddings_deny" ON public.nutrition_embeddings;
DROP POLICY IF EXISTS "nutrition_embeddings_select" ON public.nutrition_embeddings;
DROP POLICY IF EXISTS "nutrition_embeddings_insert_own_docs" ON public.nutrition_embeddings;
DROP POLICY IF EXISTS "nutrition_embeddings_delete_own_docs" ON public.nutrition_embeddings;

CREATE POLICY "nutrition_embeddings_select"
  ON public.nutrition_embeddings FOR SELECT TO authenticated
  USING (false);

CREATE POLICY "nutrition_embeddings_insert_own_docs"
  ON public.nutrition_embeddings FOR INSERT TO authenticated
  WITH CHECK (
    source_type = 'document'
    AND EXISTS (
      SELECT 1 FROM public.nutrition_documents nd
      WHERE nd.id = source_id AND nd.user_id = auth.uid()
    )
  );

CREATE POLICY "nutrition_embeddings_delete_own_docs"
  ON public.nutrition_embeddings FOR DELETE TO authenticated
  USING (
    source_type = 'document'
    AND EXISTS (
      SELECT 1 FROM public.nutrition_documents nd
      WHERE nd.id = source_id AND nd.user_id = auth.uid()
    )
  );

-- Cosine similarity search: global food chunks + caller's document chunks (JWT)
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

COMMENT ON TABLE public.nutrition_foods IS 'USDA/custom foods with per-100g nutrition for RAG meal planning';
COMMENT ON TABLE public.nutrition_documents IS 'Nutritionist-uploaded knowledge documents';
COMMENT ON TABLE public.nutrition_embeddings IS 'Chunk embeddings; use match_nutrition_embeddings for retrieval';

-- If table existed before chunk_count was added:
ALTER TABLE public.nutrition_documents
  ADD COLUMN IF NOT EXISTS chunk_count integer NOT NULL DEFAULT 0;
