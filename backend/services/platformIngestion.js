/**
 * Platform-wide training documents (service role only)
 */

import { embedTexts } from './embeddingService.js';
import { chunkText } from './documentIngestion.js';

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} serviceSupabase
 * @param {{
 *   title: string,
 *   contentText: string,
 *   docType?: string,
 *   fileName?: string,
 *   mimeType?: string,
 *   createdBy?: string | null
 * }} input
 */
export async function ingestPlatformDocument(serviceSupabase, input) {
  const chunks = chunkText(input.contentText);
  if (!chunks.length) {
    throw new Error('No text content to index');
  }

  const { data: docRow, error: docErr } = await serviceSupabase
    .from('platform_nutrition_documents')
    .insert({
      title: input.title,
      content_text: input.contentText,
      doc_type: input.docType || 'guide',
      file_name: input.fileName || null,
      mime_type: input.mimeType || null,
      created_by: input.createdBy || null
    })
    .select('id')
    .single();

  if (docErr) throw docErr;
  const docId = docRow.id;

  const embeddings = await embedTexts(chunks, { concurrency: 4 });

  const rows = chunks.map((content, chunk_index) => ({
    content,
    embedding: embeddings[chunk_index],
    source_type: 'platform',
    source_id: docId,
    chunk_index,
    metadata: { title: input.title, scope: 'platform', fileName: input.fileName || null }
  }));

  const { error: embErr } = await serviceSupabase.from('nutrition_embeddings').insert(rows);
  if (embErr) {
    await serviceSupabase.from('platform_nutrition_documents').delete().eq('id', docId);
    throw embErr;
  }

  await serviceSupabase.from('platform_nutrition_documents').update({ chunk_count: chunks.length }).eq('id', docId);

  return { documentId: docId, chunksIndexed: chunks.length };
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
