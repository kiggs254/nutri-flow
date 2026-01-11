import { GoogleGenAI, Type } from "@google/genai";
import { MealGenParams, DailyPlan } from '../types';
import { supabase } from './supabase';

// --- Provider Configuration ---
export type AIProvider = 'gemini' | 'openai' | 'deepseek';
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

// Get Supabase URL from the supabase client
const getSupabaseUrl = (): string => {
  // @ts-ignore
  return supabase.supabaseUrl || 'https://superbase.emmerce.io';
};

// Call AI Proxy Edge Function
const callAIProxy = async (params: {
  provider: AIProvider;
  model?: string;
  messages?: Array<{ role: string; content: string | Array<any> }>;
  systemInstruction?: string;
  temperature?: number;
  maxTokens?: number;
  responseSchema?: any;
  responseMimeType?: string;
  images?: Array<{ data: string; mimeType: string }>;
  parts?: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }>;
}): Promise<{ text: string; raw?: any }> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Authentication required. Please log in.');
  }

  const supabaseUrl = getSupabaseUrl();
  const functionUrl = `${supabaseUrl}/functions/v1/ai-proxy`;

  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify(params)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new Error(error.error?.message || `Edge Function Error: ${response.statusText}`);
  }

  const result = await response.json();
  return result;
};

// Legacy OpenAI Call Wrapper (kept for fallback if needed)
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

  // Use Edge Function for all providers
  const MAX_RETRIES = 3;
  let lastError;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      let result: { text: string };
      
      if (provider === 'gemini') {
        // Gemini implementation with schema
        const parts: any[] = [{ text: userPrompt }];
        if (params.referenceData) parts.push(params.referenceData);

        result = await callAIProxy({
          provider: 'gemini',
          model: 'gemini-2.5-flash',
          systemInstruction,
          parts,
          temperature: 0.7,
          maxTokens: 8192,
          responseSchema: planResponseSchema,
          responseMimeType: 'application/json'
        });
      } else {
        // OpenAI and DeepSeek implementation
        const openAISystemPrompt = systemInstruction + `\nOutput a JSON object with a single key "plan" containing the array of daily plans.`;
        
        const images: Array<{ data: string; mimeType: string }> = [];
        if (params.referenceData) {
          images.push({
            data: params.referenceData.inlineData.data,
            mimeType: params.referenceData.inlineData.mimeType
          });
        }

        result = await callAIProxy({
          provider: provider === 'openai' ? 'openai' : 'deepseek',
          model: provider === 'openai' ? 'gpt-4o' : 'deepseek-chat',
          systemInstruction: openAISystemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
          temperature: 0.7,
          maxTokens: 4096,
          images: images.length > 0 ? images : undefined
        });
      }

      // Parse the response
      const parsed = JSON.parse(result.text || '{}');
      if (parsed.plan && Array.isArray(parsed.plan)) {
        return parsed.plan as DailyPlan[];
      }
      // Fallback: if response is already an array
      if (Array.isArray(parsed)) {
        return parsed as DailyPlan[];
      }
      throw new Error("Response structure did not match expected schema.");
    } catch (error: any) {
      console.warn(`${provider} generation attempt ${attempt + 1} failed:`, error);
      lastError = error;
      if (error.message?.includes('503') || error.message?.includes('429') || error.message?.includes('overloaded') || error.message?.includes('rate limit')) {
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

  // Use Edge Function for all providers
  try {
    let result: { text: string };
    
    if (provider === 'gemini') {
      const parts: any[] = [];
      if (base64Image && mimeType) {
        parts.push({ inlineData: { data: base64Image, mimeType } });
      }
      parts.push({ text: promptText });

      result = await callAIProxy({
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        systemInstruction: "You are an expert nutritionist.",
        parts,
        temperature: 0.7
      });
    } else {
      const images: Array<{ data: string; mimeType: string }> = [];
      if (base64Image && mimeType) {
        images.push({ data: base64Image, mimeType });
      }

      result = await callAIProxy({
        provider: provider === 'openai' ? 'openai' : 'deepseek',
        model: provider === 'openai' ? 'gpt-4o' : 'deepseek-chat',
        systemInstruction: "You are an expert nutritionist.",
        messages: [{ role: 'user', content: promptText }],
        temperature: 0.7,
        images: images.length > 0 ? images : undefined
      });
    }

    return result.text || "Could not analyze meal.";
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

  // Use Edge Function for all providers
  try {
    let result: { text: string };
    
    if (provider === 'gemini') {
      result = await callAIProxy({
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        systemInstruction: "You are a professional nutrition coach.",
        parts: [{ text: prompt }],
        temperature: 0.7
      });
    } else {
      result = await callAIProxy({
        provider: provider === 'openai' ? 'openai' : 'deepseek',
        model: provider === 'openai' ? 'gpt-4o' : 'deepseek-chat',
        systemInstruction: "You are a professional nutrition coach.",
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7
      });
    }

    return result.text || "No insights available.";
  } catch (e) {
    console.error("Insights generation failed", e);
    return "Could not generate insights at this time.";
  }
};
