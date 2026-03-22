-- Admin-only similarity search across ALL embedding rows (food, platform, every nutrition_document).
-- Callable only via service_role from the backend — not exposed to authenticated JWT clients.

CREATE OR REPLACE FUNCTION public.match_nutrition_embeddings_admin(
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
  WHERE ne.source_type IN ('food', 'platform', 'document')
  ORDER BY ne.embedding <=> query_embedding
  LIMIT LEAST(GREATEST(match_count, 1), 100);
$$;

REVOKE ALL ON FUNCTION public.match_nutrition_embeddings_admin(vector(1536), integer) FROM PUBLIC;
-- Only service_role (backend with service key) should execute
GRANT EXECUTE ON FUNCTION public.match_nutrition_embeddings_admin(vector(1536), integer) TO service_role;

COMMENT ON FUNCTION public.match_nutrition_embeddings_admin IS 'Super-admin RAG test: all chunks, no auth.uid() filter';
