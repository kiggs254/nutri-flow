/**
 * OpenAI text embeddings (1536-dim) for nutrition RAG
 * Model: text-embedding-3-small
 */

const DEFAULT_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMS = 1536;

/**
 * @param {string} text
 * @returns {Promise<number[]>}
 */
export async function embedText(text) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    throw new Error('embedText: empty text');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      input: trimmed.slice(0, 8000)
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`OpenAI embeddings failed: ${err.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const values = data?.data?.[0]?.embedding;
  if (!Array.isArray(values) || values.length !== EMBEDDING_DIMS) {
    throw new Error(
      `Unexpected embedding size: ${values?.length ?? 'none'}; expected ${EMBEDDING_DIMS} from ${DEFAULT_MODEL}`
    );
  }
  return values;
}

/**
 * Embed many texts with limited concurrency
 * @param {string[]} texts
 * @param {{ concurrency?: number }} [opts]
 * @returns {Promise<number[][]>}
 */
export async function embedTexts(texts, opts = {}) {
  const concurrency = Math.max(1, Math.min(opts.concurrency || 4, 16));
  const results = new Array(texts.length);
  let i = 0;

  async function worker() {
    while (i < texts.length) {
      const idx = i++;
      results[idx] = await embedText(texts[idx]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, texts.length) }, () => worker()));
  return results;
}

/**
 * Format vector for Supabase / PostgREST
 * @param {number[]} values
 */
export function vectorToPgString(values) {
  return `[${values.join(',')}]`;
}
