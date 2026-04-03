/**
 * RAG: build query from meal-plan params, embed, match embeddings, format context
 */

import { embedText } from './embeddingService.js';
import { createUserSupabase } from './supabaseClients.js';

/**
 * @param {object} params - MealGenParams-like
 */
export function buildRetrievalQuery(params) {
  const parts = [
    params.goal && `Goal: ${params.goal}`,
    params.activityLevel && `Activity: ${params.activityLevel}`,
    params.preferences && `Preferences: ${params.preferences}`,
    params.dietaryHistory && `Diet: ${params.dietaryHistory}`,
    params.allergies && `Avoid: ${params.allergies}`,
    params.customInstructions && `Instructions: ${params.customInstructions}`,
    params.nutritionistNotes && `Notes: ${params.nutritionistNotes}`
  ].filter(Boolean);
  return parts.join('\n').slice(0, 6000);
}

/**
 * @param {string} accessToken
 * @param {object} params
 * @param {{ matchCount?: number }} [opts]
 * @returns {Promise<{ contextBlock: string, matches: object[] }>}
 */
export async function retrieveNutritionContext(accessToken, params, opts = {}) {
  const matchCount = Math.min(Math.max(opts.matchCount ?? 24, 5), 60);
  const queryText = buildRetrievalQuery(params);
  if (!queryText.trim()) {
    return { contextBlock: '', matches: [] };
  }

  const embedding = await embedText(queryText);
  const supabase = createUserSupabase(accessToken);

  const { data, error } = await supabase.rpc('match_nutrition_embeddings', {
    query_embedding: embedding,
    match_count: matchCount
  });

  if (error) {
    console.error('[RAG] match_nutrition_embeddings error:', error);
    return { contextBlock: '', matches: [], error: error.message };
  }

  const matches = Array.isArray(data) ? data : [];
  const filtered = rerankAndFilter(matches, params);

  if (!filtered.length) {
    return { contextBlock: '', matches: [] };
  }

  const lines = filtered.map((m, i) => {
    const src =
      m.source_type === 'food' ? '[Food KB]' : m.source_type === 'platform' ? '[Platform]' : '[Your doc]';
    return `${i + 1}. ${src} (similarity ${(m.similarity ?? 0).toFixed(3)})\n${m.content}`;
  });

  const contextBlock =
    'VERIFIED NUTRITION DATA (use these numbers for portions and macros; do not invent different values for the same foods):\n' +
    lines.join('\n\n');

  return { contextBlock, matches: filtered };
}

/**
 * Down-rank chunks that mention allergens; light preference boosting
 * @param {any[]} matches
 * @param {object} params
 */
function rerankAndFilter(matches, params) {
  const allergyTokens = tokenizeAllergies(params.allergies);
  const prefTokens = tokenize(params.preferences);

  const scored = matches.map((m) => {
    let score = Number(m.similarity) || 0;
    const low = String(m.content || '').toLowerCase();
    for (const tok of allergyTokens) {
      if (tok && low.includes(tok)) {
        score -= 0.25;
      }
    }
    for (const tok of prefTokens) {
      if (tok && low.includes(tok)) {
        score += 0.03;
      }
    }
    return { ...m, _score: score };
  });

  scored.sort((a, b) => b._score - a._score);
  return scored.filter((m) => m._score > 0.05).slice(0, 40);
}

function tokenizeAllergies(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((s) => s.split(/\s+/))
    .filter((w) => w.length > 2);
}

function tokenize(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 20);
}

/**
 * RAG for AI nutritionist chat: embed user question (+ optional client summary)
 * @param {string} accessToken
 * @param {{ userMessage: string, clientSnapshot?: { goal?: string, allergies?: string, preferences?: string, dietaryHistory?: string } | null }} input
 * @param {{ matchCount?: number }} [opts]
 */
export async function retrieveNutritionContextForChat(accessToken, input, opts = {}) {
  const matchCount = Math.min(Math.max(opts.matchCount ?? 18, 5), 50);
  const msg = String(input.userMessage || '').trim();
  if (!msg) {
    return { contextBlock: '', matches: [] };
  }

  const snap = input.clientSnapshot;
  const prefix = snap
    ? [
        snap.goal && `Client goal: ${snap.goal}`,
        snap.allergies && `Allergies: ${snap.allergies}`,
        snap.preferences && `Preferences: ${snap.preferences}`,
        snap.dietaryHistory && `Diet history: ${snap.dietaryHistory}`
      ]
        .filter(Boolean)
        .join('\n')
    : '';

  const queryText = prefix ? `${prefix}\n\nQuestion: ${msg}`.slice(0, 6000) : msg.slice(0, 6000);

  let embedding;
  try {
    embedding = await embedText(queryText);
  } catch (embedErr) {
    console.error('[RAG chat] embedding failed, skipping RAG:', embedErr.message);
    return { contextBlock: '', matches: [], error: embedErr.message };
  }
  const supabase = createUserSupabase(accessToken);

  const { data, error } = await supabase.rpc('match_nutrition_embeddings', {
    query_embedding: embedding,
    match_count: matchCount
  });

  if (error) {
    console.error('[RAG chat] match_nutrition_embeddings error:', error);
    return { contextBlock: '', matches: [], error: error.message };
  }

  const matches = Array.isArray(data) ? data : [];
  const paramsLike = {
    allergies: snap?.allergies,
    preferences: snap?.preferences
  };
  const filtered = rerankAndFilter(matches, paramsLike);

  if (!filtered.length) {
    return { contextBlock: '', matches: [] };
  }

  const lines = filtered.map((m, i) => {
    const src =
      m.source_type === 'food' ? '[Food KB]' : m.source_type === 'platform' ? '[Platform]' : '[Your doc]';
    return `${i + 1}. ${src} (similarity ${(m.similarity ?? 0).toFixed(3)})\n${m.content}`;
  });

  const contextBlock =
    'VERIFIED NUTRITION REFERENCE (use when relevant; do not contradict with invented numbers):\n' +
    lines.join('\n\n');

  return { contextBlock, matches: filtered };
}
