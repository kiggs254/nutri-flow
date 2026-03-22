import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { callGemini, callGeminiChat } from '../services/gemini.js';
import { callOpenAI, callOpenAIChat, uploadFileToOpenAI, deleteOpenAIFile } from '../services/openai.js';
import { callDeepSeek, callDeepSeekChat } from '../services/deepseek.js';
import { extractKnowledgeBaseText } from '../services/knowledgeBaseExtract.js';
import { isWordDocument, isDocxFile, extractTextFromWordDoc } from '../services/wordExtractor.js';
import { extractTextFromPDF } from '../services/pdfExtractor.js';
import { computeDailyCalorieTarget } from '../services/tdeeCalculator.js';
import { retrieveNutritionContext, retrieveNutritionContextForChat } from '../services/ragRetrieval.js';
import { validatePlanNutrition } from '../services/mealPlanValidation.js';
import { ingestDocument, deleteDocumentAndEmbeddings } from '../services/documentIngestion.js';
import { createUserSupabase, createServiceSupabase } from '../services/supabaseClients.js';
import { embedText } from '../services/embeddingService.js';

const router = express.Router();

function getAccessToken(req) {
  const a = req.headers.authorization;
  return a?.startsWith('Bearer ') ? a.slice(7) : '';
}

function buildMealPlanNutritionPreamble(params, tdee, ragContext) {
  const lines = [
    `DAILY CALORIE TARGET (mandatory): ${tdee.dailyCalories} kcal/day.`,
    `Target derivation: ${tdee.source}.`,
    tdee.bmr ? `BMR used: ${tdee.bmr} kcal/day.` : '',
    tdee.tdee ? `TDEE (before goal adjustment): ${tdee.tdee} kcal/day (activity x${tdee.activityMultiplier}).` : '',
    tdee.goalAdjustment != null && tdee.goalAdjustment !== 0
      ? `Goal calorie adjustment applied: ${tdee.goalAdjustment > 0 ? '+' : ''}${tdee.goalAdjustment} kcal/day.`
      : '',
    tdee.note ? `Note: ${tdee.note}` : '',
    '',
    'Each day totalCalories must be within 15% of this target unless medically contradicted by the records.',
    'Meal calories and macros must be consistent with ingredient amounts using the VERIFIED NUTRITION DATA below when those foods appear.',
    'Do not ignore the calorie target or nutritionist instructions in favor of generic estimates.'
  ];
  if (ragContext) {
    lines.push('', ragContext);
  }
  return lines.filter(Boolean).join('\n');
}

// Get available AI providers (based on configured API keys)
router.get('/providers', authenticate, (req, res) => {
  const availableProviders = [];
  
  if (process.env.GEMINI_API_KEY) {
    availableProviders.push('gemini');
  }
  if (process.env.OPENAI_API_KEY) {
    availableProviders.push('openai');
  }
  if (process.env.DEEPSEEK_API_KEY) {
    availableProviders.push('deepseek');
  }
  
  res.json({ providers: availableProviders });
});

// --- Nutrition knowledge base (RAG) ---

router.post('/knowledge-base/upload', authenticate, async (req, res) => {
  try {
    const { title, docType, fileName, mimeType, base64Content, textContent } = req.body || {};
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    let contentText = typeof textContent === 'string' ? textContent : '';
    if (!contentText.trim()) {
      if (!base64Content || !mimeType) {
        return res.status(400).json({ error: 'Provide textContent or base64Content + mimeType' });
      }
      contentText = await extractKnowledgeBaseText({
        mimeType,
        fileName: fileName || 'upload',
        base64Content
      });
    }

    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'Missing bearer token' });

    const userSb = createUserSupabase(token);
    const result = await ingestDocument(userSb, {
      userId,
      title: title || fileName || 'Untitled document',
      contentText,
      docType: docType || 'guide',
      fileName: fileName || null,
      mimeType: mimeType || null
    });

    res.json(result);
  } catch (error) {
    console.error('KB upload error:', error);
    res.status(500).json({ error: error.message || 'Upload failed' });
  }
});

router.get('/knowledge-base/documents', authenticate, async (req, res) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'Missing bearer token' });
    const userSb = createUserSupabase(token);
    const { data, error } = await userSb
      .from('nutrition_documents')
      .select('id, title, doc_type, file_name, chunk_count, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ documents: data || [] });
  } catch (error) {
    console.error('KB list error:', error);
    res.status(500).json({ error: error.message || 'Failed to list documents' });
  }
});

router.delete('/knowledge-base/documents/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'Missing bearer token' });
    const userSb = createUserSupabase(token);
    await deleteDocumentAndEmbeddings(userSb, req.params.id, userId);
    res.json({ ok: true });
  } catch (error) {
    console.error('KB delete error:', error);
    res.status(500).json({ error: error.message || 'Delete failed' });
  }
});

router.get('/knowledge-base/stats', authenticate, async (req, res) => {
  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'Missing bearer token' });
    const userSb = createUserSupabase(token);

    const { count: myDocCount } = await userSb
      .from('nutrition_documents')
      .select('*', { count: 'exact', head: true });

    const { data: docRows } = await userSb.from('nutrition_documents').select('chunk_count');
    const myChunkCount = (docRows || []).reduce((s, r) => s + (Number(r.chunk_count) || 0), 0);

    const svc = createServiceSupabase();
    let foodsCount = 0;
    let foodEmbeddingsCount = 0;
    if (svc) {
      const { count: fc } = await svc.from('nutrition_foods').select('*', { count: 'exact', head: true });
      const { count: ec } = await svc
        .from('nutrition_embeddings')
        .select('*', { count: 'exact', head: true })
        .eq('source_type', 'food');
      foodsCount = fc || 0;
      foodEmbeddingsCount = ec || 0;
    }

    res.json({
      foodsCount,
      foodEmbeddingsCount,
      myDocumentsCount: myDocCount || 0,
      myDocumentChunksCount: myChunkCount,
      serviceRoleConfigured: !!svc
    });
  } catch (error) {
    console.error('KB stats error:', error);
    res.status(500).json({ error: error.message || 'Stats failed' });
  }
});

router.post('/knowledge-base/search', authenticate, async (req, res) => {
  try {
    const { query, matchCount } = req.body || {};
    if (!query || String(query).trim() === '') {
      return res.status(400).json({ error: 'query is required' });
    }
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'Missing bearer token' });
    const embedding = await embedText(String(query).slice(0, 8000));
    const userSb = createUserSupabase(token);
    const { data, error } = await userSb.rpc('match_nutrition_embeddings', {
      query_embedding: embedding,
      match_count: Math.min(Math.max(Number(matchCount) || 12, 1), 40)
    });
    if (error) throw error;
    res.json({ matches: data || [] });
  } catch (error) {
    console.error('KB search error:', error);
    res.status(500).json({ error: error.message || 'Search failed' });
  }
});

// Helper to convert messages format to Gemini parts format
function convertMessagesToParts(messages, images) {
  const parts = [];

  // Add images first if provided
  if (images) {
    for (const img of images) {
      parts.push({ inlineData: { data: img.data, mimeType: img.mimeType } });
    }
  }

  // Convert messages to text parts
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      parts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
      // Handle OpenAI-style content array
      for (const item of msg.content) {
        if (item.type === 'text') {
          parts.push({ text: item.text });
        } else if (item.type === 'image_url') {
          // Extract base64 from data URL
          const url = item.image_url?.url || '';
          const match = url.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            parts.push({ inlineData: { data: match[2], mimeType: match[1] } });
          }
        }
      }
    }
  }

  return parts;
}

// Generate meal plan
router.post('/generate-meal-plan', authenticate, async (req, res) => {
  try {
    const {
      provider,
      params
    } = req.body;

    if (!provider) {
      return res.status(400).json({ error: 'Provider is required' });
    }

    // Support both new excludeMeals array and legacy excludeMeal/excludeLunch for backward compatibility
    let excludedMeals = [];
    if (Array.isArray(params.excludeMeals) && params.excludeMeals.length > 0) {
      excludedMeals = params.excludeMeals;
    } else if (params.excludeMeal) {
      excludedMeals = [params.excludeMeal];
    } else if (params.excludeLunch) {
      excludedMeals = ['lunch'];
    }

    const tdee = computeDailyCalorieTarget(params);
    let ragContext = '';
    let ragMeta = null;
    const accessToken = getAccessToken(req);
    if (accessToken && params.disableRag !== true) {
      try {
        const r = await retrieveNutritionContext(accessToken, params, { matchCount: 26 });
        ragContext = r.contextBlock || '';
        ragMeta = { matchCount: r.matches?.length ?? 0, error: r.error };
      } catch (e) {
        ragMeta = { error: e.message };
      }
    }
    const nutritionPreamble = buildMealPlanNutritionPreamble(params, tdee, ragContext);

    const systemInstruction = `You are an expert nutritionist creating a 7-day meal plan.
  CRITICAL RULES:
  1. Adhere strictly to all health constraints and medical considerations.
  2. You MUST incorporate the client's Records in every decision:
     - medicalHistory
     - allergies
     - medications (and potential food/medication interactions)
     - dietaryHistory
     - socialBackground (schedule, culture, lifestyle constraints)
  3. Base meal suggestions on the client's goal and dietary history/preferences.
  4. When VERIFIED NUTRITION DATA is provided in the user message, you MUST use those kcal and macro values per 100g (and stated portions) for those foods—do not substitute different numbers for the same food.
  5. Output must be a valid JSON object matching the requested schema exactly.
  6. Instructions: MAX 10 words.
  7. Ingredients: MAX 5 items, each MUST include specific quantity.
  8. Snacks are a SEPARATE section from main meals and MUST be returned under "snacks" (array).
  9. Snacks MUST include full nutrition + instructions, same as other meals.
  10. Be concise.
  
  MANDATORY NUTRITIONAL DATA FOR EVERY MEAL:
  - calories: Must be a positive integer (e.g., 350, 450, 520)
  - protein: Must be a string with numeric value and "g" unit (e.g., "25g", "30g", "18g")
  - carbs: Must be a string with numeric value and "g" unit (e.g., "45g", "60g", "35g")
  - fats: Must be a string with numeric value and "g" unit (e.g., "12g", "15g", "8g")
  
  INGREDIENTS FORMAT - CRITICAL:
  - Each ingredient MUST include the specific quantity/weight
  - Use appropriate units: grams (g), milliliters (ml), pieces (pcs), cups, tablespoons (tbsp), teaspoons (tsp)
  - Format: "quantity unit ingredient name" (e.g., "150g chicken breast", "20g porridge", "2 eggs", "1 cup rice", "200ml milk")
  - Be specific and accurate with quantities to match the nutritional values provided
  
  Example meal format:
  {
    "name": "Grilled Chicken Salad",
    "calories": 420,
    "protein": "35g",
    "carbs": "25g",
    "fats": "18g",
    "ingredients": ["150g chicken breast", "100g mixed greens", "50g cherry tomatoes", "1 tbsp olive oil", "1 lemon wedge"],
    "instructions": "Grill chicken, toss with greens and dressing"
  }
  
  Another example:
  {
    "name": "Oatmeal Porridge",
    "calories": 280,
    "protein": "12g",
    "carbs": "45g",
    "fats": "6g",
    "ingredients": ["50g rolled oats", "200ml whole milk", "1 banana", "10g honey", "5g chia seeds"],
    "instructions": "Cook oats in milk, top with banana and honey"
  }
  
  Every breakfast, lunch, dinner, and snack MUST include:
  1. Accurate calories and macro grammages
  2. Specific quantities for ALL ingredients (e.g., "20g porridge", "150g chicken", "2 eggs", "1 cup rice")`;

    const userPrompt = `
    ${nutritionPreamble}

    Client Profile:
    - Age: ${params.age} y/o ${params.gender}
    - Current Metrics: ${params.weight}kg, ${params.height}cm
    - Metabolic Metrics (if provided): BMR ${params.bmr ?? 'Not provided'} kcal/day, Metabolic Age ${params.metabolicAge ?? 'Not provided'} yrs, Visceral Fat (level) ${params.visceralFat ?? 'Not provided'}
    - Primary Goal: ${params.goal}
    - Activity Level: ${params.activityLevel}

    Nutrition target (server-computed—follow the DAILY CALORIE TARGET above; do not replace it with a different estimate):
    - Align each day's totalCalories with the stated daily target within 15% unless contraindicated by medical records.

    Critical Health Information (MUST BE CONSIDERED):
    - Medical History: ${params.medicalHistory || 'None provided.'}
    - Current Medications: ${params.medications || 'None provided.'}
    - Allergies / Exclusions: ${params.allergies || 'None provided.'}

    Client Preferences (from history & notes):
    - Dietary History & Preferences: ${params.dietaryHistory || 'None provided.'}
    - Other Stated Preferences: ${params.preferences || 'None provided.'}

    Social & Lifestyle Context:
    - Social Background: ${params.socialBackground || 'None provided.'}
    (Includes: occupation, work schedule, living situation, family context, cultural background, lifestyle factors)

    Nutritionist's Custom Instructions:
    - ${params.customInstructions || 'None.'}

    Nutritionist notes (use for meal planning):
    - ${params.nutritionistNotes || 'None.'}
    
    ${(params.referenceData || (params.referenceDataArray && params.referenceDataArray.length > 0)) ? "Reference image(s) have been attached." : ""}
    ${params.referencePlans && params.referencePlans.length > 0 ? `\n\nThe following past meal plans are provided as reference (use for style, structure, and ideas; adapt to the current client):\n${JSON.stringify(params.referencePlans)}\n` : ''}
    
    Generate a 7-day (Mon-Sun) meal plan based on ALL the above information.${
      excludedMeals.length > 0
        ? `\n\nIMPORTANT: Do NOT include the following meals in any day of the meal plan: ${excludedMeals.join(', ')}. ${excludedMeals.includes('snacks') ? 'Set "snacks" to an empty array [] for every day.' : ''}${excludedMeals.filter(m => m !== 'snacks').length > 0 ? ` Set ${excludedMeals.filter(m => m !== 'snacks').map(m => `"${m}"`).join(', ')} to null or omit ${excludedMeals.filter(m => m !== 'snacks').length === 1 ? 'it' : 'them'} entirely.` : ''}`
        : ''
    }
    
    CRITICAL: You MUST consider and factor in ALL provided information including:
    - Medical history and conditions
    - Current medications and their potential interactions
    - All allergies and dietary restrictions
    - Dietary history and preferences
    - Social background (work schedule, lifestyle, cultural factors)
    - Activity level and goals
    
    IMPORTANT: For each meal (breakfast, lunch, dinner, and snacks), you MUST provide:
    - Exact calorie count as an integer
    - Protein in grams (format: "XXg")
    - Carbohydrates in grams (format: "XXg")
    - Fats in grams (format: "XXg")
    - Ingredients with SPECIFIC QUANTITIES: Each ingredient must include quantity and unit
      Examples: "150g chicken breast", "20g porridge", "2 eggs", "1 cup rice", "200ml milk", "1 tbsp olive oil"
    
    Calculate these values accurately based on the ingredients and portion sizes. Do not leave any nutritional values empty or as zero unless the meal truly has none.
    CRITICAL: All ingredients must specify exact quantities (e.g., "20g porridge", not just "porridge").
  `;

    const planResponseSchema = {
      type: "object",
      properties: {
        plan: {
          type: "array",
          items: {
            type: "object",
            properties: {
              day: { type: "string" },
              breakfast: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  calories: { type: "integer" },
                  protein: { type: "string" },
                  carbs: { type: "string" },
                  fats: { type: "string" },
                  ingredients: { type: "array", items: { type: "string" } },
                  instructions: { type: "string" }
                },
                required: ["name", "calories", "protein", "carbs", "fats", "ingredients", "instructions"]
              },
              lunch: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  calories: { type: "integer" },
                  protein: { type: "string" },
                  carbs: { type: "string" },
                  fats: { type: "string" },
                  ingredients: { type: "array", items: { type: "string" } },
                  instructions: { type: "string" }
                },
                required: ["name", "calories", "protein", "carbs", "fats", "ingredients", "instructions"]
              },
              dinner: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  calories: { type: "integer" },
                  protein: { type: "string" },
                  carbs: { type: "string" },
                  fats: { type: "string" },
                  ingredients: { type: "array", items: { type: "string" } },
                  instructions: { type: "string" }
                },
                required: ["name", "calories", "protein", "carbs", "fats", "ingredients", "instructions"]
              },
              snacks: { type: "array", items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  calories: { type: "integer" },
                  protein: { type: "string" },
                  carbs: { type: "string" },
                  fats: { type: "string" },
                  ingredients: { type: "array", items: { type: "string" } },
                  instructions: { type: "string" }
                },
                required: ["name", "calories", "protein", "carbs", "fats", "ingredients", "instructions"]
              }},
              totalCalories: { type: "integer" },
              summary: { type: "string" }
            },
            required: ["day", "breakfast", "lunch", "dinner", "snacks", "totalCalories", "summary"]
          }
        }
      },
      required: ["plan"]
    };

    let resultText;

    if (provider === 'gemini') {
      const parts = [{ text: userPrompt }];
      if (params.referenceData) {
        parts.push(params.referenceData);
      }
      if (params.referenceDataArray && params.referenceDataArray.length > 0) {
        for (const ref of params.referenceDataArray) {
          parts.push(ref);
        }
      }

      resultText = await callGemini({
        systemInstruction,
        parts,
        responseSchema: planResponseSchema,
        responseMimeType: 'application/json',
        temperature: 0.7,
        maxOutputTokens: 8192
      });
    } else {
      const excludeInstruction = excludedMeals.length > 0
        ? `\nIMPORTANT: Do NOT include the following meals in the meal plan: ${excludedMeals.join(', ')}. ${excludedMeals.includes('snacks') ? 'Set "snacks" to an empty array [] for every day.' : ''}${excludedMeals.filter(m => m !== 'snacks').length > 0 ? ` Set ${excludedMeals.filter(m => m !== 'snacks').map(m => `"${m}"`).join(', ')} to null or omit ${excludedMeals.filter(m => m !== 'snacks').length === 1 ? 'it' : 'them'} entirely.` : ''}`
        : '';

      const openAISystemPrompt = systemInstruction + `

JSON OUTPUT FORMAT (MANDATORY):
- Return a single JSON object with a top-level key "plan"
- "plan" must be an array of 7 items (one per day), where each item has this exact structure:
  {
    "day": "Monday",
    "breakfast": ${excludedMeals.includes('breakfast') ? 'null' : '{ /* Meal object */ }'},
    "lunch": ${excludedMeals.includes('lunch') ? 'null' : '{ /* Meal object */ }'},
    "dinner": ${excludedMeals.includes('dinner') ? 'null' : '{ /* Meal object */ }'},
    "snacks": ${excludedMeals.includes('snacks') ? '[]' : '[ /* array of Meal objects */ ]'}
  }
- Do NOT use a "meals" array – you MUST use the separate keys "breakfast", "lunch", "dinner", and "snacks".
- Snacks must be a SEPARATE section under "snacks" (array). Do NOT merge snacks into breakfast/lunch/dinner.
- REMEMBER: Every ingredient in the ingredients array MUST include specific quantities (e.g., "150g chicken breast", "20g porridge", "2 eggs", "1 cup rice").${excludeInstruction}
`;

      const imageParts = [];
      if (params.referenceData) {
        imageParts.push({ data: params.referenceData.inlineData.data, mimeType: params.referenceData.inlineData.mimeType });
      }
      if (params.referenceDataArray && params.referenceDataArray.length > 0) {
        for (const ref of params.referenceDataArray) {
          if (ref && ref.inlineData) {
            imageParts.push({ data: ref.inlineData.data, mimeType: ref.inlineData.mimeType });
          }
        }
      }
      const imageBase64 = imageParts.length > 0 ? imageParts[0].data : undefined;
      const mimeType = imageParts.length > 0 ? imageParts[0].mimeType : undefined;

      if (provider === 'openai') {
        resultText = await callOpenAI({
          systemPrompt: openAISystemPrompt,
          userPrompt,
          imageBase64,
          mimeType,
          imageParts: imageParts.length > 0 ? imageParts : undefined,
          jsonMode: true,
          model: 'gpt-4o',
          temperature: 0.7,
          maxTokens: 4096
        });
      } else {
        resultText = await callDeepSeek({
          systemPrompt: openAISystemPrompt,
          userPrompt,
          imageBase64,
          mimeType,
          imageParts: imageParts.length > 0 ? imageParts : undefined,
          jsonMode: true,
          temperature: 0.7,
          maxTokens: 4096
        });
      }
    }

    // Parse and normalize the response
    const parsed = JSON.parse(resultText || '{}');

    const normalizeEntryToDailyPlan = (entry) => {
      if (!entry || typeof entry !== 'object') {
        throw new Error('Invalid plan entry format from model.');
      }

      const anyEntry = entry;
      const day = anyEntry.day ?? 'Day';

      let breakfast = anyEntry.breakfast;
      let lunch = anyEntry.lunch;
      let dinner = anyEntry.dinner;
      let snacks = Array.isArray(anyEntry.snacks) ? anyEntry.snacks : [];

      // If model used a generic "meals" array instead of breakfast/lunch/dinner
      const meals = Array.isArray(anyEntry.meals) ? anyEntry.meals : undefined;
      if (!breakfast && !lunch && !dinner && meals && meals.length) {
        // Assign meals based on what's excluded
        let mealIndex = 0;
        if (!excludedMeals.includes('breakfast')) {
          breakfast = meals[mealIndex] ?? null;
          mealIndex++;
        } else {
          breakfast = null;
        }
        if (!excludedMeals.includes('lunch')) {
          lunch = meals[mealIndex] ?? null;
          mealIndex++;
        } else {
          lunch = null;
        }
        if (!excludedMeals.includes('dinner')) {
          dinner = meals[mealIndex] ?? null;
          mealIndex++;
        } else {
          dinner = null;
        }
        // Add remaining meals as snacks if snacks are not excluded
        if (!excludedMeals.includes('snacks')) {
          const extraSnacks = meals.slice(mealIndex);
          if (extraSnacks.length > 0) snacks = snacks.concat(extraSnacks);
        }
      } else {
        // Apply exclusions to individual meal fields
        if (excludedMeals.includes('breakfast')) breakfast = null;
        if (excludedMeals.includes('lunch')) lunch = null;
        if (excludedMeals.includes('dinner')) dinner = null;
        if (excludedMeals.includes('snacks')) snacks = [];
      }

      if (!Array.isArray(snacks)) {
        snacks = [];
      }

      // Calculate totalCalories from all meals if not provided
      let totalCalories = anyEntry.totalCalories;
      if (!totalCalories || totalCalories === 0) {
        totalCalories = 0;
        if (breakfast?.calories) totalCalories += breakfast.calories;
        if (lunch?.calories) totalCalories += lunch.calories;
        if (dinner?.calories) totalCalories += dinner.calories;
        if (Array.isArray(snacks)) {
          snacks.forEach((snack) => {
            if (snack?.calories) totalCalories += snack.calories;
          });
        }
      }

      return {
        day,
        breakfast,
        lunch,
        dinner,
        snacks,
        totalCalories,
        summary: anyEntry.summary ?? ''
      };
    };

    let plan;
    if (Array.isArray(parsed.plan)) {
      plan = parsed.plan.map(normalizeEntryToDailyPlan);
    } else if (Array.isArray(parsed)) {
      plan = parsed.map(normalizeEntryToDailyPlan);
    } else {
      throw new Error("Response structure did not match expected schema. Expected { plan: DailyPlan[] }.");
    }

    const nutritionValidation = validatePlanNutrition(plan, tdee.dailyCalories);
    res.json({
      plan,
      nutritionTargets: tdee,
      nutritionValidation,
      rag: {
        used: Boolean(ragContext),
        matchCount: ragMeta?.matchCount,
        error: ragMeta?.error
      }
    });
  } catch (error) {
    console.error('Generate meal plan error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate meal plan' });
  }
});

// Refine an existing meal plan with custom instructions (before saving)
router.post('/refine-meal-plan', authenticate, async (req, res) => {
  try {
    const { provider, params, plan, instructions } = req.body || {};

    if (!provider) return res.status(400).json({ error: 'Provider is required' });
    if (!params) return res.status(400).json({ error: 'params is required' });
    if (!Array.isArray(plan) || plan.length === 0) return res.status(400).json({ error: 'plan must be a non-empty array' });
    if (!instructions || String(instructions).trim() === '') return res.status(400).json({ error: 'instructions is required' });

    // Keep exclusions consistent with generate-meal-plan
    let excludedMeals = [];
    if (Array.isArray(params.excludeMeals) && params.excludeMeals.length > 0) {
      excludedMeals = params.excludeMeals;
    } else if (params.excludeMeal) {
      excludedMeals = [params.excludeMeal];
    } else if (params.excludeLunch) {
      excludedMeals = ['lunch'];
    }

    const tdee = computeDailyCalorieTarget(params);
    let ragContext = '';
    let ragMeta = null;
    const refineAccessToken = getAccessToken(req);
    if (refineAccessToken && params.disableRag !== true) {
      try {
        const r = await retrieveNutritionContext(refineAccessToken, params, { matchCount: 26 });
        ragContext = r.contextBlock || '';
        ragMeta = { matchCount: r.matches?.length ?? 0, error: r.error };
      } catch (e) {
        ragMeta = { error: e.message };
      }
    }
    const nutritionPreamble = buildMealPlanNutritionPreamble(params, tdee, ragContext);

    const systemInstruction = `You are an expert nutritionist creating a 7-day meal plan.
  CRITICAL RULES:
  1. Adhere strictly to all health constraints and medical considerations.
  2. You MUST incorporate the client's Records in every decision:
     - medicalHistory
     - allergies
     - medications (and potential food/medication interactions)
     - dietaryHistory
     - socialBackground (schedule, culture, lifestyle constraints)
  3. Base meal suggestions on the client's goal and dietary history/preferences.
  4. When VERIFIED NUTRITION DATA is provided in the user message, you MUST use those kcal and macro values per 100g (and stated portions) for those foods—do not substitute different numbers for the same food.
  5. Output must be a valid JSON object matching the requested schema exactly.
  6. Instructions: MAX 10 words.
  7. Ingredients: MAX 5 items, each MUST include specific quantity.
  8. Snacks are a SEPARATE section from main meals and MUST be returned under "snacks" (array).
  9. Snacks MUST include full nutrition + instructions, same as other meals.
  10. Be concise.
  
  MANDATORY NUTRITIONAL DATA FOR EVERY MEAL:
  - calories: Must be a positive integer (e.g., 350, 450, 520)
  - protein: Must be a string with numeric value and "g" unit (e.g., "25g", "30g", "18g")
  - carbs: Must be a string with numeric value and "g" unit (e.g., "45g", "60g", "35g")
  - fats: Must be a string with numeric value and "g" unit (e.g., "12g", "15g", "8g")
  
  INGREDIENTS FORMAT - CRITICAL:
  - Each ingredient MUST include the specific quantity/weight
  - Use appropriate units: grams (g), milliliters (ml), pieces (pcs), cups, tablespoons (tbsp), teaspoons (tsp)
  - Format: "quantity unit ingredient name" (e.g., "150g chicken breast", "20g porridge", "2 eggs", "1 cup rice", "200ml milk")
  - Be specific and accurate with quantities to match the nutritional values provided
  
  Every breakfast, lunch, dinner, and snack MUST include:
  1. Accurate calories and macro grammages
  2. Specific quantities for ALL ingredients (e.g., "20g porridge", "150g chicken", "2 eggs", "1 cup rice")`;

    const userPrompt = `
    ${nutritionPreamble}

    Client Profile:
    - Age: ${params.age} y/o ${params.gender}
    - Current Metrics: ${params.weight}kg, ${params.height}cm
    - Metabolic Metrics (if provided): BMR ${params.bmr ?? 'Not provided'} kcal/day, Metabolic Age ${params.metabolicAge ?? 'Not provided'} yrs, Visceral Fat (level) ${params.visceralFat ?? 'Not provided'}
    - Primary Goal: ${params.goal}
    - Activity Level: ${params.activityLevel}

    Nutrition target (server-computed—follow the DAILY CALORIE TARGET above):
    - Keep each day's totalCalories aligned with that target within 15% unless contraindicated by medical records.

    Records (MUST BE CONSIDERED):
    - Medical History: ${params.medicalHistory || 'None provided.'}
    - Current Medications: ${params.medications || 'None provided.'}
    - Allergies / Exclusions: ${params.allergies || 'None provided.'}
    - Dietary History: ${params.dietaryHistory || 'None provided.'}
    - Social Background: ${params.socialBackground || 'None provided.'}

    Nutritionist notes (use for meal planning):
    - ${params.nutritionistNotes || 'None.'}

    Existing meal plan JSON (edit this plan):
    ${JSON.stringify(plan)}

    Requested changes:
    ${String(instructions).trim()}

    Return the FULL updated 7-day plan as valid JSON in the required format.${
      excludedMeals.length > 0
        ? `\nIMPORTANT: Meals excluded for every day: ${excludedMeals.join(', ')}. ${excludedMeals.includes('snacks') ? 'Set "snacks" to [] for every day.' : ''}`
        : ''
    }
  `;

    const planResponseSchema = {
      type: "object",
      properties: {
        plan: {
          type: "array",
          items: {
            type: "object",
            properties: {
              day: { type: "string" },
              breakfast: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  calories: { type: "integer" },
                  protein: { type: "string" },
                  carbs: { type: "string" },
                  fats: { type: "string" },
                  ingredients: { type: "array", items: { type: "string" } },
                  instructions: { type: "string" }
                },
                required: ["name", "calories", "protein", "carbs", "fats", "ingredients", "instructions"]
              },
              lunch: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  calories: { type: "integer" },
                  protein: { type: "string" },
                  carbs: { type: "string" },
                  fats: { type: "string" },
                  ingredients: { type: "array", items: { type: "string" } },
                  instructions: { type: "string" }
                },
                required: ["name", "calories", "protein", "carbs", "fats", "ingredients", "instructions"]
              },
              dinner: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  calories: { type: "integer" },
                  protein: { type: "string" },
                  carbs: { type: "string" },
                  fats: { type: "string" },
                  ingredients: { type: "array", items: { type: "string" } },
                  instructions: { type: "string" }
                },
                required: ["name", "calories", "protein", "carbs", "fats", "ingredients", "instructions"]
              },
              snacks: { type: "array", items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  calories: { type: "integer" },
                  protein: { type: "string" },
                  carbs: { type: "string" },
                  fats: { type: "string" },
                  ingredients: { type: "array", items: { type: "string" } },
                  instructions: { type: "string" }
                },
                required: ["name", "calories", "protein", "carbs", "fats", "ingredients", "instructions"]
              }},
              totalCalories: { type: "integer" },
              summary: { type: "string" }
            },
            required: ["day", "breakfast", "lunch", "dinner", "snacks", "totalCalories", "summary"]
          }
        }
      },
      required: ["plan"]
    };

    const excludeInstruction = excludedMeals.length > 0
      ? `\nIMPORTANT: Do NOT include the following meals in the meal plan: ${excludedMeals.join(', ')}. ${excludedMeals.includes('snacks') ? 'Set "snacks" to an empty array [] for every day.' : ''}${excludedMeals.filter(m => m !== 'snacks').length > 0 ? ` Set ${excludedMeals.filter(m => m !== 'snacks').map(m => `"${m}"`).join(', ')} to null or omit ${excludedMeals.filter(m => m !== 'snacks').length === 1 ? 'it' : 'them'} entirely.` : ''}`
      : '';

    const openAISystemPrompt = systemInstruction + `

JSON OUTPUT FORMAT (MANDATORY):
- Return a single JSON object with a top-level key "plan"
- "plan" must be an array of 7 items (one per day), where each item has this exact structure:
  {
    "day": "Monday",
    "breakfast": ${excludedMeals.includes('breakfast') ? 'null' : '{ /* Meal object */ }'},
    "lunch": ${excludedMeals.includes('lunch') ? 'null' : '{ /* Meal object */ }'},
    "dinner": ${excludedMeals.includes('dinner') ? 'null' : '{ /* Meal object */ }'},
    "snacks": ${excludedMeals.includes('snacks') ? '[]' : '[ /* array of Meal objects */ ]'}
  }
- Do NOT use a "meals" array – you MUST use the separate keys "breakfast", "lunch", "dinner", and "snacks".
- Snacks must be a SEPARATE section under "snacks" (array). Do NOT merge snacks into breakfast/lunch/dinner.
- REMEMBER: Every ingredient in the ingredients array MUST include specific quantities (e.g., "150g chicken breast", "20g porridge", "2 eggs", "1 cup rice").${excludeInstruction}
`;

    let resultText;
    if (provider === 'gemini') {
      resultText = await callGemini({
        systemInstruction,
        parts: [{ text: userPrompt }],
        responseSchema: planResponseSchema,
        responseMimeType: 'application/json',
        temperature: 0.7,
        maxOutputTokens: 8192
      });
    } else if (provider === 'openai') {
      resultText = await callOpenAI({
        systemPrompt: openAISystemPrompt,
        userPrompt,
        jsonMode: true,
        model: 'gpt-4o',
        temperature: 0.7,
        maxTokens: 4096
      });
    } else {
      resultText = await callDeepSeek({
        systemPrompt: openAISystemPrompt,
        userPrompt,
        jsonMode: true,
        temperature: 0.7,
        maxTokens: 4096
      });
    }

    const parsed = JSON.parse(resultText || '{}');

    const normalizeEntryToDailyPlan = (entry) => {
      if (!entry || typeof entry !== 'object') {
        throw new Error('Invalid plan entry format from model.');
      }

      const anyEntry = entry;
      const day = anyEntry.day ?? 'Day';

      let breakfast = anyEntry.breakfast;
      let lunch = anyEntry.lunch;
      let dinner = anyEntry.dinner;
      let snacks = Array.isArray(anyEntry.snacks) ? anyEntry.snacks : [];

      const meals = Array.isArray(anyEntry.meals) ? anyEntry.meals : undefined;
      if (!breakfast && !lunch && !dinner && meals && meals.length) {
        let mealIndex = 0;
        if (!excludedMeals.includes('breakfast')) {
          breakfast = meals[mealIndex] ?? null;
          mealIndex++;
        } else {
          breakfast = null;
        }
        if (!excludedMeals.includes('lunch')) {
          lunch = meals[mealIndex] ?? null;
          mealIndex++;
        } else {
          lunch = null;
        }
        if (!excludedMeals.includes('dinner')) {
          dinner = meals[mealIndex] ?? null;
          mealIndex++;
        } else {
          dinner = null;
        }
        if (!excludedMeals.includes('snacks')) {
          const extraSnacks = meals.slice(mealIndex);
          if (extraSnacks.length > 0) snacks = snacks.concat(extraSnacks);
        }
      } else {
        if (excludedMeals.includes('breakfast')) breakfast = null;
        if (excludedMeals.includes('lunch')) lunch = null;
        if (excludedMeals.includes('dinner')) dinner = null;
        if (excludedMeals.includes('snacks')) snacks = [];
      }

      if (!Array.isArray(snacks)) {
        snacks = [];
      }

      let totalCalories = anyEntry.totalCalories;
      if (!totalCalories || totalCalories === 0) {
        totalCalories = 0;
        if (breakfast?.calories) totalCalories += breakfast.calories;
        if (lunch?.calories) totalCalories += lunch.calories;
        if (dinner?.calories) totalCalories += dinner.calories;
        if (Array.isArray(snacks)) {
          snacks.forEach((snack) => {
            if (snack?.calories) totalCalories += snack.calories;
          });
        }
      }

      return {
        day,
        breakfast,
        lunch,
        dinner,
        snacks,
        totalCalories,
        summary: anyEntry.summary ?? ''
      };
    };

    let refinedPlan;
    if (Array.isArray(parsed.plan)) {
      refinedPlan = parsed.plan.map(normalizeEntryToDailyPlan);
    } else if (Array.isArray(parsed)) {
      refinedPlan = parsed.map(normalizeEntryToDailyPlan);
    } else {
      throw new Error("Response structure did not match expected schema. Expected { plan: DailyPlan[] }.");
    }

    const nutritionValidation = validatePlanNutrition(refinedPlan, tdee.dailyCalories);
    res.json({
      plan: refinedPlan,
      nutritionTargets: tdee,
      nutritionValidation,
      rag: {
        used: Boolean(ragContext),
        matchCount: ragMeta?.matchCount,
        error: ragMeta?.error
      }
    });
  } catch (error) {
    console.error('Refine meal plan error:', error);
    res.status(500).json({ error: error.message || 'Failed to refine meal plan' });
  }
});

// Analyze food image
router.post('/analyze-food-image', authenticate, async (req, res) => {
  try {
    const {
      provider,
      base64Image,
      mimeType,
      clientNote,
      goal
    } = req.body;

    if (!provider) {
      return res.status(400).json({ error: 'Provider is required' });
    }

    // Validate and default goal parameter
    const validatedGoal = goal || 'General Health';

    // Validate that mimeType is provided when base64Image is present
    if (base64Image && !mimeType) {
      return res.status(400).json({ error: 'mimeType is required when base64Image is provided' });
    }

    let promptText = "";
    if (base64Image && clientNote) {
      promptText = `Analyze this meal image and the client's note. The client's goal is: ${validatedGoal}. Client's note: "${clientNote}". 
      1. Based on BOTH the image and note, estimate calories and macros (Protein/Carbs/Fats). 
      2. Is this good for their goal? 
      3. Give 1 constructive suggestion. 
      Keep it under 100 words.`;
    } else if (base64Image) {
      promptText = `Analyze this meal image. The client's goal is: ${validatedGoal}. 
      1. Estimate calories and macros (Protein/Carbs/Fats). 
      2. Is this good for their goal? 
      3. Give 1 constructive suggestion. 
      Keep it under 100 words.`;
    } else if (clientNote) {
      promptText = `Analyze this client's food description. The client's goal is: ${validatedGoal}. Client's description: "${clientNote}".
      1. Based on the description, estimate calories and macros (Protein/Carbs/Fats). 
      2. Is this good for their goal? 
      3. Give 1 constructive suggestion. 
      Keep it under 100 words.`;
    } else {
      return res.status(400).json({ error: 'Please provide an image or a description of your meal.' });
    }

    // DeepSeek doesn't support image inputs - return error if image is provided
    if (provider === 'deepseek' && base64Image) {
      return res.status(400).json({ 
        error: 'DeepSeek does not support image analysis. Please use Gemini or OpenAI for image analysis, or provide a text description instead.' 
      });
    }

    let resultText;

    if (provider === 'gemini') {
      const parts = [];
      if (base64Image && mimeType) {
        parts.push({ inlineData: { data: base64Image, mimeType } });
      }
      parts.push({ text: promptText });

      resultText = await callGemini({
        systemInstruction: "You are an expert nutritionist.",
        parts,
        temperature: 0.7
      });
    } else {
      if (provider === 'openai') {
        resultText = await callOpenAI({
          systemPrompt: "You are an expert nutritionist.",
          userPrompt: promptText,
          imageBase64: base64Image || undefined,
          mimeType: mimeType || undefined,
          jsonMode: false,
          model: 'gpt-4o',
          temperature: 0.7
        });
      } else {
        // DeepSeek - text only (image check already done above)
        resultText = await callDeepSeek({
          systemPrompt: "You are an expert nutritionist.",
          userPrompt: promptText,
          imageBase64: undefined,
          mimeType: undefined,
          jsonMode: false,
          temperature: 0.7
        });
      }
    }

    res.json({ result: resultText || "Could not analyze meal." });
  } catch (error) {
    console.error('Analyze food image error:', {
      message: error.message,
      stack: error.stack,
      provider: req.body?.provider,
      hasImage: !!req.body?.base64Image,
      hasNote: !!req.body?.clientNote
    });
    res.status(500).json({ 
      error: error.message || 'Failed to analyze food image',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Analyze medical document
router.post('/analyze-medical-document', authenticate, async (req, res) => {
  try {
    const {
      provider,
      fileContent,
      mimeType,
      isImage
    } = req.body;

    if (!provider) {
      return res.status(400).json({ error: 'Provider is required' });
    }

    // DeepSeek doesn't support image inputs - return error if image is provided
    if (provider === 'deepseek' && isImage) {
      return res.status(400).json({ 
        error: 'DeepSeek does not support image analysis. Please use Gemini or OpenAI for image analysis, or provide a text document instead.' 
      });
    }

    const systemInstruction = `You are a medical records analyst. Extract relevant information from the provided document and return it in a structured JSON format.`;

    const prompt = `Analyze this ${isImage ? 'image' : 'document'} and extract the following information if present:
  
  1. Medical History: Any past or current medical conditions, diagnoses, surgeries, or health issues.
  2. Allergies: Any food allergies, medication allergies, or other allergic reactions mentioned.
  3. Medications: Current medications, dosages, and frequency.
  4. Dietary History: Previous diets tried, food preferences, dietary restrictions, eating patterns.
  5. Social Background: Occupation, work schedule, living situation, family context, cultural background, lifestyle factors that may affect nutrition.
  
  Return ONLY a valid JSON object with these exact keys (use empty strings if information is not found):
  {
    "medicalHistory": "...",
    "allergies": "...",
    "medications": "...",
    "dietaryHistory": "...",
    "socialBackground": "..."
  }`;

    let resultText;

    if (provider === 'gemini') {
      const parts = [];
      if (isImage && mimeType) {
        parts.push({ inlineData: { data: fileContent, mimeType } });
      } else {
        parts.push({ text: fileContent });
      }
      parts.push({ text: prompt });

      resultText = await callGemini({
        systemInstruction,
        parts,
        responseSchema: {
          type: "object",
          properties: {
            medicalHistory: { type: "string" },
            allergies: { type: "string" },
            medications: { type: "string" },
            dietaryHistory: { type: "string" },
            socialBackground: { type: "string" }
          },
          required: []
        },
        responseMimeType: 'application/json',
        temperature: 0.7
      });
    } else {
      // Check if mimeType is actually an image type (OpenAI vision API only supports image types)
      const isActualImageType = mimeType && (
        mimeType.startsWith('image/') ||
        mimeType === 'image/jpeg' ||
        mimeType === 'image/png' ||
        mimeType === 'image/gif' ||
        mimeType === 'image/webp'
      );

      const isPDF = mimeType === 'application/pdf';
      const isWordDoc = isWordDocument(mimeType);

      if (provider === 'openai') {
        let openAIFileId = null;
        
        try {
          // Handle PDFs by extracting text (OpenAI vision API doesn't accept PDFs directly)
          if (isPDF) {
            // Convert base64 to Buffer
            const fileBuffer = Buffer.from(fileContent, 'base64');
            
            // Extract text from PDF
            const extractedText = await extractTextFromPDF(fileBuffer);
            
            // Send extracted text as regular text content
            const fullPrompt = `Document content:\n${extractedText}\n\n${prompt}`;
            
            resultText = await callOpenAI({
              systemPrompt: systemInstruction,
              userPrompt: fullPrompt,
              jsonMode: true,
              model: 'gpt-4o',
              temperature: 0.7
            });
          }
          // Handle Word documents by extracting text
          else if (isWordDoc) {
            if (!isDocxFile(mimeType)) {
              return res.status(400).json({ 
                error: 'Only .docx files are supported. Please convert .doc files to .docx format or use a text file instead.' 
              });
            }
            
            // Convert base64 to Buffer
            const fileBuffer = Buffer.from(fileContent, 'base64');
            
            // Extract text from Word document
            const extractedText = await extractTextFromWordDoc(fileBuffer);
            
            // Send extracted text as regular text content
            const fullPrompt = `Document content:\n${extractedText}\n\n${prompt}`;
            
            resultText = await callOpenAI({
              systemPrompt: systemInstruction,
              userPrompt: fullPrompt,
              jsonMode: true,
              model: 'gpt-4o',
              temperature: 0.7
            });
          }
          // Handle images using vision API
          else if (isImage && isActualImageType) {
            resultText = await callOpenAI({
              systemPrompt: systemInstruction,
              userPrompt: prompt,
              imageBase64: fileContent,
              mimeType: mimeType,
              jsonMode: true,
              model: 'gpt-4o',
              temperature: 0.7
            });
          }
          // Handle text files
          else {
            const fullPrompt = `Document content:\n${fileContent}\n\n${prompt}`;
            resultText = await callOpenAI({
              systemPrompt: systemInstruction,
              userPrompt: fullPrompt,
              jsonMode: true,
              model: 'gpt-4o',
              temperature: 0.7
            });
          }
        } finally {
          // Clean up: delete uploaded file from OpenAI if it was uploaded
          if (openAIFileId) {
            await deleteOpenAIFile(openAIFileId).catch(err => {
              console.warn('Failed to delete OpenAI file:', err);
            });
          }
        }
      } else {
        // DeepSeek - text only (image check already done above)
        const shouldSendAsImage = isImage && isActualImageType;
        const fullPrompt = shouldSendAsImage ? prompt : `Document content:\n${fileContent}\n\n${prompt}`;
        
        resultText = await callDeepSeek({
          systemPrompt: systemInstruction,
          userPrompt: fullPrompt,
          imageBase64: undefined,
          mimeType: undefined,
          jsonMode: true,
          temperature: 0.7
        });
      }
    }

    const parsed = JSON.parse(resultText || '{}');
    res.json({
      medicalHistory: parsed.medicalHistory || '',
      allergies: parsed.allergies || '',
      medications: parsed.medications || '',
      dietaryHistory: parsed.dietaryHistory || '',
      socialBackground: parsed.socialBackground || ''
    });
  } catch (error) {
    console.error('Analyze medical document error:', error);
    res.status(500).json({ error: error.message || 'Failed to analyze document' });
  }
});

const NUTRITIONIST_CHAT_SYSTEM = `You are an expert registered dietitian and nutrition coach helping a fellow nutrition professional. Be accurate, practical, and concise. Use bullet points when helpful.

Rules:
- When VERIFIED NUTRITION REFERENCE data is provided below, prefer those numbers for foods and portions; do not invent conflicting values.
- You are not a substitute for medical care; encourage consulting physicians for diagnoses, medications, and acute conditions.
- Do not claim to diagnose disease.`;

async function loadClientForChat(token, userId, clientId) {
  if (!clientId) return null;
  const svc = createServiceSupabase();
  if (svc) {
    const { data: adm } = await svc.from('super_admins').select('user_id').eq('user_id', userId).maybeSingle();
    if (adm) {
      const { data: c } = await svc.from('clients').select('*').eq('id', clientId).maybeSingle();
      return c || null;
    }
  }
  const userSb = createUserSupabase(token);
  const { data: c } = await userSb.from('clients').select('*').eq('id', clientId).maybeSingle();
  return c || null;
}

// AI Nutritionist chat (RAG-augmented)
router.post('/nutritionist-chat', authenticate, async (req, res) => {
  try {
    const { provider, messages, clientId } = req.body || {};

    if (!provider) {
      return res.status(400).json({ error: 'Provider is required' });
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages must be a non-empty array' });
    }

    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: 'Missing bearer token' });

    const capped = messages.slice(-16).filter((m) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'));
    if (!capped.length) {
      return res.status(400).json({ error: 'No valid messages' });
    }

    const lastUser = [...capped].reverse().find((m) => m.role === 'user');
    const userMessage = lastUser?.content || '';

    const clientRow = await loadClientForChat(token, req.user.id, clientId);
    const clientSnapshot = clientRow
      ? {
          goal: clientRow.goal,
          allergies: clientRow.allergies,
          preferences: clientRow.preferences,
          dietaryHistory: clientRow.dietary_history
        }
      : null;

    const rag = await retrieveNutritionContextForChat(token, { userMessage, clientSnapshot }, { matchCount: 18 });
    const systemWithRag = rag.contextBlock
      ? `${NUTRITIONIST_CHAT_SYSTEM}\n\n${rag.contextBlock}`
      : NUTRITIONIST_CHAT_SYSTEM;

    let reply;

    if (provider === 'gemini') {
      const contents = [];
      for (const m of capped) {
        if (m.role === 'assistant') {
          contents.push({ role: 'model', parts: [{ text: m.content }] });
        } else {
          contents.push({ role: 'user', parts: [{ text: m.content }] });
        }
      }
      reply = await callGeminiChat({
        systemInstruction: systemWithRag,
        contents,
        temperature: 0.65,
        maxOutputTokens: 4096
      });
    } else if (provider === 'openai') {
      const oaMessages = [{ role: 'system', content: systemWithRag }];
      for (const m of capped) {
        oaMessages.push({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content
        });
      }
      reply = await callOpenAIChat({
        messages: oaMessages,
        model: 'gpt-4o',
        temperature: 0.65,
        maxTokens: 4096
      });
    } else {
      const dsMessages = [{ role: 'system', content: systemWithRag }];
      for (const m of capped) {
        dsMessages.push({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content
        });
      }
      reply = await callDeepSeekChat({
        messages: dsMessages,
        temperature: 0.65,
        maxTokens: 4096
      });
    }

    res.json({
      reply: reply || '',
      ragUsed: Boolean(rag.contextBlock),
      ragError: rag.error || undefined
    });
  } catch (error) {
    console.error('Nutritionist chat error:', error);
    res.status(500).json({ error: error.message || 'Chat failed' });
  }
});

// Generate client insights
router.post('/generate-insights', authenticate, async (req, res) => {
  try {
    const {
      provider,
      clientName,
      weightHistory,
      goal
    } = req.body;

    if (!provider) {
      return res.status(400).json({ error: 'Provider is required' });
    }

    const prompt = `Client ${clientName} has the following weight history (newest last): ${weightHistory.join(' -> ')} kg. 
          Goal: ${goal}. 
          Provide a 3-sentence professional insight on their progress and a motivational tip.`;

    let resultText;

    if (provider === 'gemini') {
      resultText = await callGemini({
        systemInstruction: "You are a professional nutrition coach.",
        parts: [{ text: prompt }],
        temperature: 0.7
      });
    } else if (provider === 'openai') {
      resultText = await callOpenAI({
        systemPrompt: "You are a professional nutrition coach.",
        userPrompt: prompt,
        jsonMode: false,
        model: 'gpt-4o',
        temperature: 0.7
      });
    } else {
      resultText = await callDeepSeek({
        systemPrompt: "You are a professional nutrition coach.",
        userPrompt: prompt,
        jsonMode: false,
        temperature: 0.7
      });
    }

    res.json({ result: resultText || "No insights available." });
  } catch (error) {
    console.error('Generate insights error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate insights' });
  }
});

export default router;
