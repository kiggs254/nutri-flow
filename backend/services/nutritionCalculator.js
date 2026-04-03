/**
 * Server-side nutrition calculator.
 *
 * The AI picks foods and portions (creative work). This module:
 *   1. Looks up each ingredient in the `nutrition_foods` table (USDA per-100g data)
 *   2. Determines portion weight via parsing, AI data, or back-calculation
 *   3. Computes exact nutrition: (weightG / 100) * per_100g_value
 *   4. Replaces AI's numbers and formats clean ingredient labels with gramages
 */

// ── Ingredient string parser ─────────────────────────────────────────────────

const UNIT_RE =
  /^([\d]+(?:[./][\d]+)?)\s*(g|grams?|kg|ml|milliliters?|l|liters?|cups?|tbsp|tablespoons?|tsp|teaspoons?|oz|ounces?|pcs?|pieces?|slices?|servings?|large|medium|small|whole)?\s*(?:of\s+)?(.+)$/i;

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

  const ALIASES = {
    gram: 'g', kilogram: 'kg', milliliter: 'ml', liter: 'l',
    tablespoon: 'tbsp', teaspoon: 'tsp', ounce: 'oz',
    piece: 'pcs', pc: 'pcs', slice: 'slice', serving: 'serving',
    large: 'pcs', medium: 'pcs', small: 'pcs', whole: 'pcs',
  };
  if (ALIASES[unit]) unit = ALIASES[unit];
  if (!unit) unit = 'pcs';

  return { qty, unit, food };
}

function evalFraction(s) {
  const [n, d] = s.split('/').map(Number);
  return d ? n / d : NaN;
}

// ── Unit → grams conversion ──────────────────────────────────────────────────

const STANDARD_PIECE_WEIGHTS = {
  egg: 50, banana: 118, apple: 182, orange: 131, avocado: 150,
  tomato: 123, potato: 150, onion: 110, carrot: 61,
  'sweet potato': 130, 'chicken thigh': 180, 'chicken drumstick': 110, slice: 30,
};

export function resolveWeightG(parsed, foodRow) {
  const { qty, unit, food } = parsed;
  if (unit === 'g') return qty;
  if (unit === 'kg') return qty * 1000;
  if (unit === 'oz') return qty * 28.35;
  if (unit === 'l') return qty * 1000;
  if (unit === 'ml') return qty * (/oil|butter|ghee/i.test(food) ? 0.92 : 1);

  const portions = Array.isArray(foodRow?.common_portions) ? foodRow.common_portions : [];
  if (portions.length > 0) {
    const pm = findPortionMatch(portions, unit, qty);
    if (pm) return pm;
  }

  if (unit === 'tbsp') return qty * 15;
  if (unit === 'tsp') return qty * 5;
  if (unit === 'cup') return qty * 240;
  if (unit === 'slice') return qty * (findPieceWeight(food) ?? 30);
  if (unit === 'pcs' || unit === 'serving') {
    for (const p of portions) { if (p.grams) return qty * p.grams; }
    const pw = findPieceWeight(food);
    if (pw) return qty * pw;
  }
  return null;
}

function findPortionMatch(portions, unit, qty) {
  const u = unit.toLowerCase();
  for (const p of portions) {
    const n = (p.name || '').toLowerCase();
    if (
      (u === 'cup' && n.includes('cup')) ||
      (u === 'tbsp' && (n.includes('tbsp') || n.includes('tablespoon'))) ||
      (u === 'tsp' && (n.includes('tsp') || n.includes('teaspoon'))) ||
      (u === 'slice' && n.includes('slice')) ||
      (u === 'pcs' && (n.includes('whole') || n.includes('medium') || n.includes('large') || n.includes('unit')))
    ) return qty * (p.grams || 0);
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

// ── Food lookup ──────────────────────────────────────────────────────────────

const FOOD_COLS = 'id, name, calories_per_100g, protein_per_100g, carbs_per_100g, fats_per_100g, common_portions';

/**
 * Score how well a DB food name matches the search term.
 * Higher = better. Penalise matches where the keyword is buried inside
 * an unrelated food (e.g. "rice" inside "alcoholic beverage rice (sake)").
 */
function matchScore(dbName, searchTerm) {
  const db = dbName.toLowerCase();
  const st = searchTerm.toLowerCase();
  // Exact start of name → best
  if (db.startsWith(st)) return 100;
  // Starts after a comma-space ("Chicken, breast" searching "breast")
  if (db.includes(', ' + st)) return 80;
  // Whole word match somewhere
  const wordRe = new RegExp('\\b' + st.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
  if (wordRe.test(db)) return 60;
  // Substring match (worst — "rice" inside "price")
  return 20;
}

export async function lookupFood(supabase, foodName) {
  if (!foodName) return null;
  const clean = foodName.toLowerCase().replace(/[,()]/g, '').replace(/\s+/g, ' ').trim();

  // Strategy 1: name starts with the search term (best matches)
  let { data } = await supabase.from('nutrition_foods').select(FOOD_COLS)
    .ilike('name', `${clean}%`).limit(10);

  // Strategy 2: search term after a comma ("Chicken, breast" for "breast")
  if (!data?.length) {
    ({ data } = await supabase.from('nutrition_foods').select(FOOD_COLS)
      .ilike('name', `%, ${clean}%`).limit(10));
  }

  // Strategy 3: contains anywhere (broad)
  if (!data?.length) {
    ({ data } = await supabase.from('nutrition_foods').select(FOOD_COLS)
      .ilike('name', `%${clean}%`).limit(15));
  }

  // Strategy 4: try individual words (progressively fewer)
  if (!data?.length) {
    const words = clean.split(' ').filter(w => w.length > 2);
    for (let i = words.length; i >= 1; i--) {
      const partial = words.slice(0, i).join(' ');
      const r = await supabase.from('nutrition_foods').select(FOOD_COLS)
        .ilike('name', `${partial}%`).limit(10);
      if (r.data?.length) { data = r.data; break; }
      const r2 = await supabase.from('nutrition_foods').select(FOOD_COLS)
        .ilike('name', `%${partial}%`).limit(10);
      if (r2.data?.length) { data = r2.data; break; }
    }
  }

  if (!data?.length) return null;

  // Rank by match quality, then by shortest name (most generic)
  data.sort((a, b) => {
    const sa = matchScore(a.name, clean);
    const sb = matchScore(b.name, clean);
    if (sb !== sa) return sb - sa; // higher score first
    return a.name.length - b.name.length; // shorter name first
  });
  return data[0];
}

// ── Name cleaning ────────────────────────────────────────────────────────────

function cleanFoodName(usdaName) {
  if (!usdaName) return usdaName;
  const parts = usdaName.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length <= 1) return usdaName.toLowerCase();
  const skip = /^(beverages|cereals|dairy|fats|fruits|legumes|meals|nuts|snacks|soups|sweets|vegetables|spices|baked|fast foods|restaurant)/i;
  const useful = parts.filter(p => !skip.test(p));
  return (useful.length > 0 ? useful.slice(0, 2).join(' ') : parts.slice(0, 2).join(' ')).toLowerCase();
}

/**
 * Extract a food name from an ingredient string — works even without a leading number.
 * "150g chicken breast" → "chicken breast"
 * "chicken breast"      → "chicken breast"
 * "Formulated bar, SLIM-FAST" → "Formulated bar, SLIM-FAST"
 */
function extractFoodName(str) {
  const parsed = parseIngredient(str);
  if (parsed) return parsed.food;
  // No leading number — the whole string is the food name
  return str.replace(/[,()]/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── Per-ingredient calculation ────────────────────────────────────────────────

/**
 * Determine the weight in grams for an ingredient using every available signal:
 *   1. Parsed from the ingredient string (e.g., "150g chicken breast" → 150)
 *   2. From AI's ingredientNutrition.weightG
 *   3. Back-calculated: (aiCalories / dbCaloriesPer100g) * 100
 */
function determineWeightG(parsed, foodRow, aiNutrition) {
  // 1. From parsed ingredient string
  if (parsed) {
    const wg = resolveWeightG(parsed, foodRow);
    if (wg && wg > 0) return wg;
  }

  // 2. From AI's ingredientNutrition
  if (aiNutrition?.weightG && aiNutrition.weightG > 0) {
    return aiNutrition.weightG;
  }

  // 3. Back-calculate from AI calories and DB per-100g
  if (aiNutrition?.calories && aiNutrition.calories > 0 && foodRow?.calories_per_100g > 0) {
    return (aiNutrition.calories / Number(foodRow.calories_per_100g)) * 100;
  }

  return null;
}

/**
 * Full pipeline for one ingredient. Uses all available data to determine
 * weight and compute nutrition from the DB.
 *
 * @param {object} supabase
 * @param {string} ingredientStr - e.g. "150g chicken breast" or just "chicken breast"
 * @param {object|null} aiNutrition - AI's ingredientNutrition entry (has weightG, calories, etc.)
 */
export async function calculateIngredient(supabase, ingredientStr, aiNutrition) {
  const foodName = extractFoodName(ingredientStr);
  if (!foodName) return null;

  const parsed = parseIngredient(ingredientStr); // may be null if no leading number
  const foodRow = await lookupFood(supabase, foodName);
  if (!foodRow || foodRow.calories_per_100g == null) return null;

  const weightG = determineWeightG(parsed, foodRow, aiNutrition);
  if (!weightG || weightG <= 0) return null;

  const scale = weightG / 100;
  const roundedWeight = Math.round(weightG);
  const label = `${cleanFoodName(foodRow.name)} ${roundedWeight}g`;

  return {
    item: label,
    weightG: roundedWeight,
    calories: Math.round(scale * (Number(foodRow.calories_per_100g) || 0)),
    proteinG: Math.round(scale * (Number(foodRow.protein_per_100g) || 0)),
    carbsG: Math.round(scale * (Number(foodRow.carbs_per_100g) || 0)),
    fatsG: Math.round(scale * (Number(foodRow.fats_per_100g) || 0)),
    _cleanLabel: label,
  };
}

// ── Meal & plan recalculation ────────────────────────────────────────────────

export async function recalculateMeal(supabase, meal) {
  if (!meal || !meal.name) return meal;
  const ingredients = Array.isArray(meal.ingredients) ? meal.ingredients : [];
  if (ingredients.length === 0) return meal;

  const aiIngNutrition = Array.isArray(meal.ingredientNutrition) ? meal.ingredientNutrition : [];
  const calculated = [];
  const cleanIngredients = [];

  for (let i = 0; i < ingredients.length; i++) {
    const aiIng = aiIngNutrition[i] || null;
    const calc = await calculateIngredient(supabase, ingredients[i], aiIng);

    if (calc) {
      calculated.push(calc);
      cleanIngredients.push(calc._cleanLabel);
    } else if (aiIng && aiIng.weightG > 0) {
      // DB lookup failed but AI provided weight — use AI values + format label
      const foodName = extractFoodName(aiIng.item || ingredients[i]);
      cleanIngredients.push(`${foodName} ${Math.round(aiIng.weightG)}g`);
      calculated.push(aiIng);
    } else {
      // Last resort: try to parse and show whatever weight we have
      const parsed = parseIngredient(ingredients[i]);
      if (parsed) {
        const wg = resolveWeightG(parsed, null);
        cleanIngredients.push(wg ? `${parsed.food} ${Math.round(wg)}g` : `${parsed.food} ${parsed.qty}${parsed.unit}`);
      } else {
        cleanIngredients.push(ingredients[i]);
      }
      if (aiIng) calculated.push(aiIng);
    }
  }

  if (calculated.length === 0) return meal;

  const totalCal = Math.round(calculated.reduce((s, c) => s + (c.calories || 0), 0));
  const totalProt = Math.round(calculated.reduce((s, c) => s + (c.proteinG || 0), 0));
  const totalCarbs = Math.round(calculated.reduce((s, c) => s + (c.carbsG || 0), 0));
  const totalFats = Math.round(calculated.reduce((s, c) => s + (c.fatsG || 0), 0));

  return {
    ...meal,
    ingredients: cleanIngredients,
    calories: totalCal,
    protein: `${totalProt}g`,
    carbs: `${totalCarbs}g`,
    fats: `${totalFats}g`,
    ingredientNutrition: calculated.map(({ _cleanLabel, ...rest }) => rest),
  };
}

export async function recalculatePlan(supabase, plan) {
  if (!Array.isArray(plan)) return plan;

  const corrected = [];
  for (const day of plan) {
    const breakfast = await recalculateMeal(supabase, day.breakfast);
    const lunch = await recalculateMeal(supabase, day.lunch);
    const dinner = await recalculateMeal(supabase, day.dinner);
    const snacks = [];
    if (Array.isArray(day.snacks)) {
      for (const s of day.snacks) snacks.push(await recalculateMeal(supabase, s));
    }

    const totalCalories =
      (breakfast?.calories || 0) +
      (lunch?.calories || 0) +
      (dinner?.calories || 0) +
      snacks.reduce((s, sn) => s + (sn?.calories || 0), 0);

    corrected.push({ ...day, breakfast, lunch, dinner, snacks, totalCalories });
  }

  return corrected;
}
