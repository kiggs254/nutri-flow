/**
 * Post-generation checks: daily calories vs target, macro sum sanity
 * @param {object[]} plan
 */

function parseMacroGrams(s) {
  if (s == null) return 0;
  const m = String(s).match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
}

function normalizeName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getPrimaryIngredient(meal) {
  if (!meal || !Array.isArray(meal.ingredients) || meal.ingredients.length === 0) return '';
  const first = String(meal.ingredients[0] || '');
  return normalizeName(first.replace(/^([\d.]+\s*(g|kg|ml|l|cup|cups|tbsp|tsp|pcs?|pieces?)\s*)/i, ''));
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
  const tolerance = opts.toleranceRatio ?? 0.1;
  const warnings = [];
  const perDay = [];
  const target = typeof targetDailyKcal === 'object' && targetDailyKcal !== null
    ? targetDailyKcal
    : { dailyCalories: targetDailyKcal };
  const dailyCaloriesTarget = Number(target.dailyCalories) || 0;
  const macroTargets = target.macroTargets || null;
  const mealRules = target.mealRules || {};
  const mealNameCounts = new Map();
  const primaryIngredientCounts = new Map();

  if (!Array.isArray(plan) || !dailyCaloriesTarget || dailyCaloriesTarget < 800) {
    return { warnings: [], perDay: [], targetDailyKcal: dailyCaloriesTarget };
  }

  for (const day of plan) {
    const reported = Number(day.totalCalories) || 0;
    const summed = computeDayCaloriesFromMeals(day);
    const ref = reported > 0 ? reported : summed;
    const diff = Math.abs(ref - dailyCaloriesTarget) / dailyCaloriesTarget;
    let dayProtein = 0;
    let dayCarbs = 0;
    let dayFats = 0;
    const mainMeals = [day.breakfast, day.lunch, day.dinner].filter(Boolean);

    const dayWarnings = [];
    if (diff > tolerance) {
      dayWarnings.push(
        `Day "${day.day}": total calories (${ref}) differ from target (${dailyCaloriesTarget}) by ${Math.round(diff * 100)}%.`
      );
    }

    if (reported > 0 && summed > 0 && Math.abs(reported - summed) / Math.max(reported, 1) > 0.08) {
      dayWarnings.push(
        `Day "${day.day}": totalCalories (${reported}) vs sum of meals (${summed}) mismatch >8%.`
      );
    }

    const meals = [day.breakfast, day.lunch, day.dinner, ...(Array.isArray(day.snacks) ? day.snacks : [])].filter(
      Boolean
    );
    for (const m of meals) {
      const p = parseMacroGrams(m.protein);
      const c = parseMacroGrams(m.carbs);
      const f = parseMacroGrams(m.fats);
      dayProtein += p;
      dayCarbs += c;
      dayFats += f;
      const macroKcal = 4 * p + 4 * c + 9 * f;
      const kcal = Number(m.calories) || 0;
      const mealName = normalizeName(m.name);
      const primaryIngredient = getPrimaryIngredient(m);
      if (mealName) mealNameCounts.set(mealName, (mealNameCounts.get(mealName) || 0) + 1);
      if (primaryIngredient) primaryIngredientCounts.set(primaryIngredient, (primaryIngredientCounts.get(primaryIngredient) || 0) + 1);

      if (kcal > 50 && macroKcal > 0 && Math.abs(macroKcal - kcal) / kcal > 0.35) {
        dayWarnings.push(
          `Meal "${m.name}": calories (${kcal}) inconsistent with macros (~${Math.round(macroKcal)} kcal from P/C/F).`
        );
      }

      if (mealRules?.perMealTargets?.proteinG && mainMeals.includes(m)) {
        if (p < mealRules.perMealTargets.proteinG) {
          dayWarnings.push(`Meal "${m.name}": protein ${Math.round(p)}g is below per-meal target ${mealRules.perMealTargets.proteinG}g.`);
        }
      }

      if (mealRules?.perMealTargets?.calories && kcal > 0 && mainMeals.includes(m) && Math.abs(kcal - mealRules.perMealTargets.calories) / mealRules.perMealTargets.calories > 0.25) {
        dayWarnings.push(`Meal "${m.name}": calories ${kcal} differ materially from per-meal target ${mealRules.perMealTargets.calories} kcal.`);
      }

      if (Array.isArray(m.ingredientNutrition) && m.ingredientNutrition.length > 0) {
        const ingCalSum = m.ingredientNutrition.reduce((acc, ing) => acc + (Number(ing.calories) || 0), 0);
        if (kcal > 0 && Math.abs(ingCalSum - kcal) / kcal > 0.05) {
          dayWarnings.push(
            `Meal "${m.name}": ingredientNutrition sum (${Math.round(ingCalSum)} kcal) vs meal calories (${kcal} kcal) — arithmetic mismatch >5%.`
          );
        }

        const unresolved = m.ingredientNutrition.filter((ing) => ing?.dbMatched === false);
        if (unresolved.length > 0) {
          dayWarnings.push(
            `Meal "${m.name}": ${unresolved.length} ingredient(s) could not be verified against the food database (${unresolved.map((ing) => ing.item).join(', ')}).`
          );
        }
      }
    }

    if (macroTargets?.proteinG && Math.abs(dayProtein - macroTargets.proteinG) / Math.max(macroTargets.proteinG, 1) > 0.1) {
      dayWarnings.push(`Day "${day.day}": protein ${Math.round(dayProtein)}g differs from target ${macroTargets.proteinG}g by more than 10%.`);
    }
    if (macroTargets?.carbsG && Math.abs(dayCarbs - macroTargets.carbsG) / Math.max(macroTargets.carbsG, 1) > 0.1) {
      dayWarnings.push(`Day "${day.day}": carbs ${Math.round(dayCarbs)}g differs from target ${macroTargets.carbsG}g by more than 10%.`);
    }
    if (macroTargets?.fatsG && Math.abs(dayFats - macroTargets.fatsG) / Math.max(macroTargets.fatsG, 1) > 0.1) {
      dayWarnings.push(`Day "${day.day}": fats ${Math.round(dayFats)}g differs from target ${macroTargets.fatsG}g by more than 10%.`);
    }

    warnings.push(...dayWarnings);
    perDay.push({
      day: day.day,
      reportedTotal: reported,
      summedFromMeals: summed,
      target: dailyCaloriesTarget,
      withinTarget: diff <= tolerance
    });
  }

  const uniquePrimaryIngredients = primaryIngredientCounts.size;
  if (mealRules?.minUniquePrimaryIngredientsPerWeek && uniquePrimaryIngredients < mealRules.minUniquePrimaryIngredientsPerWeek) {
    warnings.push(`Weekly diversity too low: only ${uniquePrimaryIngredients} unique primary ingredients used; target is at least ${mealRules.minUniquePrimaryIngredientsPerWeek}.`);
  }

  for (const [name, count] of mealNameCounts.entries()) {
    if (count > (mealRules?.maxSameMealNamePerWeek ?? 1)) {
      warnings.push(`Meal repetition too high: "${name}" appears ${count} times this week.`);
    }
  }

  for (const [ingredient, count] of primaryIngredientCounts.entries()) {
    if (count > (mealRules?.maxSamePrimaryIngredientPerWeek ?? 2)) {
      warnings.push(`Primary ingredient repetition too high: "${ingredient}" appears ${count} times this week.`);
    }
    if (mealRules?.discourageBreadAsPrimary && /bread|toast|bun|bagel|roll/.test(ingredient) && count > 2) {
      warnings.push(`Bread-heavy plan detected: bread-like primary ingredient "${ingredient}" appears ${count} times this week.`);
    }
  }

  return { warnings, perDay, targetDailyKcal: dailyCaloriesTarget };
}
