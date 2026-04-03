# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Frontend (root)
```bash
npm install        # Install dependencies
npm run dev        # Start Vite dev server (port 5173)
npm run build      # Production build → dist/
npm run preview    # Preview production build
```

### Backend (`/backend`)
```bash
npm install        # Install dependencies
npm start          # Run server (node server.js, port 3000)
npm run dev        # Run with auto-reload (node --watch)
```

No test runner is configured.

## Environment Setup

**Frontend** (`.env.local`):
- `VITE_API_KEY` — Google Gemini API key (required)
- `VITE_OPENAI_API_KEY` — OpenAI key (optional, for embeddings)

**Backend** (`.env`):
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`, optionally `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`
- SMTP credentials for email (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`)

## Architecture

### Two-service design
- **Frontend**: React 19 + TypeScript + Vite + Tailwind. Deployed to Vercel/Netlify (`vercel.json` / `netlify.toml` both present).
- **Backend**: Express.js (ES modules) on Node 18+. Deployed via Docker on Coolify (`backend/Dockerfile`).

Frontend communicates with backend over REST (JWT in `Authorization` header). Supabase handles auth; the JWT from `supabase.auth` is passed to all backend API calls.

### Frontend routing
`src/App.tsx` uses a hash-based router — no React Router. Three route types:
- `/` — landing or dashboard (depends on auth state)
- `/#/portal/<token>` — client-facing read-only portal (no login required)
- `/#/admin` — super-admin knowledge hub

Auth state has a 5-second timeout so the landing page renders if Supabase is unreachable.

### Backend layout
```
backend/routes/       # Express route handlers (ai, auth, notifications, admin)
backend/services/     # Business logic (gemini, openai, deepseek, ragRetrieval,
                      #   tdeeCalculator, mealPlanValidation, emailService, etc.)
backend/middleware/   # JWT auth, super-admin check, portal token validation
```

All AI routes require `middleware/auth.js` (Supabase JWT verification). Admin routes additionally require `middleware/superAdmin.js`.

### AI / RAG pipeline
1. Client requests a meal plan or chat reply → `POST /api/ai/generate-meal-plan` or `/api/ai/nutritionist-chat`.
2. Backend computes TDEE via `tdeeCalculator.js`, enriches prompt with RAG context from `ragRetrieval.js` (pgvector semantic search over `nutrition_embeddings`).
3. Calls the configured AI provider (`gemini.js` / `openai.js` / `deepseek.js`).
4. Meal plans are validated against nutrition targets in `mealPlanValidation.js` before returning.

Knowledge base ingestion: `platformIngestion.js` (admin docs) and `nutritionIngestion.js` (USDA food sync) chunk text, embed with OpenAI, and store in `nutrition_embeddings`.

### Database
Supabase PostgreSQL (self-hosted at `superbase.emmerce.io`). Full schema with RLS policies lives in `src/utils/dbSchema.ts` — this is the source of truth for table definitions. Key tables: `clients`, `meal_plans`, `food_logs`, `progress_logs`, `client_notes`, `nutrition_knowledge_base`, `nutrition_embeddings`, `super_admins`.

Row-level security: nutritionists see only their own clients; portal access is token-gated via `portalAuth` middleware.

### Supabase client
`src/services/supabase.ts` — single client instance with the self-hosted URL hardcoded. Backend uses two clients in `backend/services/supabaseClients.js`: one with the anon key (for user-scoped operations) and one with the service role key (for admin/background jobs).
