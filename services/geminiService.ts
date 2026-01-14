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

// Normalise OpenAI / DeepSeek message content into a plain string
const extractMessageText = (messageContent: any): string => {
  if (messageContent == null) return '';

  // Newer chat APIs often return an array of content parts
  if (Array.isArray(messageContent)) {
    const parts = messageContent
      .map((part: any) => {
        if (typeof part === 'string') return part;
        if (typeof part?.text === 'string') return part.text;
        if (typeof part?.content === 'string') return part.content;
        if (Array.isArray(part?.content)) {
          return part.content
            .map((p: any) => (typeof p === 'string' ? p : p.text ?? ''))
            .join('');
        }
        return '';
      })
      .filter(Boolean);
    return parts.join('\n').trim();
  }

  if (typeof messageContent === 'string') {
    return messageContent;
  }

  // Fallback for unexpected structures
  if (typeof messageContent === 'object') {
    if (typeof (messageContent as any).text === 'string') {
      return (messageContent as any).text;
    }
    if (Array.isArray((messageContent as any).content)) {
      return (messageContent as any).content
        .map((p: any) => (typeof p === 'string' ? p : p.text ?? ''))
        .join('\n')
        .trim();
    }
    try {
      return JSON.stringify(messageContent);
    } catch {
      return '';
    }
  }

  return '';
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
  const rawContent = data?.choices?.[0]?.message?.content;
  const text = extractMessageText(rawContent);
  return text;
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
  const rawContent = data?.choices?.[0]?.message?.content;
  const text = extractMessageText(rawContent);
  return text;
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
  7. Be concise.
  
  MANDATORY NUTRITIONAL DATA FOR EVERY MEAL:
  - calories: Must be a positive integer (e.g., 350, 450, 520)
  - protein: Must be a string with numeric value and "g" unit (e.g., "25g", "30g", "18g")
  - carbs: Must be a string with numeric value and "g" unit (e.g., "45g", "60g", "35g")
  - fats: Must be a string with numeric value and "g" unit (e.g., "12g", "15g", "8g")
  
  Example meal format:
  {
    "name": "Grilled Chicken Salad",
    "calories": 420,
    "protein": "35g",
    "carbs": "25g",
    "fats": "18g",
    "ingredients": ["chicken breast", "mixed greens", "tomatoes", "olive oil", "lemon"],
    "instructions": "Grill chicken, toss with greens and dressing"
  }
  
  Every breakfast, lunch, dinner, and snack MUST include accurate calories and macro grammages.`;

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
    
    Generate a 7-day (Mon-Sun) meal plan based on ALL the above information.
    
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
    
    Calculate these values accurately based on the ingredients and portion sizes. Do not leave any nutritional values empty or as zero unless the meal truly has none.
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

export interface ExtractedRecords {
  medicalHistory?: string;
  allergies?: string;
  medications?: string;
  dietaryHistory?: string;
  socialBackground?: string;
}

export const analyzeMedicalDocument = async (
  fileContent: string,
  mimeType: string,
  isImage: boolean
): Promise<ExtractedRecords> => {
  const provider = getAIProvider();
  
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

  try {
    let resultText: string;
    
    if (provider === 'gemini') {
      const parts: any[] = [];
      if (isImage && mimeType) {
        parts.push({ inlineData: { data: fileContent, mimeType } });
      } else {
        parts.push({ text: fileContent });
      }
      parts.push({ text: prompt });

      resultText = await callGemini(
        systemInstruction,
        parts,
        {
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
        'application/json',
        0.7
      );
    } else {
      // For text documents, include content in the prompt
      const fullPrompt = isImage ? prompt : `Document content:\n${fileContent}\n\n${prompt}`;
      
      if (provider === 'openai') {
        resultText = await callOpenAI(
          systemInstruction,
          fullPrompt,
          isImage ? fileContent : undefined,
          isImage ? mimeType : undefined,
          true, // jsonMode
          'gpt-4o',
          0.7
        );
      } else {
        resultText = await callDeepSeek(
          systemInstruction,
          fullPrompt,
          isImage ? fileContent : undefined,
          isImage ? mimeType : undefined,
          true, // jsonMode
          0.7
        );
      }
    }

    const parsed = JSON.parse(resultText || '{}');
    return {
      medicalHistory: parsed.medicalHistory || '',
      allergies: parsed.allergies || '',
      medications: parsed.medications || '',
      dietaryHistory: parsed.dietaryHistory || '',
      socialBackground: parsed.socialBackground || '',
    };
  } catch (e: any) {
    console.error("Document analysis failed", e);
    throw new Error(`Failed to analyze document: ${e.message || "Please try again."}`);
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
