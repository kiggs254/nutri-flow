# NutriTherapy Solutions

**Transform Your Nutrition Practice.**
Streamline client management, automate meal planning with AI, and grow your nutrition business with NutriTherapy Solutions.

## 🚀 Overview

NutriTherapy Solutions is a comprehensive management platform designed for nutritionists and dietitians. It leverages the power of AI to automate complex tasks like meal planning and food analysis, allowing practitioners to focus more on client care. Built with React, TypeScript, and Supabase, it offers a seamless experience for both practitioners and their clients.

## ✨ Key Features

- **🤖 AI-Powered Meal Planning**: Generate personalized 7-day meal plans in seconds using Google Gemini or OpenAI, tailored to client goals, allergies, and preferences.
- **📸 Instant Food Analysis**: Analyze food images or descriptions to estimate calories and macronutrients, providing real-time feedback to clients.
- **👥 Client Management**: Centralized dashboard to manage client profiles, medical history, metabolic metrics, and progress.
- **📊 Progress Tracking**: Visual graphs and logs to monitor client weight, adherence, and other key metrics over time.
- **🔐 Client Portal**: A dedicated, secure portal for clients to view their plans, track progress, and communicate.
- **💳 Billing & Subscriptions**: Integrated billing management (UI ready) for handling client subscriptions and payments.
- **☁️ Cloud-Based**: Data securely stored and authenticated via Supabase.

## 🛠️ Tech Stack

- **Frontend**: [React 19](https://react.dev/), [Vite](https://vitejs.dev/), [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/), [Lucide React](https://lucide.dev/) (Icons)
- **Backend/Auth**: [Supabase](https://supabase.com/)
- **AI Integration**: [Google GenAI SDK](https://ai.google.dev/) (Gemini), OpenAI API (Optional)
- **Visualization**: [Recharts](https://recharts.org/)

## ⚙️ Setup & Installation

### Prerequisites
- Node.js (v18+ recommended)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd nutritherapy-solutions
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   Create a `.env.local` file in the root directory to configure your API keys.

   ```env
   # Required: Google Gemini API Key for AI features
   VITE_API_KEY=your_gemini_api_key_here

   # Optional: OpenAI API Key (if switching provider)
   VITE_OPENAI_API_KEY=your_openai_api_key_here
   ```

   > **Note**: The project currently uses a hardcoded configuration for Supabase in `services/supabase.ts` for testing purposes. For a production setup, you should update `services/supabase.ts` to use environment variables like `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

4. **Run Locally**
   Start the development server:
   ```bash
   npm run dev
   ```
   Open [http://localhost:5173](http://localhost:5173) in your browser.

## 📖 Usage Guide

- **Dashboard**: The main landing area after login. Provides an overview of active clients and business stats.
- **Meal Planner**: Navigate to a client's profile -> Meal Plan tab. Enter parameters (calories, focus) and click "Generate" to create a plan.
- **AI Provider Switch**: By default, the app uses Google Gemini. You can switch to OpenAI in the Account Settings if you have an API key configured.
- **Client Portal**: Clients can access their personalized view via a generated link (simulated in the current build via URL hashing).

### Super admin (platform knowledge base)

Operators with a row in `public.super_admins` open **`http://localhost:5173/#/admin`** in development, or **`https://<your-production-domain>/#/admin`** in production. The same Supabase account is used as for the dashboard; there is no separate login. The main app does not link to this URL.

## 📦 Scripts

- `npm run dev`: Start development server.
- `npm run build`: Build for production.
- `npm run preview`: Preview the production build locally.

---
© 2024 NutriTherapy Solutions
