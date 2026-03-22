/**
 * Chunk + embed nutritionist documents (user JWT Supabase client)
 */

import { embedTexts } from './embeddingService.js';

const DEFAULT_CHUNK = 1800;
const DEFAULT_OVERLAP = 200;

/**
 * @param {string} text
 * @param {{ chunkSize?: number, overlap?: number }} [opts]
 * @returns {string[]}
 */
export function chunkText(text, opts = {}) {
  const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK;
  const overlap = opts.overlap ?? DEFAULT_OVERLAP;
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return [];

  const chunks = [];
  let start = 0;
  while (start < t.length) {
    const end = Math.min(start + chunkSize, t.length);
    chunks.push(t.slice(start, end).trim());
    if (end >= t.length) break;
    start = end - overlap;
    if (start < 0) start = 0;
  }
  return chunks.filter(Boolean);
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} userSupabase
 * @param {{
 *   userId: string,
 *   title: string,
 *   contentText: string,
 *   docType?: string,
 *   fileName?: string,
 *   mimeType?: string
 * }} input
 */
export async function ingestDocument(userSupabase, input) {
  const chunks = chunkText(input.contentText);
  if (!chunks.length) {
    throw new Error('No text content to index');
  }

  const { data: docRow, error: docErr } = await userSupabase
    .from('nutrition_documents')
    .insert({
      user_id: input.userId,
      title: input.title,
      content_text: input.contentText,
      doc_type: input.docType || 'guide',
      file_name: input.fileName || null,
      mime_type: input.mimeType || null
    })
    .select('id')
    .single();

  if (docErr) throw docErr;
  const docId = docRow.id;

  const embeddings = await embedTexts(chunks, { concurrency: 4 });

  const rows = chunks.map((content, chunk_index) => ({
    content,
    embedding: embeddings[chunk_index],
    source_type: 'document',
    source_id: docId,
    chunk_index,
    metadata: { title: input.title, fileName: input.fileName || null }
  }));

  const { error: embErr } = await userSupabase.from('nutrition_embeddings').insert(rows);
  if (embErr) {
    await userSupabase.from('nutrition_documents').delete().eq('id', docId);
    throw embErr;
  }

  await userSupabase.from('nutrition_documents').update({ chunk_count: chunks.length }).eq('id', docId);

  return { documentId: docId, chunksIndexed: chunks.length };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} userSupabase
 * @param {string} documentId
 * @param {string} userId
 */
export async function deleteDocumentAndEmbeddings(userSupabase, documentId, userId) {
  const { data: doc, error: fetchErr } = await userSupabase
    .from('nutrition_documents')
    .select('id, user_id')
    .eq('id', documentId)
    .single();

  if (fetchErr || !doc) {
    throw new Error('Document not found');
  }
  if (doc.user_id !== userId) {
    throw new Error('Forbidden');
  }

  await userSupabase.from('nutrition_embeddings').delete().eq('source_type', 'document').eq('source_id', documentId);

  const { error: delErr } = await userSupabase.from('nutrition_documents').delete().eq('id', documentId);
  if (delErr) throw delErr;
}
