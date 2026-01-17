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

// --- Backend Configuration ---
const getBackendUrl = (): string => {
  // Check for environment variable first (for production)
  // Vite exposes env vars via import.meta.env
  const envUrl = import.meta.env.VITE_BACKEND_URL;
  if (envUrl && envUrl.trim() !== '') {
    return envUrl.trim();
  }
  // Fallback to localhost for development
  console.warn('VITE_BACKEND_URL not set, using default: http://localhost:3000');
  return 'http://localhost:3000';
};

// Helper to get Supabase auth token
const getAuthToken = async (): Promise<string> => {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.access_token) {
    throw new Error('Not authenticated. Please log in.');
  }
  return session.access_token;
};

// Helper to make authenticated backend requests
const callBackend = async (endpoint: string, body: any): Promise<any> => {
  const backendUrl = getBackendUrl();
  const token = await getAuthToken();

  console.log(`[AI Proxy] Calling backend: ${backendUrl}${endpoint}`);

  try {
    const response = await fetch(`${backendUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      const errorMessage = error.error?.message || response.statusText || 'Backend request failed';
      console.error(`[AI Proxy] Backend error (${response.status}):`, errorMessage);
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log(`[AI Proxy] Backend response received`);
    return data;
  } catch (error: any) {
    // If it's a network error (backend not reachable), provide clear error
    if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
      console.error('[AI Proxy] Backend not reachable. Is the backend server running?', backendUrl);
      throw new Error(`Backend server is not reachable at ${backendUrl}. Please ensure the backend is running and VITE_BACKEND_URL is set correctly.`);
    }
    throw error;
  }
};

// --- Service Functions ---

export const generateMealPlan = async (params: MealGenParams): Promise<DailyPlan[]> => {
  const provider = getAIProvider();

  try {
    const response = await callBackend('/api/ai/generate-meal-plan', {
      provider,
      params
    });

    return response.plan || [];
  } catch (error: any) {
    console.error('Generate meal plan error:', error);
    throw error;
  }
};

export const analyzeFoodImage = async (
  base64Image: string | null, 
  mimeType: string | null, 
  clientNote: string | null,
  goal: string
): Promise<string> => {
  const provider = getAIProvider();
  
  if (!base64Image && !clientNote) {
    return "Please provide an image or a description of your meal.";
  }

  try {
    const response = await callBackend('/api/ai/analyze-food-image', {
      provider,
      base64Image,
      mimeType,
      clientNote,
      goal
    });

    return response.result || "Could not analyze meal.";
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

  try {
    const response = await callBackend('/api/ai/analyze-medical-document', {
      provider,
      fileContent,
      mimeType,
      isImage
    });

    return {
      medicalHistory: response.medicalHistory || '',
      allergies: response.allergies || '',
      medications: response.medications || '',
      dietaryHistory: response.dietaryHistory || '',
      socialBackground: response.socialBackground || ''
    };
  } catch (e: any) {
    console.error("Document analysis failed", e);
    throw new Error(`Failed to analyze document: ${e.message || "Please try again."}`);
  }
};

export const generateClientInsights = async (clientName: string, weightHistory: number[], goal: string): Promise<string> => {
  const provider = getAIProvider();

  try {
    const response = await callBackend('/api/ai/generate-insights', {
      provider,
      clientName,
      weightHistory,
      goal
    });

    return response.result || "No insights available.";
  } catch (e: any) {
    console.error("Insights generation failed", e);
    return `Could not generate insights: ${e.message || "Please try again."}`;
  }
};
