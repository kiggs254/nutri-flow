









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
  habits?: {
    smoker: boolean;
    alcohol: 'None' | 'Occasional' | 'Regular';
    sleepHours: number;
  };
  bodyFatPercentage?: number;
  bodyFatMass?: number;
  skeletalMuscleMass?: number;
  skeletalMusclePercentage?: number;
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
  referenceData?: {
    inlineData: {
      data: string;
      mimeType: string;
    }
  };
  // New fields from profile
  medicalHistory?: string;
  medications?: string;
  dietaryHistory?: string;
  socialBackground?: string;
  /**
   * Which main meal to exclude from the generated plan.
   * If set, the model should omit that meal (set it to null) for every day.
   * For snacks, set the snacks array to empty [].
   */
  excludeMeal?: 'breakfast' | 'lunch' | 'dinner' | 'snacks' | null;

  /**
   * @deprecated Use excludeMeal instead (kept for backwards compatibility).
   */
  excludeLunch?: boolean;
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