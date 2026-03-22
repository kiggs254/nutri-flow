/**
 * Platform-wide training documents (service role only)
 */

import { embedTexts } from './embeddingService.js';
import { chunkText } from './documentIngestion.js';

/**
 * Insert document row with ingest_status pending (no embeddings yet).
 * @param {import('@supabase/supabase-js').SupabaseClient} serviceSupabase
 * @param {{
 *   title: string,
 *   contentText: string,
 *   docType?: string,
 *   fileName?: string,
 *   mimeType?: string,
 *   createdBy?: string | null
 * }} input
 * @returns {Promise<{ documentId: string }>}
 */
export async function createPlatformDocumentPending(serviceSupabase, input) {
  const trimmed = String(input.contentText || '').trim();
  if (!trimmed) {
    throw new Error('No text content to index');
  }
  const chunksPreview = chunkText(trimmed);
  if (!chunksPreview.length) {
    throw new Error('No text content to index');
  }

  const { data: docRow, error: docErr } = await serviceSupabase
    .from('platform_nutrition_documents')
    .insert({
      title: input.title,
      content_text: trimmed,
      doc_type: input.docType || 'guide',
      file_name: input.fileName || null,
      mime_type: input.mimeType || null,
      created_by: input.createdBy || null,
      chunk_count: 0,
      ingest_status: 'pending',
      ingest_error: null
    })
    .select('id')
    .single();

  if (docErr) throw docErr;
  return { documentId: docRow.id };
}

/**
 * Chunk, embed, and store embeddings; update row to ready or failed.
 * @param {import('@supabase/supabase-js').SupabaseClient} serviceSupabase
 * @param {string} documentId
 */
export async function runPlatformDocumentIngest(serviceSupabase, documentId) {
  const { data: row, error: fetchErr } = await serviceSupabase
    .from('platform_nutrition_documents')
    .select('id, title, content_text, file_name, ingest_status')
    .eq('id', documentId)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (!row) {
    console.warn('[platform ingest] document not found', documentId);
    return;
  }

  await serviceSupabase
    .from('platform_nutrition_documents')
    .update({ ingest_status: 'processing', ingest_error: null })
    .eq('id', documentId);

  try {
    const contentText = row.content_text || '';
    const chunks = chunkText(contentText);
    if (!chunks.length) {
      throw new Error('No chunks produced from content');
    }

    const embeddings = await embedTexts(chunks, { concurrency: 4 });

    const embRows = chunks.map((content, chunk_index) => ({
      content,
      embedding: embeddings[chunk_index],
      source_type: 'platform',
      source_id: documentId,
      chunk_index,
      metadata: { title: row.title, scope: 'platform', fileName: row.file_name || null }
    }));

    const { error: embErr } = await serviceSupabase.from('nutrition_embeddings').insert(embRows);
    if (embErr) throw embErr;

    await serviceSupabase
      .from('platform_nutrition_documents')
      .update({
        chunk_count: chunks.length,
        ingest_status: 'ready',
        ingest_error: null
      })
      .eq('id', documentId);

    console.log('[platform ingest] ready', documentId, chunks.length, 'chunks');
  } catch (err) {
    console.error('[platform ingest] failed', documentId, err);
    await serviceSupabase
      .from('nutrition_embeddings')
      .delete()
      .eq('source_type', 'platform')
      .eq('source_id', documentId);

    await serviceSupabase
      .from('platform_nutrition_documents')
      .update({
        ingest_status: 'failed',
        ingest_error: err?.message || String(err),
        chunk_count: 0
      })
      .eq('id', documentId);
  }
}

/**
 * Synchronous full ingest (legacy / tests). Prefer createPlatformDocumentPending + runPlatformDocumentIngest.
 */
export async function ingestPlatformDocument(serviceSupabase, input) {
  const { documentId } = await createPlatformDocumentPending(serviceSupabase, input);
  await runPlatformDocumentIngest(serviceSupabase, documentId);
  const { data } = await serviceSupabase
    .from('platform_nutrition_documents')
    .select('chunk_count')
    .eq('id', documentId)
    .single();
  return { documentId, chunksIndexed: data?.chunk_count ?? 0 };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} serviceSupabase
 * @param {string} documentId
 */
export async function deletePlatformDocumentAndEmbeddings(serviceSupabase, documentId) {
  await serviceSupabase.from('nutrition_embeddings').delete().eq('source_type', 'platform').eq('source_id', documentId);

  const { error } = await serviceSupabase.from('platform_nutrition_documents').delete().eq('id', documentId);
  if (error) throw error;
}
