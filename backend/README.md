# Nutritherapy Solutions - AI Proxy Backend

A Node.js/Express backend server that proxies AI API calls (Gemini, OpenAI, DeepSeek) with Supabase authentication.

## Features

- Secure server-side API key management
- Supabase JWT authentication
- Support for multiple AI providers (Gemini, OpenAI, DeepSeek)
- CORS enabled for frontend integration
- Health check endpoint

## Prerequisites

- Node.js 18+ 
- Supabase project with authentication enabled
- API keys for at least one AI provider (Gemini required, OpenAI/DeepSeek optional)

## Installation

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file (copy from `.env.example`):
```bash
cp .env.example .env
```

3. Configure environment variables in `.env`:
```env
PORT=3000
CORS_ORIGIN=http://localhost:3000

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key_here

GEMINI_API_KEY=your_gemini_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
DEEPSEEK_API_KEY=your_deepseek_api_key_here
```

## Running Locally

```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

The server will start on `http://localhost:3000` (or the port specified in `PORT`).

## API Endpoints

All endpoints require authentication via `Authorization: Bearer <supabase_jwt_token>` header.

### Health Check
- `GET /health` - Returns server status

### AI Endpoints

#### Generate Meal Plan
- `POST /api/ai/generate-meal-plan`
- Body: `{ provider: 'gemini' | 'openai' | 'deepseek', params: MealGenParams }`
- Returns: `{ plan: DailyPlan[] }`

#### Analyze Food Image
- `POST /api/ai/analyze-food-image`
- Body: `{ provider, base64Image?, mimeType?, clientNote?, goal }`
- Returns: `{ result: string }`

#### Analyze Medical Document
- `POST /api/ai/analyze-medical-document`
- Body: `{ provider, fileContent, mimeType, isImage }`
- Returns: `{ medicalHistory, allergies, medications, dietaryHistory, socialBackground }`

#### Generate Client Insights
- `POST /api/ai/generate-insights`
- Body: `{ provider, clientName, weightHistory, goal }`
- Returns: `{ result: string }`

## Deployment on Coolify

1. **Create a new application** in Coolify
2. **Connect your repository** or upload the backend folder
3. **Set build settings:**
   - Build Command: `npm ci --only=production`
   - Start Command: `node server.js`
   - Port: `3000`

4. **Configure environment variables** in Coolify:
   - `PORT` (optional, defaults to 3000)
   - `CORS_ORIGIN` (your frontend URL, e.g., `https://yourdomain.com`)
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `GEMINI_API_KEY` (required)
   - `OPENAI_API_KEY` (optional)
   - `DEEPSEEK_API_KEY` (optional)

5. **Deploy** the application

### Docker Deployment

If using Docker directly:

```bash
docker build -t nutritherapy-ai-proxy .
docker run -p 3000:3000 --env-file .env nutritherapy-ai-proxy
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3000) |
| `CORS_ORIGIN` | No | Allowed CORS origin (default: `*`) |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `OPENAI_API_KEY` | No | OpenAI API key (optional) |
| `DEEPSEEK_API_KEY` | No | DeepSeek API key (optional) |

## Security Notes

- API keys are stored server-side only
- All requests require valid Supabase JWT tokens
- CORS is configured to restrict origins (set `CORS_ORIGIN` in production)
- Never commit `.env` file to version control

## Troubleshooting

### Authentication Errors
- Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` are correct
- Ensure the JWT token is valid and not expired

### API Key Errors
- Check that the required API keys are set in environment variables
- Verify API keys are valid and have proper permissions

### CORS Errors
- Update `CORS_ORIGIN` to match your frontend URL
- Ensure the frontend is sending the `Authorization` header

## License

Private - Nutritherapy Solutions
