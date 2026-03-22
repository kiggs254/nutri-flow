/**
 * Gemini text embeddings (768-dim) for nutrition RAG
 * Model: text-embedding-004
 */

const DEFAULT_MODEL = 'text-embedding-004';

/**
 * @param {string} text
 * @returns {Promise<number[]>}
 */
export async function embedText(text) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    throw new Error('embedText: empty text');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:embedContent?key=${apiKey}`;

  const body = {
    model: `models/${DEFAULT_MODEL}`,
    content: {
      parts: [{ text: trimmed.slice(0, 8000) }]
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Gemini embedContent failed: ${err.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const emb = data.embedding;
  const values = Array.isArray(emb?.values) ? emb.values : Array.isArray(emb) ? emb : null;
  if (!Array.isArray(values) || values.length !== 768) {
    throw new Error(`Unexpected embedding size: ${values?.length}; check text-embedding-004 output`);
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
