import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { callGemini } from '../services/gemini.js';
import { callOpenAI, uploadFileToOpenAI, deleteOpenAIFile } from '../services/openai.js';
import { callDeepSeek } from '../services/deepseek.js';
import { extractTextFromWordDoc, isWordDocument, isDocxFile } from '../services/wordExtractor.js';
import { extractTextFromPDF } from '../services/pdfExtractor.js';

const router = express.Router();

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

    const excludedMeal = params.excludeMeal ?? (params.excludeLunch ? 'lunch' : null);

    const systemInstruction = `You are an expert nutritionist creating a 7-day meal plan.
  CRITICAL RULES:
  1. Adhere strictly to all health constraints, allergies, and medication interactions.
  2. Base meal suggestions on the client's goal and dietary history for preference.
  3. Output must be a valid JSON object matching the requested schema exactly.
  4. Instructions: MAX 10 words.
  5. Ingredients: MAX 5 items, each MUST include specific quantity.
  6. Snacks: Name & ingredients only (with quantities).
  7. Be concise.
  
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
    Client Profile:
    - Age: ${params.age} y/o ${params.gender}
    - Current Metrics: ${params.weight}kg, ${params.height}cm
    - Primary Goal: ${params.goal}
    - Activity Level: ${params.activityLevel}

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
    
    ${params.referenceData ? "An image has been attached as reference material." : ""}
    
    Generate a 7-day (Mon-Sun) meal plan based on ALL the above information.${
      excludedMeal
        ? `\n\nIMPORTANT: Do NOT include ${excludedMeal} in any day of the meal plan. ${excludedMeal === 'snacks' ? 'Set "snacks" to an empty array [] for every day.' : `Set "${excludedMeal}" to null or omit it entirely.`}`
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

      resultText = await callGemini({
        systemInstruction,
        parts,
        responseSchema: planResponseSchema,
        responseMimeType: 'application/json',
        temperature: 0.7,
        maxOutputTokens: 8192
      });
    } else {
      const excludeInstruction = excludedMeal
        ? `\nIMPORTANT: Do NOT include ${excludedMeal} in the meal plan. ${excludedMeal === 'snacks' ? 'Set "snacks" to an empty array [] for every day.' : `Set "${excludedMeal}" to null or omit it entirely.`}`
        : '';

      const openAISystemPrompt = systemInstruction + `

JSON OUTPUT FORMAT (MANDATORY):
- Return a single JSON object with a top-level key "plan"
- "plan" must be an array of 7 items (one per day), where each item has this exact structure:
  {
    "day": "Monday",
    "breakfast": ${excludedMeal === 'breakfast' ? 'null' : '{ /* Meal object */ }'},
    "lunch": ${excludedMeal === 'lunch' ? 'null' : '{ /* Meal object */ }'},
    "dinner": ${excludedMeal === 'dinner' ? 'null' : '{ /* Meal object */ }'},
    "snacks": ${excludedMeal === 'snacks' ? '[]' : '[ /* array of Meal objects */ ]'}
  }
- Do NOT use a "meals" array – you MUST use the separate keys "breakfast", "lunch", "dinner", and "snacks".
- REMEMBER: Every ingredient in the ingredients array MUST include specific quantities (e.g., "150g chicken breast", "20g porridge", "2 eggs", "1 cup rice").${excludeInstruction}
`;

      let imageBase64;
      let mimeType;
      if (params.referenceData) {
        imageBase64 = params.referenceData.inlineData.data;
        mimeType = params.referenceData.inlineData.mimeType;
      }

      if (provider === 'openai') {
        resultText = await callOpenAI({
          systemPrompt: openAISystemPrompt,
          userPrompt,
          imageBase64,
          mimeType,
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
        if (excludedMeal === 'breakfast') {
          breakfast = null;
          lunch = meals[0] ?? null;
          dinner = meals[1] ?? null;
          const extraSnacks = meals.slice(2);
          if (extraSnacks.length > 0 && excludedMeal !== 'snacks') snacks = snacks.concat(extraSnacks);
        } else if (excludedMeal === 'lunch') {
          breakfast = meals[0] ?? null;
          lunch = null;
          dinner = meals[1] ?? null;
          const extraSnacks = meals.slice(2);
          if (extraSnacks.length > 0 && excludedMeal !== 'snacks') snacks = snacks.concat(extraSnacks);
        } else if (excludedMeal === 'dinner') {
          breakfast = meals[0] ?? null;
          lunch = meals[1] ?? null;
          dinner = null;
          const extraSnacks = meals.slice(3);
          if (extraSnacks.length > 0 && excludedMeal !== 'snacks') snacks = snacks.concat(extraSnacks);
        } else if (excludedMeal === 'snacks') {
          breakfast = meals[0] ?? null;
          lunch = meals[1] ?? null;
          dinner = meals[2] ?? null;
          // Snacks are excluded, so don't add any
        } else {
          breakfast = meals[0] ?? null;
          lunch = meals[1] ?? null;
          dinner = meals[2] ?? null;
          const extraSnacks = meals.slice(3);
          if (extraSnacks.length > 0) snacks = snacks.concat(extraSnacks);
        }
      } else if (excludedMeal) {
        if (excludedMeal === 'breakfast') breakfast = null;
        if (excludedMeal === 'lunch') lunch = null;
        if (excludedMeal === 'dinner') dinner = null;
        if (excludedMeal === 'snacks') snacks = [];
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

    res.json({ plan });
  } catch (error) {
    console.error('Generate meal plan error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate meal plan' });
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
