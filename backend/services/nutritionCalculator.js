/**
 * Server-side nutrition calculator.
 *
 * The AI picks foods and approximate portions (the creative work).
 * This module replaces the AI's calorie/macro numbers with arithmetic
 * derived from the structured `nutrition_foods` table (USDA data).
 *
 * Flow per ingredient:
 *   parse string → lookup food in DB → convert unit to grams → scale per-100g → return
 */

// ── Ingredient string parser ─────────────────────────────────────────────────

const UNIT_RE =
  /^([\d]+(?:[./][\d]+)?)\s*(g|grams?|kg|ml|milliliters?|l|liters?|cups?|tbsp|tablespoons?|tsp|teaspoons?|oz|ounces?|pcs?|pieces?|slices?|servings?|large|medium|small|whole)?\s*(?:of\s+)?(.+)$/i;

/**
 * "150g chicken breast" → { qty: 150, unit: 'g', food: 'chicken breast' }
 * "2 eggs"              → { qty: 2,   unit: 'pcs', food: 'eggs' }
 * "1 cup rice"          → { qty: 1,   unit: 'cup', food: 'rice' }
 */
export function parseIngredient(str) {
  if (!str || typeof str !== 'string') return null;
  const s = str.trim();
  const m = s.match(UNIT_RE);
  if (!m) return null;

  let qty = m[1].includes('/') ? evalFraction(m[1]) : parseFloat(m[1]);
  if (!qty || qty <= 0) return null;

  let unit = (m[2] || '').toLowerCase().replace(/s$/, '');
  const food = m[3].trim().replace(/\s+/g, ' ');
  if (!food) return null;

  // Normalise unit aliases
  const ALIASES = {
    gram: 'g', kilogram: 'kg', milliliter: 'ml', liter: 'l',
    tablespoon: 'tbsp', teaspoon: 'tsp', ounce: 'oz',
    piece: 'pcs', pc: 'pcs', slice: 'slice', serving: 'serving',
    large: 'pcs', medium: 'pcs', small: 'pcs', whole: 'pcs',
  };
  if (ALIASES[unit]) unit = ALIASES[unit];
  if (!unit) unit = 'pcs'; // bare number + food → pieces

  return { qty, unit, food };
}

function evalFraction(s) {
  if (s.includes('/')) {
    const [n, d] = s.split('/').map(Number);
    return d ? n / d : NaN;
  }
  return parseFloat(s);
}

// ── Unit → grams conversion ──────────────────────────────────────────────────

const STANDARD_PIECE_WEIGHTS = {
  egg: 50, eggs: 50,
  banana: 118, apple: 182, orange: 131, avocado: 150,
  tomato: 123, potato: 150, onion: 110, carrot: 61,
  'sweet potato': 130,
  'chicken thigh': 180, 'chicken drumstick': 110,
  'slice': 30,
};

/**
 * Convert parsed qty+unit into grams, using the food's `common_portions` when available.
 */
export function resolveWeightG(parsed, foodRow) {
  const { qty, unit, food } = parsed;

  if (unit === 'g') return qty;
  if (unit === 'kg') return qty * 1000;
  if (unit === 'oz') return qty * 28.35;
  if (unit === 'l') return qty * 1000;

  if (unit === 'ml') {
    const isOil = /oil|butter|ghee/i.test(food);
    return qty * (isOil ? 0.92 : 1);
  }

  // Volume / count units — try the food's common_portions first
  const portions = Array.isArray(foodRow?.common_portions) ? foodRow.common_portions : [];
  if (portions.length > 0) {
    const portionMatch = findPortionMatch(portions, unit, qty);
    if (portionMatch) return portionMatch;
  }

  // Standard fallbacks
  if (unit === 'tbsp') return qty * 15;
  if (unit === 'tsp') return qty * 5;
  if (unit === 'cup') return qty * 240;
  if (unit === 'slice') {
    const pw = findPieceWeight(food);
    return qty * (pw ?? 30);
  }

  if (unit === 'pcs' || unit === 'serving') {
    // Try common_portions for "1 whole", "1 medium", etc.
    for (const p of portions) {
      if (p.grams) return qty * p.grams;
    }
    const pw = findPieceWeight(food);
    if (pw) return qty * pw;
    return null; // can't resolve
  }

  return null;
}

function findPortionMatch(portions, unit, qty) {
  const unitLower = unit.toLowerCase();
  for (const p of portions) {
    const name = (p.name || '').toLowerCase();
    if (
      (unitLower === 'cup' && name.includes('cup')) ||
      (unitLower === 'tbsp' && (name.includes('tbsp') || name.includes('tablespoon'))) ||
      (unitLower === 'tsp' && (name.includes('tsp') || name.includes('teaspoon'))) ||
      (unitLower === 'slice' && name.includes('slice')) ||
      (unitLower === 'pcs' && (name.includes('whole') || name.includes('medium') || name.includes('large') || name.includes('unit')))
    ) {
      return qty * (p.grams || 0);
    }
  }
  return null;
}

function findPieceWeight(food) {
  const low = food.toLowerCase();
  for (const [key, grams] of Object.entries(STANDARD_PIECE_WEIGHTS)) {
    if (low.includes(key)) return grams;
  }
  return null;
}

// ── Food lookup in nutrition_foods ───────────────────────────────────────────

/**
 * Search the `nutrition_foods` table for a food by name.
 * Strategy: try increasingly broader ILIKE patterns.
 * Returns the best match (shortest name among results → most generic/default).
 */
export async function lookupFood(supabase, foodName) {
  if (!foodName) return null;

  const clean = foodName
    .toLowerCase()
    .replace(/[,()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Strategy 1: exact-ish match
  let { data } = await supabase
    .from('nutrition_foods')
    .select('id, name, calories_per_100g, protein_per_100g, carbs_per_100g, fats_per_100g, common_portions')
    .ilike('name', `%${clean}%`)
    .limit(10);

  if (!data?.length) {
    // Strategy 2: try the core noun (last word or first two words)
    const words = clean.split(' ').filter(w => w.length > 2);
    for (let i = words.length; i >= 1; i--) {
      const partial = words.slice(0, i).join(' ');
      const r = await supabase
        .from('nutrition_foods')
        .select('id, name, calories_per_100g, protein_per_100g, carbs_per_100g, fats_per_100g, common_portions')
        .ilike('name', `%${partial}%`)
        .limit(10);
      if (r.data?.length) { data = r.data; break; }
    }
  }

  if (!data?.length) return null;

  // Prefer the shortest name (most generic / default entry)
  data.sort((a, b) => a.name.length - b.name.length);
  return data[0];
}

// ── Per-ingredient calculation ────────────────────────────────────────────────

/**
 * Full pipeline for one ingredient string:
 *   parse → DB lookup → unit conversion → arithmetic
 *
 * Returns an ingredientNutrition object or null if unresolvable.
 */
export async function calculateIngredient(supabase, ingredientStr) {
  const parsed = parseIngredient(ingredientStr);
  if (!parsed) return null;

  const foodRow = await lookupFood(supabase, parsed.food);
  if (!foodRow) return null;
  if (foodRow.calories_per_100g == null) return null;

  const weightG = resolveWeightG(parsed, foodRow);
  if (!weightG || weightG <= 0) return null;

  const scale = weightG / 100;
  return {
    item: ingredientStr,
    weightG: round1(weightG),
    calories: round1(scale * (Number(foodRow.calories_per_100g) || 0)),
    proteinG: round1(scale * (Number(foodRow.protein_per_100g) || 0)),
    carbsG: round1(scale * (Number(foodRow.carbs_per_100g) || 0)),
    fatsG: round1(scale * (Number(foodRow.fats_per_100g) || 0)),
    _source: foodRow.name,
  };
}

function round1(n) { return Math.round(n * 10) / 10; }

// ── Meal & plan recalculation ────────────────────────────────────────────────

/**
 * Recalculate a single meal's nutrition from its ingredients.
 * Returns a new meal object with corrected numbers + populated ingredientNutrition.
 * Falls back to the AI's original numbers for ingredients that can't be resolved.
 */
export async function recalculateMeal(supabase, meal) {
  if (!meal || !meal.name) return meal;
  const ingredients = Array.isArray(meal.ingredients) ? meal.ingredients : [];
  if (ingredients.length === 0) return meal;

  const aiIngNutrition = Array.isArray(meal.ingredientNutrition) ? meal.ingredientNutrition : [];
  const calculated = [];

  for (let i = 0; i < ingredients.length; i++) {
    const calc = await calculateIngredient(supabase, ingredients[i]);
    if (calc) {
      calculated.push(calc);
    } else if (aiIngNutrition[i]) {
      // Keep AI's value for this ingredient but mark it
      calculated.push({ ...aiIngNutrition[i], _source: 'ai_fallback' });
    }
    // If neither works, ingredient is unresolved and omitted from nutrition
  }

  if (calculated.length === 0) return meal; // can't improve, return as-is

  const totalCal = Math.round(calculated.reduce((s, c) => s + (c.calories || 0), 0));
  const totalProt = Math.round(calculated.reduce((s, c) => s + (c.proteinG || 0), 0));
  const totalCarbs = Math.round(calculated.reduce((s, c) => s + (c.carbsG || 0), 0));
  const totalFats = Math.round(calculated.reduce((s, c) => s + (c.fatsG || 0), 0));

  return {
    ...meal,
    calories: totalCal,
    protein: `${totalProt}g`,
    carbs: `${totalCarbs}g`,
    fats: `${totalFats}g`,
    ingredientNutrition: calculated.map(({ _source, ...rest }) => rest),
  };
}

/**
 * Recalculate an entire 7-day plan.
 * Corrects meal nutrition from DB, then recomputes daily totals.
 */
export async function recalculatePlan(supabase, plan) {
  if (!Array.isArray(plan)) return plan;

  const corrected = [];
  for (const day of plan) {
    const breakfast = await recalculateMeal(supabase, day.breakfast);
    const lunch = await recalculateMeal(supabase, day.lunch);
    const dinner = await recalculateMeal(supabase, day.dinner);
    const snacks = [];
    if (Array.isArray(day.snacks)) {
      for (const s of day.snacks) {
        snacks.push(await recalculateMeal(supabase, s));
      }
    }

    const totalCalories =
      (breakfast?.calories || 0) +
      (lunch?.calories || 0) +
      (dinner?.calories || 0) +
      snacks.reduce((s, sn) => s + (sn?.calories || 0), 0);

    corrected.push({
      ...day,
      breakfast,
      lunch,
      dinner,
      snacks,
      totalCalories,
    });
  }

  return corrected;
}
