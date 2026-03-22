/**
 * USDA FoodData Central ingestion → nutrition_foods + nutrition_embeddings (service role)
 */

import { requireServiceSupabase } from './supabaseClients.js';
import { embedText } from './embeddingService.js';

const FDC_BASE = 'https://api.nal.usda.gov/fdc/v1';

/** Prefer these nutrient IDs (FDC) for per-100g-style values */
const NUTRIENT_IDS = {
  energyKcal: [1008, 208, 957],
  protein: [1003],
  carbs: [1005],
  fat: [1004],
  fiber: [1079, 291]
};

function getApiKey() {
  return process.env.USDA_API_KEY || 'DEMO_KEY';
}

function pickNutrient(foodNutrients, idList) {
  if (!Array.isArray(foodNutrients)) return null;
  for (const id of idList) {
    const n = foodNutrients.find(
      (x) => x.nutrientId === id || x.nutrient?.id === id || x.nutrientId === String(id)
    );
    if (n && typeof n.amount === 'number') return n.amount;
    if (n && typeof n.value === 'number') return n.value;
  }
  return null;
}

function mapFoodDetailToRow(detail) {
  const nutrients = detail.foodNutrients || [];
  const calories = pickNutrient(nutrients, NUTRIENT_IDS.energyKcal);
  const protein = pickNutrient(nutrients, NUTRIENT_IDS.protein);
  const carbs = pickNutrient(nutrients, NUTRIENT_IDS.carbs);
  const fats = pickNutrient(nutrients, NUTRIENT_IDS.fat);
  const fiber = pickNutrient(nutrients, NUTRIENT_IDS.fiber);

  const category =
    detail.foodCategory?.description ||
    detail.brandedFoodCategory ||
    (detail.foodAttributes && detail.foodAttributes[0]?.value) ||
    null;

  let commonPortions = [];
  if (Array.isArray(detail.foodPortions)) {
    commonPortions = detail.foodPortions
      .filter((p) => p.gramWeight && p.portionDescription)
      .slice(0, 8)
      .map((p) => ({
        name: p.portionDescription || p.modifier || 'portion',
        grams: Number(p.gramWeight)
      }));
  }

  const servingSizeG = detail.servingSize && detail.servingSizeUnit === 'g' ? Number(detail.servingSize) : null;
  const servingDescription =
    detail.servingSize && detail.servingSizeUnit
      ? `${detail.servingSize} ${detail.servingSizeUnit}`
      : null;

  return {
    name: detail.description || `FDC ${detail.fdcId}`,
    category,
    source: 'usda',
    usda_fdc_id: detail.fdcId,
    calories_per_100g: calories,
    protein_per_100g: protein,
    carbs_per_100g: carbs,
    fats_per_100g: fats,
    fiber_per_100g: fiber,
    serving_size_g: servingSizeG,
    serving_description: servingDescription,
    common_portions: commonPortions,
    metadata: {
      dataType: detail.dataType,
      scientificName: detail.scientificName || null
    },
    updated_at: new Date().toISOString()
  };
}

export function buildFoodEmbeddingContent(row) {
  const parts = [
    `${row.name}.`,
    row.category ? `Category: ${row.category}.` : '',
    `Per 100g: ${row.calories_per_100g ?? '?'} kcal, protein ${row.protein_per_100g ?? '?'}g, carbs ${row.carbs_per_100g ?? '?'}g, fat ${row.fats_per_100g ?? '?'}g` +
      (row.fiber_per_100g != null ? `, fiber ${row.fiber_per_100g}g.` : '.')
  ];
  if (Array.isArray(row.common_portions) && row.common_portions.length) {
    const portionStr = row.common_portions
      .map((p) => `${p.name} ≈ ${p.grams}g`)
      .join('; ');
    parts.push(`Common portions: ${portionStr}.`);
  }
  if (row.serving_description) {
    parts.push(`Label serving: ${row.serving_description}.`);
  }
  return parts.filter(Boolean).join(' ');
}

async function fetchFoodDetail(fdcId) {
  const url = `${FDC_BASE}/food/${fdcId}?api_key=${encodeURIComponent(getApiKey())}`;
  const res = await fetch(url);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`FDC food ${fdcId}: ${res.status} ${t.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * List foods from FDC (Foundation + SR Legacy)
 * @param {{ pageNumber: number, pageSize: number }} opts
 */
export async function listFoodsPage(opts) {
  const body = {
    pageNumber: opts.pageNumber,
    pageSize: opts.pageSize,
    dataType: ['Foundation', 'SR Legacy']
  };
  const url = `${FDC_BASE}/foods/list?api_key=${encodeURIComponent(getApiKey())}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`FDC foods/list: ${res.status} ${t.slice(0, 300)}`);
  }
  return res.json();
}

/**
 * Upsert one food + replace its embedding
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} detail - FDC food detail JSON
 */
export async function upsertFoodAndEmbedding(supabase, detail) {
  const row = mapFoodDetailToRow(detail);
  const { data: upserted, error: upErr } = await supabase
    .from('nutrition_foods')
    .upsert(row, { onConflict: 'usda_fdc_id' })
    .select('id')
    .maybeSingle();

  if (upErr) throw upErr;
  let foodId = upserted?.id;
  if (!foodId) {
    const { data: found, error: fErr } = await supabase
      .from('nutrition_foods')
      .select('id')
      .eq('usda_fdc_id', detail.fdcId)
      .maybeSingle();
    if (fErr) throw fErr;
    foodId = found?.id;
  }
  if (!foodId) throw new Error('Failed to resolve nutrition_foods id after upsert');

  await supabase.from('nutrition_embeddings').delete().eq('source_type', 'food').eq('source_id', foodId);

  const content = buildFoodEmbeddingContent({ ...row, name: detail.description || row.name });
  const embedding = await embedText(content);

  const { error: insErr } = await supabase.from('nutrition_embeddings').insert({
    content,
    embedding,
    source_type: 'food',
    source_id: foodId,
    chunk_index: 0,
    metadata: { usda_fdc_id: detail.fdcId, name: row.name }
  });

  if (insErr) throw insErr;
  return foodId;
}

/**
 * Sync USDA pages into KB
 * @param {{ maxPages?: number, pageSize?: number, startPage?: number }} options
 */
export async function syncUsdaFoods(options = {}) {
  const supabase = requireServiceSupabase();
  const maxPages = Math.min(Math.max(options.maxPages ?? 5, 1), 50);
  const pageSize = Math.min(Math.max(options.pageSize ?? 40, 10), 200);
  const startPage = Math.max(options.startPage ?? 1, 1);

  let foodsProcessed = 0;
  let errors = [];
  const summaries = [];

  for (let p = startPage; p < startPage + maxPages; p++) {
    let listJson;
    try {
      listJson = await listFoodsPage({ pageNumber: p, pageSize });
    } catch (e) {
      errors.push({ page: p, message: e.message });
      break;
    }

    // USDA /foods/list may return either:
    // - an array of food objects (current behavior), or
    // - an object with a `foods` array (legacy/alternate wrappers)
    const foods = Array.isArray(listJson) ? listJson : listJson?.foods || [];
    if (!foods.length) {
      summaries.push({ page: p, message: 'no foods returned' });
      break;
    }

    for (const brief of foods) {
      const fdcId = brief.fdcId;
      if (!fdcId) continue;
      try {
        const detail = await fetchFoodDetail(fdcId);
        await upsertFoodAndEmbedding(supabase, detail);
        foodsProcessed++;
        await new Promise((r) => setTimeout(r, 120));
      } catch (e) {
        errors.push({ fdcId, message: e.message });
      }
    }
    summaries.push({ page: p, count: foods.length });
  }

  return { foodsProcessed, errors, summaries };
}
