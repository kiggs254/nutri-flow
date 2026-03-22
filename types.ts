









export interface Client {
  id: string;
  name: string;
  email: string;
  status: 'Active' | 'Pending' | 'Inactive';
  goal: string;
  lastCheckIn: string;
  avatarUrl: string;
  joinedAt: string; // New: Track when joined
  portalAccessToken: string; // New: Secure token for portal access
  
  // Extended Profile
  age?: number;
  gender?: string;
  weight?: number;
  height?: number;
  activityLevel?: string;
  allergies?: string;
  preferences?: string;
  
  // New Fields for Detailed Profile
  medicalHistory?: string; // e.g., "Diabetes Type 2, Hypertension"
  medications?: string; // e.g., "Metformin 500mg, Lisinopril 10mg"
  dietaryHistory?: string; // e.g., "Tried keto, prefers low-carb. Dislikes spicy food."
  socialBackground?: string; // e.g., "Works night shifts, lives with family, cultural dietary restrictions"
  groupName?: string; // Display name (from group or legacy group_name)
  groupId?: string; // FK to client_groups when using created groups
  habits?: {
    smoker: boolean;
    alcohol: 'None' | 'Occasional' | 'Regular';
    sleepHours: number;
  };
  bodyFatPercentage?: number;
  bodyFatMass?: number;
  skeletalMuscleMass?: number;
  skeletalMusclePercentage?: number;

  // Metabolic metrics (optional)
  /** Basal Metabolic Rate (kcal/day). */
  bmr?: number;
  /** Metabolic age (years). */
  metabolicAge?: number;
  /** Visceral fat level/score (unitless). */
  visceralFat?: number;
}

export interface Meal {
  name: string;
  calories: number;
  protein: string;
  carbs: string;
  fats: string;
  ingredients: string[];
  instructions: string;
}

export interface DailyPlan {
  day: string;
  breakfast: Meal;
  lunch: Meal;
  dinner: Meal;
  snacks: Meal[];
  totalCalories: number;
  summary: string;
}

export interface SavedMealPlan {
  id: string;
  clientId: string;
  createdAt: string;
  planData: DailyPlan[];
  label: string;
}

export interface ClientGroup {
  id: string;
  name: string;
  createdAt?: string;
}

export interface ProgressLog {
  id: string;
  date: string;
  weight: number;
  complianceScore: number;
  notes: string;
  bodyFatPercentage?: number;
  bodyFatMass?: number;
  skeletalMuscleMass?: number;
  skeletalMusclePercentage?: number;

  // Metabolic metrics (optional)
  bmr?: number;
  metabolicAge?: number;
  visceralFat?: number;
}

export interface ClientNote {
  id: string;
  clientId: string;
  content: string;
  createdAt: string;
  includeInAiPrompt: boolean;
}

export interface Invoice {
  id: string;
  clientId: string;
  amount: number;
  currency: string;
  status: 'Paid' | 'Pending' | 'Overdue' | 'Processing';
  dueDate: string;
  generatedAt: string;
  items: { description: string; cost: number }[];
  paymentMethod?: 'Paystack' | 'M-Pesa' | 'Manual' | null;
  transactionRef?: string | null;
}

export interface Appointment {
  id: string;
  clientId: string;
  date: string; // ISO String
  type: 'Check-in' | 'Consultation' | 'Onboarding';
  status: 'Scheduled' | 'Confirmed' | 'Pending' | 'Completed' | 'Cancelled';
  notes?: string;
}

export interface FoodLog {
  id: string;
  clientId: string;
  imageUrl?: string;
  aiAnalysis?: string;
  createdAt: string;
  notes?: string;
}

export interface Message {
  id: string;
  clientId: string;
  sender: 'client' | 'nutritionist';
  content: string;
  createdAt: string;
  isRead: boolean;
}

export interface Notification {
  id: string; // Use message ID for uniqueness
  clientId: string;
  clientName: string;
  content: string;
  createdAt: string;
  type: 'message' | 'invoice' | 'meal_plan';
}

export interface Reminder {
  id: string;
  clientId: string;
  title: string;
  message: string;
  createdAt: string;
  isDismissed: boolean;
  dismissedAt?: string;
  isAutomated?: boolean;
  frequency?: 'daily' | 'weekly' | 'custom';
  scheduleTime?: string; // Time of day (HH:mm format)
  scheduleDays?: number[]; // Days of week (0=Sunday, 6=Saturday)
  intervalHours?: number; // For custom intervals
  nextScheduledAt?: string;
  parentReminderId?: string;
  isActive?: boolean;
}

export interface MealGenParams {
  age: number;
  gender: string;
  weight: number;
  height: number;
  goal: string;
  allergies: string;
  preferences: string;
  activityLevel: string;
  customInstructions?: string;
  // Metabolic metrics (optional)
  bmr?: number;
  metabolicAge?: number;
  visceralFat?: number;
  /** Single reference image (legacy). Prefer referenceDataArray for multiple. */
  referenceData?: {
    inlineData: {
      data: string;
      mimeType: string;
    }
  };
  /** Multiple reference images (e.g. past meal plan photos). */
  referenceDataArray?: {
    inlineData: { data: string; mimeType: string };
  }[];
  /** Past meal plans (saved plans) as JSON reference for style/structure. */
  referencePlans?: DailyPlan[][];
  // New fields from profile
  medicalHistory?: string;
  medications?: string;
  dietaryHistory?: string;
  socialBackground?: string;
  /** Notes from nutritionist (client_notes with include_in_ai_prompt) for meal planning. */
  nutritionistNotes?: string;
  /**
   * Which meals to exclude from the generated plan.
   * If set, the model should omit those meals (set them to null) for every day.
   * For snacks, set the snacks array to empty [].
   */
  excludeMeals?: ('breakfast' | 'lunch' | 'dinner' | 'snacks')[];

  /**
   * @deprecated Use excludeMeals instead (kept for backwards compatibility).
   */
  excludeMeal?: 'breakfast' | 'lunch' | 'dinner' | 'snacks' | null;

  /**
   * @deprecated Use excludeMeals instead (kept for backwards compatibility).
   */
  excludeLunch?: boolean;

  /** When true, skip RAG retrieval (still uses server TDEE target). */
  disableRag?: boolean;
}

/** Server-computed calorie target returned with meal plan generation */
export interface NutritionTargetsSummary {
  dailyCalories: number;
  source: 'explicit_instruction' | 'computed_tdee' | 'fallback_default';
  bmr?: number | null;
  tdee?: number | null;
  activityMultiplier?: number | null;
  goalAdjustment?: number | null;
  note?: string;
}

export interface NutritionPlanValidation {
  warnings: string[];
  perDay: Array<{
    day: string;
    reportedTotal: number;
    summedFromMeals: number;
    target: number;
    withinTarget: boolean;
  }>;
  targetDailyKcal?: number;
}

export interface MealPlanGenerationResult {
  plan: DailyPlan[];
  nutritionTargets?: NutritionTargetsSummary;
  nutritionValidation?: NutritionPlanValidation;
  rag?: {
    used?: boolean;
    matchCount?: number;
    error?: string;
  };
}

export interface NutritionFood {
  id: string;
  name: string;
  category?: string | null;
  source: 'usda' | 'custom';
  usdaFdcId?: number | null;
  caloriesPer100g?: number | null;
  proteinPer100g?: number | null;
  carbsPer100g?: number | null;
  fatsPer100g?: number | null;
}

export interface NutritionDocument {
  id: string;
  title: string;
  docType: string;
  fileName?: string | null;
  chunkCount: number;
  createdAt: string;
}

export interface KnowledgeBaseStats {
  foodsCount: number;
  foodEmbeddingsCount: number;
  myDocumentsCount: number;
  myDocumentChunksCount: number;
  serviceRoleConfigured: boolean;
}

export interface KnowledgeBaseSearchMatch {
  id: string;
  content: string;
  similarity: number;
  source_type: string;
  source_id: string;
  metadata?: Record<string, unknown>;
}

export interface MedicalDocument {
  id: string;
  clientId: string;
  fileName: string;
  filePath: string;
  uploadedAt: string;
}

export interface BillingSettings {
  user_id: string;
  currency: 'USD' | 'KES' | 'NGN' | 'GHS';
  paystack_public_key: string;
}