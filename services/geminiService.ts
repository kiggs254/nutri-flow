import { MealGenParams, DailyPlan, MealPlanGenerationResult, KnowledgeBaseSearchMatch } from '../types';
import { supabase } from './supabase';

// --- Provider Configuration ---
export type AIProvider = 'gemini' | 'openai' | 'deepseek';
const PROVIDER_KEY = 'nutriflow_ai_provider';

/** Dispatch after changing provider in Settings so AI Nutritionist updates in the same tab */
export const AI_PROVIDER_CHANGED_EVENT = 'nutriflow-ai-provider';

export const getAIProvider = (): AIProvider => {
  return (localStorage.getItem(PROVIDER_KEY) as AIProvider) || 'openai';
};

export const setAIProvider = (provider: AIProvider) => {
  localStorage.setItem(PROVIDER_KEY, provider);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AI_PROVIDER_CHANGED_EVENT));
  }
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
const callBackend = async (
  endpoint: string,
  body?: any,
  method: 'GET' | 'POST' | 'DELETE' = 'POST'
): Promise<any> => {
  const backendUrl = getBackendUrl();
  const token = await getAuthToken();

  console.log(`[AI Proxy] Calling backend: ${backendUrl}${endpoint}`);

  try {
    const response = await fetch(`${backendUrl}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(body ?? {})
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const errorMessage =
        (typeof error.error === 'string' ? error.error : error.error?.message) ||
        error.message ||
        response.statusText ||
        'Backend request failed';
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

export const generateMealPlan = async (params: MealGenParams): Promise<MealPlanGenerationResult> => {
  const provider = getAIProvider();

  try {
    const response = await callBackend('/api/ai/generate-meal-plan', {
      provider,
      params
    });

    return {
      plan: response.plan || [],
      nutritionTargets: response.nutritionTargets,
      nutritionValidation: response.nutritionValidation,
      rag: response.rag
    };
  } catch (error: any) {
    console.error('Generate meal plan error:', error);
    throw error;
  }
};

export const refineMealPlan = async (
  params: MealGenParams,
  plan: DailyPlan[],
  instructions: string
): Promise<MealPlanGenerationResult> => {
  const provider = getAIProvider();

  try {
    const response = await callBackend('/api/ai/refine-meal-plan', {
      provider,
      params,
      plan,
      instructions
    });

    return {
      plan: response.plan || [],
      nutritionTargets: response.nutritionTargets,
      nutritionValidation: response.nutritionValidation,
      rag: response.rag
    };
  } catch (error: any) {
    console.error('Refine meal plan error:', error);
    throw error;
  }
};

export const recalculateMealPlan = async (
  params: MealGenParams | undefined,
  plan: DailyPlan[]
): Promise<MealPlanGenerationResult> => {
  try {
    const response = await callBackend('/api/ai/recalculate-meal-plan', {
      params,
      plan
    });

    return {
      plan: response.plan || [],
      nutritionTargets: response.nutritionTargets,
      nutritionValidation: response.nutritionValidation,
    };
  } catch (error: any) {
    console.error('Recalculate meal plan error:', error);
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

/** Super admin only */
export const adminSyncUsda = async (opts?: {
  maxPages?: number;
  pageSize?: number;
  startPage?: number;
}): Promise<{ foodsProcessed: number; errors: unknown[]; summaries: unknown[] }> => {
  return callBackend('/api/admin/knowledge/sync-usda', opts || {});
};

export interface AdminUsdaSyncStatus {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  mode: string;
  currentPage: number | null;
  pagesProcessed: number;
  foodsProcessed: number;
  errors: unknown[];
  summaries: unknown[];
  message: string;
}

export const adminStartFullUsdaSync = async (opts?: {
  pageSize?: number;
  startPage?: number;
}): Promise<{ started: boolean; status: AdminUsdaSyncStatus }> => {
  return callBackend('/api/admin/knowledge/sync-usda/full', opts || {});
};

export const adminGetUsdaSyncStatus = async (): Promise<AdminUsdaSyncStatus> => {
  return callBackend('/api/admin/knowledge/sync-usda/status', undefined, 'GET');
};

export const fetchAdminMe = async (): Promise<{ isSuperAdmin: boolean }> => {
  return callBackend('/api/admin/me', undefined, 'GET');
};

export const fetchAdminKnowledgeSummary = async (): Promise<{
  foodsCount: number;
  foodEmbeddingsCount: number;
  platformDocumentsCount: number;
  platformEmbeddingsCount: number;
  userDocumentsCount: number;
  userDocumentEmbeddingsCount: number;
}> => {
  return callBackend('/api/admin/knowledge/summary', undefined, 'GET');
};

/** Legacy per-user nutrition_documents (all users) — list for admin hub */
export const fetchAdminKnowledgeDocuments = async (): Promise<{
  documents: Array<{
    id: string;
    user_id: string;
    title: string;
    doc_type: string;
    file_name: string | null;
    chunk_count: number;
    created_at: string;
    owner_email: string | null;
  }>;
}> => {
  return callBackend('/api/admin/knowledge/documents', undefined, 'GET');
};

export const adminDeleteKnowledgeDocument = async (id: string): Promise<void> => {
  await callBackend(`/api/admin/knowledge/documents/${id}`, undefined, 'DELETE');
};

/** Admin RAG test: food + platform + all user document chunks */
export const adminSearchKnowledge = async (
  query: string,
  matchCount?: number
): Promise<{ matches: KnowledgeBaseSearchMatch[] }> => {
  return callBackend('/api/admin/knowledge/search', { query, matchCount });
};

export const fetchAdminPlatformDocuments = async () => {
  return callBackend('/api/admin/knowledge/platform', undefined, 'GET');
};

export const adminUploadPlatformDocument = async (params: {
  title?: string;
  docType?: string;
  fileName: string;
  mimeType: string;
  base64Content: string;
}): Promise<{ documentId: string; ingestStatus: string; accepted?: boolean }> => {
  return callBackend('/api/admin/knowledge/platform/upload', params);
};

export const adminUploadPlatformText = async (params: {
  title?: string;
  docType?: string;
  textContent: string;
}): Promise<{ documentId: string; ingestStatus: string; accepted?: boolean }> => {
  return callBackend('/api/admin/knowledge/platform/upload', params);
};

export const adminDeletePlatformDocument = async (id: string) => {
  await callBackend(`/api/admin/knowledge/platform/${id}`, undefined, 'DELETE');
};

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const sendNutritionistChat = async (
  messages: ChatMessage[],
  clientId?: string | null,
  options?: { extraContext?: string }
): Promise<{ reply: string; ragUsed?: boolean; ragError?: string }> => {
  const provider = getAIProvider();
  return callBackend('/api/ai/nutritionist-chat', {
    provider,
    messages,
    clientId: clientId || undefined,
    extraContext: options?.extraContext || undefined
  });
};

