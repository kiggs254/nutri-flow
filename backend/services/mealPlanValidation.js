/**
 * Post-generation checks: daily calories vs target, macro sum sanity
 * @param {object[]} plan
 */

function parseMacroGrams(s) {
  if (s == null) return 0;
  const m = String(s).match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
}

function sumMealCalories(meal) {
  if (!meal || typeof meal !== 'object') return 0;
  return Number(meal.calories) || 0;
}

/**
 * @param {any} day
 */
function computeDayCaloriesFromMeals(day) {
  if (!day) return 0;
  let sum = 0;
  sum += sumMealCalories(day.breakfast);
  sum += sumMealCalories(day.lunch);
  sum += sumMealCalories(day.dinner);
  if (Array.isArray(day.snacks)) {
    for (const s of day.snacks) sum += sumMealCalories(s);
  }
  return sum;
}

/**
 * @param {object[]} plan
 * @param {number} targetDailyKcal
 * @param {{ toleranceRatio?: number }} [opts]
 */
export function validatePlanNutrition(plan, targetDailyKcal, opts = {}) {
  const tolerance = opts.toleranceRatio ?? 0.2;
  const warnings = [];
  const perDay = [];

  if (!Array.isArray(plan) || !targetDailyKcal || targetDailyKcal < 800) {
    return { warnings: [], perDay: [], targetDailyKcal };
  }

  for (const day of plan) {
    const reported = Number(day.totalCalories) || 0;
    const summed = computeDayCaloriesFromMeals(day);
    const ref = reported > 0 ? reported : summed;
    const diff = Math.abs(ref - targetDailyKcal) / targetDailyKcal;

    const dayWarnings = [];
    if (diff > tolerance) {
      dayWarnings.push(
        `Day "${day.day}": total calories (${ref}) differ from target (${targetDailyKcal}) by ${Math.round(diff * 100)}%.`
      );
    }

    if (reported > 0 && summed > 0 && Math.abs(reported - summed) / Math.max(reported, 1) > 0.15) {
      dayWarnings.push(
        `Day "${day.day}": totalCalories (${reported}) vs sum of meals (${summed}) mismatch >15%.`
      );
    }

    const meals = [day.breakfast, day.lunch, day.dinner, ...(Array.isArray(day.snacks) ? day.snacks : [])].filter(
      Boolean
    );
    for (const m of meals) {
      const p = parseMacroGrams(m.protein);
      const c = parseMacroGrams(m.carbs);
      const f = parseMacroGrams(m.fats);
      const macroKcal = 4 * p + 4 * c + 9 * f;
      const kcal = Number(m.calories) || 0;
      if (kcal > 50 && macroKcal > 0 && Math.abs(macroKcal - kcal) / kcal > 0.35) {
        dayWarnings.push(
          `Meal "${m.name}": calories (${kcal}) inconsistent with macros (~${Math.round(macroKcal)} kcal from P/C/F).`
        );
      }
    }

    warnings.push(...dayWarnings);
    perDay.push({
      day: day.day,
      reportedTotal: reported,
      summedFromMeals: summed,
      target: targetDailyKcal,
      withinTarget: diff <= tolerance
    });
  }

  return { warnings, perDay, targetDailyKcal };
}
