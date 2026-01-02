import { GoogleGenAI, Type } from "@google/genai";
import { MealGenParams, DailyPlan } from '../types';

// --- Provider Configuration ---
export type AIProvider = 'gemini' | 'openai';
const PROVIDER_KEY = 'nutriflow_ai_provider';

export const getAIProvider = (): AIProvider => {
  return (localStorage.getItem(PROVIDER_KEY) as AIProvider) || 'gemini';
};

export const setAIProvider = (provider: AIProvider) => {
  localStorage.setItem(PROVIDER_KEY, provider);
};

// Helper to safely find environment variables (Safe for Vite/Netlify and Node)
const getEnvVar = (key: string): string => {
  // Check for Vite prefix
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    // @ts-ignore
    if (import.meta.env[`VITE_${key}`]) return import.meta.env[`VITE_${key}`];
    // @ts-ignore
    if (import.meta.env[key]) return import.meta.env[key];
  }

  // Check for standard Node/Process env
  if (typeof process !== 'undefined' && process.env) {
    if (process.env[`REACT_APP_${key}`]) return process.env[`REACT_APP_${key}`];
    if (process.env[key]) return process.env[key];
  }

  return '';
};

// Helper to get OpenAI Key (LocalStorage > Env Var)
const getOpenAIKey = (): string => {
    return localStorage.getItem('nutriflow_openai_key') || getEnvVar('OPENAI_API_KEY') || '';
};

// --- Clients ---
const geminiApiKey = getEnvVar('API_KEY');

// Initialize Gemini with a fallback
const geminiClient = new GoogleGenAI({ apiKey: geminiApiKey || 'missing-api-key-placeholder' });

// --- Schemas ---
const mealSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    calories: { type: Type.INTEGER },
    protein: { type: Type.STRING },
    carbs: { type: Type.STRING },
    fats: { type: Type.STRING },
    ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
    instructions: { type: Type.STRING }
  },
  required: ["name", "calories", "protein", "carbs", "fats", "ingredients", "instructions"]
};

const dailyPlanSchema = {
  type: Type.OBJECT,
  properties: {
    day: { type: Type.STRING },
    breakfast: mealSchema,
    lunch: mealSchema,
    dinner: mealSchema,
    snacks: { type: Type.ARRAY, items: mealSchema },
    totalCalories: { type: Type.INTEGER },
    summary: { type: Type.STRING }
  },
  required: ["day", "breakfast", "lunch", "dinner", "snacks", "totalCalories", "summary"]
};

const planResponseSchema = {
  type: Type.OBJECT,
  properties: {
    plan: {
      type: Type.ARRAY,
      items: dailyPlanSchema
    }
  },
  required: ["plan"]
};

// --- Helpers ---
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// OpenAI Call Wrapper
const callOpenAI = async (
  systemPrompt: string, 
  userPrompt: string, 
  imageBase64?: string, 
  mimeType?: string, 
  jsonMode: boolean = false
) => {
    const apiKey = getOpenAIKey();
    if (!apiKey) throw new Error("OpenAI API Key is missing. Please add it in Account Settings or set VITE_OPENAI_API_KEY.");

    const messages: any[] = [{ role: "system", content: systemPrompt }];
    
    if (imageBase64 && mimeType) {
        messages.push({
            role: "user",
            content: [
                { type: "text", text: userPrompt },
                { 
                    type: "image_url", 
                    image_url: { url: `data:${mimeType};base64,${imageBase64}` } 
                }
            ]
        });
    } else {
        messages.push({ role: "user", content: userPrompt });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-4o', // Defaulting to GPT-4o for best results
            messages,
            response_format: jsonMode ? { type: "json_object" } : undefined,
            max_tokens: 4096,
            temperature: 0.7
        })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(`OpenAI Error: ${err.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
};


// --- Service Functions ---

export const generateMealPlan = async (params: MealGenParams): Promise<DailyPlan[]> => {
  const provider = getAIProvider();

  const systemInstruction = `You are an expert nutritionist creating a 7-day meal plan.
  CRITICAL RULES:
  1. Adhere strictly to all health constraints, allergies, and medication interactions.
  2. Base meal suggestions on the client's goal and dietary history for preference.
  3. Output must be a valid JSON object matching the requested schema exactly.
  4. Instructions: MAX 10 words.
  5. Ingredients: MAX 5 items.
  6. Snacks: Name & ingredients only.
  7. Be concise.`;

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

    Nutritionist's Custom Instructions:
    - ${params.customInstructions || 'None.'}
    
    ${params.referenceData ? "An image has been attached as reference material." : ""}
    
    Generate a 7-day (Mon-Sun) meal plan based on ALL the above information.
  `;

  // --- OpenAI Implementation ---
  if (provider === 'openai') {
    // Modify system instruction for JSON Object mode which requires explicit JSON structure request
    const openAISystemPrompt = systemInstruction + `\nOutput a JSON object with a single key "plan" containing the array of daily plans.`;
    
    let imgData, imgMime;
    if (params.referenceData) {
        imgData = params.referenceData.inlineData.data;
        imgMime = params.referenceData.inlineData.mimeType;
    }

    try {
        const jsonStr = await callOpenAI(openAISystemPrompt, userPrompt, imgData, imgMime, true);
        const parsed = JSON.parse(jsonStr || '{}');
        return (parsed.plan || parsed) as DailyPlan[];
    } catch (e: any) {
        console.error("OpenAI Plan Generation Failed", e);
        throw e;
    }
  }

  // --- Gemini Implementation ---
  const parts: any[] = [{ text: userPrompt }];
  if (params.referenceData) parts.push(params.referenceData);

  const MAX_RETRIES = 3;
  let lastError;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await geminiClient.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts },
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: "application/json",
          responseSchema: planResponseSchema,
          maxOutputTokens: 8192,
        }
      });

      if (response.text) {
        // Since responseSchema is used, the response text is guaranteed to follow the schema structure.
        const parsed = JSON.parse(response.text);
        if (parsed.plan && Array.isArray(parsed.plan)) {
            return parsed.plan as DailyPlan[];
        }
        throw new Error("Response structure did not match expected schema.");
      }
    } catch (error: any) {
      console.warn(`Gemini generation attempt ${attempt + 1} failed:`, error);
      lastError = error;
      if (error.message?.includes('503') || error.message?.includes('429') || error.message?.includes('overloaded')) {
        await sleep(1000 * Math.pow(2, attempt));
        continue;
      }
      break;
    }
  }
  throw lastError || new Error("Failed to generate plan.");
};

export const analyzeFoodImage = async (
  base64Image: string | null, 
  mimeType: string | null, 
  clientNote: string | null,
  goal: string
): Promise<string> => {
  const provider = getAIProvider();
  
  let promptText = "";
  if (base64Image && clientNote) {
    promptText = `Analyze this meal image and the client's note. The client's goal is: ${goal}. Client's note: "${clientNote}". 
      1. Based on BOTH the image and note, estimate calories and macros (Protein/Carbs/Fats). 
      2. Is this good for their goal? 
      3. Give 1 constructive suggestion. 
      Keep it under 100 words.`;
  } else if (base64Image) {
    promptText = `Analyze this meal image. The client's goal is: ${goal}. 
      1. Estimate calories and macros (Protein/Carbs/Fats). 
      2. Is this good for their goal? 
      3. Give 1 constructive suggestion. 
      Keep it under 100 words.`;
  } else if (clientNote) {
    promptText = `Analyze this client's food description. The client's goal is: ${goal}. Client's description: "${clientNote}".
      1. Based on the description, estimate calories and macros (Protein/Carbs/Fats). 
      2. Is this good for their goal? 
      3. Give 1 constructive suggestion. 
      Keep it under 100 words.`;
  } else {
    return "Please provide an image or a description of your meal.";
  }

  // --- OpenAI Implementation ---
  if (provider === 'openai') {
      try {
          return await callOpenAI(
              "You are an expert nutritionist.",
              promptText,
              base64Image || undefined,
              mimeType || undefined
          );
      } catch (e: any) {
          console.error("OpenAI Food Analysis Failed", e);
          return "Error analyzing meal via OpenAI. Please try again.";
      }
  }

  // --- Gemini Implementation ---
  const parts: any[] = [];
  if (base64Image && mimeType) {
    parts.push({ inlineData: { data: base64Image, mimeType } });
  }
  parts.push({ text: promptText });

  try {
    const response = await geminiClient.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts }
    });
    return response.text || "Could not analyze meal.";
  } catch (e: any) {
    console.error("Food analysis failed", e);
    return "Error analyzing meal. Please try again.";
  }
};

export const generateClientInsights = async (clientName: string, weightHistory: number[], goal: string): Promise<string> => {
  const provider = getAIProvider();
  const prompt = `Client ${clientName} has the following weight history (newest last): ${weightHistory.join(' -> ')} kg. 
          Goal: ${goal}. 
          Provide a 3-sentence professional insight on their progress and a motivational tip.`;

  // --- OpenAI Implementation ---
  if (provider === 'openai') {
      try {
          return await callOpenAI("You are a professional nutrition coach.", prompt);
      } catch (e) {
          return "Could not generate insights (OpenAI).";
      }
  }

  // --- Gemini Implementation ---
  try {
    const response = await geminiClient.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [{ text: prompt }] }
    });
    return response.text || "No insights available.";
  } catch (e) {
    return "Could not generate insights at this time.";
  }
};
