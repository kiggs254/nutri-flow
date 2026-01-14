import { MealGenParams, DailyPlan } from '../types';

// --- Provider Configuration ---
export type AIProvider = 'gemini' | 'openai' | 'deepseek';
const PROVIDER_KEY = 'nutriflow_ai_provider';

export const getAIProvider = (): AIProvider => {
  return (localStorage.getItem(PROVIDER_KEY) as AIProvider) || 'gemini';
};

export const setAIProvider = (provider: AIProvider) => {
  localStorage.setItem(PROVIDER_KEY, provider);
};

// Helper to get API keys from localStorage
const getGeminiKey = (): string => {
  return localStorage.getItem('nutriflow_gemini_key') || '';
};

const getOpenAIKey = (): string => {
  return localStorage.getItem('nutriflow_openai_key') || '';
};

const getDeepSeekKey = (): string => {
  return localStorage.getItem('nutriflow_deepseek_key') || '';
};

// Helper to get Gemini API key
const getGeminiApiKey = (): string => {
  const apiKey = getGeminiKey();
  if (!apiKey) {
    throw new Error("Gemini API Key is missing. Please add it in Account Settings.");
  }
  return apiKey;
};

// --- Schemas (JSON Schema format for Gemini API) ---
const mealSchema = {
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
};

const dailyPlanSchema = {
  type: "object",
  properties: {
    day: { type: "string" },
    breakfast: mealSchema,
    lunch: mealSchema,
    dinner: mealSchema,
    snacks: { type: "array", items: mealSchema },
    totalCalories: { type: "integer" },
    summary: { type: "string" }
  },
  required: ["day", "breakfast", "lunch", "dinner", "snacks", "totalCalories", "summary"]
};

const planResponseSchema = {
  type: "object",
  properties: {
    plan: {
      type: "array",
      items: dailyPlanSchema
    }
  },
  required: ["plan"]
};

// --- Helpers ---
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Direct Gemini API Call (using REST API)
const callGemini = async (
  systemInstruction: string,
  parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }>,
  responseSchema?: any,
  responseMimeType?: string,
  temperature: number = 0.7,
  maxTokens: number = 8192
): Promise<string> => {
  const apiKey = getGeminiApiKey();
  const model = 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body: any = {
    contents: [{ parts }]
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const generationConfig: any = {};
  if (temperature !== undefined) generationConfig.temperature = temperature;
  if (maxTokens !== undefined) generationConfig.maxOutputTokens = maxTokens;
  if (responseMimeType) generationConfig.responseMimeType = responseMimeType;
  if (responseSchema) generationConfig.responseSchema = responseSchema;

  if (Object.keys(generationConfig).length > 0) {
    body.generationConfig = generationConfig;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new Error(`Gemini API Error: ${error.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
  if (!text) {
    throw new Error('No response text from Gemini API');
  }

  return text;
};

// Direct OpenAI API Call
const callOpenAI = async (
  systemPrompt: string,
  userPrompt: string,
  imageBase64?: string,
  mimeType?: string,
  jsonMode: boolean = false,
  model: string = 'gpt-4o',
  temperature: number = 0.7,
  maxTokens: number = 4096
): Promise<string> => {
  const apiKey = getOpenAIKey();
  if (!apiKey) {
    throw new Error("OpenAI API Key is missing. Please add it in Account Settings.");
  }

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
      model,
      messages,
      response_format: jsonMode ? { type: "json_object" } : undefined,
      max_tokens: maxTokens,
      temperature
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new Error(`OpenAI Error: ${err.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
};

// Direct DeepSeek API Call (OpenAI-compatible)
const callDeepSeek = async (
  systemPrompt: string,
  userPrompt: string,
  imageBase64?: string,
  mimeType?: string,
  jsonMode: boolean = false,
  temperature: number = 0.7,
  maxTokens: number = 4096
): Promise<string> => {
  const apiKey = getDeepSeekKey();
  if (!apiKey) {
    throw new Error("DeepSeek API Key is missing. Please add it in Account Settings.");
  }

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

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      response_format: jsonMode ? { type: "json_object" } : undefined,
      max_tokens: maxTokens,
      temperature
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new Error(`DeepSeek Error: ${err.error?.message || response.statusText}`);
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

  // Direct API calls for all providers
  const MAX_RETRIES = 3;
  let lastError;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      let resultText: string;
      
      if (provider === 'gemini') {
        // Gemini implementation with schema
        const parts: any[] = [{ text: userPrompt }];
        if (params.referenceData) parts.push(params.referenceData);

        resultText = await callGemini(
          systemInstruction,
          parts,
          planResponseSchema,
          'application/json',
          0.7,
          8192
        );
      } else {
        // OpenAI and DeepSeek implementation
        const openAISystemPrompt = systemInstruction + `\nOutput a JSON object with a single key "plan" containing the array of daily plans.`;
        
        let imageBase64: string | undefined;
        let mimeType: string | undefined;
        if (params.referenceData) {
          imageBase64 = params.referenceData.inlineData.data;
          mimeType = params.referenceData.inlineData.mimeType;
        }

        if (provider === 'openai') {
          resultText = await callOpenAI(
            openAISystemPrompt,
            userPrompt,
            imageBase64,
            mimeType,
            true, // jsonMode
            'gpt-4o',
            0.7,
            4096
          );
        } else {
          resultText = await callDeepSeek(
            openAISystemPrompt,
            userPrompt,
            imageBase64,
            mimeType,
            true, // jsonMode
            0.7,
            4096
          );
        }
      }

      // Parse the response
      const parsed = JSON.parse(resultText || '{}');
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

  // Direct API calls for all providers
  try {
    let resultText: string;
    
    if (provider === 'gemini') {
      const parts: any[] = [];
      if (base64Image && mimeType) {
        parts.push({ inlineData: { data: base64Image, mimeType } });
      }
      parts.push({ text: promptText });

      resultText = await callGemini(
        "You are an expert nutritionist.",
        parts,
        undefined,
        undefined,
        0.7
      );
    } else {
      if (provider === 'openai') {
        resultText = await callOpenAI(
          "You are an expert nutritionist.",
          promptText,
          base64Image || undefined,
          mimeType || undefined,
          false,
          'gpt-4o',
          0.7
        );
      } else {
        resultText = await callDeepSeek(
          "You are an expert nutritionist.",
          promptText,
          base64Image || undefined,
          mimeType || undefined,
          false,
          0.7
        );
      }
    }

    return resultText || "Could not analyze meal.";
  } catch (e: any) {
    console.error("Food analysis failed", e);
    return `Error analyzing meal: ${e.message || "Please try again."}`;
  }
};

export const generateClientInsights = async (clientName: string, weightHistory: number[], goal: string): Promise<string> => {
  const provider = getAIProvider();
  const prompt = `Client ${clientName} has the following weight history (newest last): ${weightHistory.join(' -> ')} kg. 
          Goal: ${goal}. 
          Provide a 3-sentence professional insight on their progress and a motivational tip.`;

  // Direct API calls for all providers
  try {
    let resultText: string;
    
    if (provider === 'gemini') {
      resultText = await callGemini(
        "You are a professional nutrition coach.",
        [{ text: prompt }],
        undefined,
        undefined,
        0.7
      );
    } else if (provider === 'openai') {
      resultText = await callOpenAI(
        "You are a professional nutrition coach.",
        prompt,
        undefined,
        undefined,
        false,
        'gpt-4o',
        0.7
      );
    } else {
      resultText = await callDeepSeek(
        "You are a professional nutrition coach.",
        prompt,
        undefined,
        undefined,
        false,
        0.7
      );
    }

    return resultText || "No insights available.";
  } catch (e: any) {
    console.error("Insights generation failed", e);
    return `Could not generate insights: ${e.message || "Please try again."}`;
  }
};
