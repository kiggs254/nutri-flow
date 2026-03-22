/**
 * TDEE + daily calorie target from client metrics (server-side; do not rely on LLM estimates)
 */

const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  'very active': 1.9,
  'very_active': 1.9
};

function normalizeActivityKey(level) {
  if (!level) return 'moderate';
  const s = String(level).toLowerCase().trim();
  if (s.includes('sedent') || s.includes('desk') || s.includes('little')) return 'sedentary';
  if (s.includes('light') || s.includes('lightly')) return 'light';
  if (s.includes('moderate')) return 'moderate';
  if (s.includes('very') && s.includes('active')) return 'very active';
  if (s.includes('active') || s.includes('heavy') || s.includes('intense')) return 'active';
  return 'moderate';
}

/**
 * Mifflin-St Jeor BMR (kcal/day)
 */
export function calculateBmrMifflinStJeor({ age, gender, weightKg, heightCm }) {
  const w = Number(weightKg);
  const h = Number(heightCm);
  const a = Number(age);
  if (!w || !h || !a) return null;
  const isMale = /^m/i.test(String(gender || ''));
  const base = 10 * w + 6.25 * h - 5 * a;
  return Math.round(isMale ? base + 5 : base - 161);
}

function goalAdjustmentKcal(goalText) {
  const g = String(goalText || '').toLowerCase();
  if (g.includes('lose') || g.includes('loss') || g.includes('cut') || g.includes('deficit') || g.includes('fat loss')) {
    return -500;
  }
  if (g.includes('gain') || g.includes('muscle') || g.includes('bulk') || g.includes('surplus')) {
    return 300;
  }
  return 0;
}

/**
 * Parse explicit calorie target from free-text instructions, e.g. "2000 kcal", "target 1800 calories"
 * @param {string} text
 * @returns {number | null}
 */
export function parseExplicitCalorieTarget(text) {
  if (!text) return null;
  const s = String(text);
  const m = s.match(/\b(\d{3,4})\s*(?:kcal|cal|calories?)\b/i) || s.match(/\b(?:target|eat|intake|approximately|around)\s*:?\s*(\d{3,4})\b/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 800 && n <= 6000) return n;
  }
  return null;
}

/**
 * @param {{
 *   age: number,
 *   gender: string,
 *   weight: number,
 *   height: number,
 *   activityLevel: string,
 *   goal: string,
 *   bmr?: number,
 *   customInstructions?: string,
 *   nutritionistNotes?: string
 * }} params
 */
export function computeDailyCalorieTarget(params) {
  const fromInstructions =
    parseExplicitCalorieTarget(params.customInstructions) ||
    parseExplicitCalorieTarget(params.nutritionistNotes);

  if (fromInstructions != null) {
    return {
      dailyCalories: fromInstructions,
      bmr: params.bmr != null ? Math.round(Number(params.bmr)) : calculateBmrMifflinStJeor(params),
      tdee: null,
      activityMultiplier: null,
      goalAdjustment: null,
      source: 'explicit_instruction'
    };
  }

  const bmr =
    params.bmr != null && Number(params.bmr) > 0
      ? Math.round(Number(params.bmr))
      : calculateBmrMifflinStJeor(params);

  if (!bmr) {
    return {
      dailyCalories: 2000,
      bmr: null,
      tdee: null,
      activityMultiplier: null,
      goalAdjustment: null,
      source: 'fallback_default',
      note: 'Insufficient metrics for BMR; using 2000 kcal default. Enter BMR, age, weight, and height for accuracy.'
    };
  }

  const actKey = normalizeActivityKey(params.activityLevel);
  const mult = ACTIVITY_MULTIPLIERS[actKey] ?? ACTIVITY_MULTIPLIERS.moderate;
  const tdee = Math.round(bmr * mult);
  const adj = goalAdjustmentKcal(params.goal);
  const dailyCalories = Math.max(1200, Math.min(5000, tdee + adj));

  return {
    dailyCalories,
    bmr,
    tdee,
    activityMultiplier: mult,
    goalAdjustment: adj,
    source: 'computed_tdee'
  };
}
