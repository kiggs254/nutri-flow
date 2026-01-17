# Migration to Backend AI Proxy - Complete

## What Changed

### ✅ Backend Implementation
- Created Express.js backend server in `backend/` directory
- All AI API calls now go through the backend proxy
- API keys are stored server-side only (environment variables)
- Supabase JWT authentication required for all AI endpoints

### ✅ Client-Side Updates
- `services/geminiService.ts` - Now calls backend proxy instead of direct API calls
- `components/AccountSettings.tsx` - Removed all API key input fields
- Provider selection now only shows providers with configured API keys
- All localStorage API key storage removed

### ✅ New Features
- Backend endpoint `/api/ai/providers` - Returns list of available providers
- Account Settings dynamically shows only available providers
- Better error handling and authentication

## Configuration Required

### 1. Backend Environment Variables
Create a `.env` file in the `backend/` directory:

```env
PORT=3000
CORS_ORIGIN=http://localhost:3000

SUPABASE_URL=https://superbase.emmerce.io
SUPABASE_ANON_KEY=your_supabase_anon_key_here

GEMINI_API_KEY=your_gemini_api_key_here
OPENAI_API_KEY=your_openai_api_key_here  # Optional
DEEPSEEK_API_KEY=your_deepseek_api_key_here  # Optional
```

### 2. Frontend Environment Variable
Create or update `.env` in the project root:

```env
VITE_BACKEND_URL=http://localhost:3000
```

For production, set this to your deployed backend URL:
```env
VITE_BACKEND_URL=https://api.yourdomain.com
```

## Testing

1. **Start the backend:**
   ```bash
   cd backend
   npm install
   npm start
   ```

2. **Start the frontend:**
   ```bash
   npm run dev
   ```

3. **Verify:**
   - Log in to the app
   - Go to Account Settings
   - You should see only providers with configured API keys
   - Try generating a meal plan - it should use the backend

## Troubleshooting

### "Backend request failed" errors
- Check that `VITE_BACKEND_URL` is set correctly
- Verify the backend server is running
- Check browser console for CORS errors

### "Not authenticated" errors
- Make sure you're logged in
- Check that Supabase session is valid
- Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` in backend `.env`

### Provider not showing in Account Settings
- Check that the corresponding API key is set in backend `.env`
- Restart the backend server after adding new API keys
- Check browser console for errors fetching providers

### CORS errors
- Update `CORS_ORIGIN` in backend `.env` to match your frontend URL
- For development: `CORS_ORIGIN=http://localhost:5173` (or your Vite port)
- For production: `CORS_ORIGIN=https://yourdomain.com`

## Deployment

### Backend (Coolify)
1. Point Coolify to the `backend/` directory
2. Set all environment variables in Coolify
3. Set `CORS_ORIGIN` to your frontend URL (e.g., `https://your-netlify-site.netlify.app`)
4. Deploy

### Frontend (Netlify)
1. **Set Environment Variable in Netlify:**
   - Go to Site settings → Environment variables
   - Add: `VITE_BACKEND_URL = https://api.yourdomain.com` (your backend URL)

2. **Deploy:**
   - Connect your Git repository to Netlify (recommended)
   - Or manually deploy the `dist` folder after running `npm run build`
   - Netlify will use `netlify.toml` for build configuration

3. **Verify:**
   - Check browser console for `[AI Proxy] Calling backend: ...` messages
   - Test AI features to ensure they work

See `NETLIFY_DEPLOYMENT.md` for detailed Netlify deployment instructions.

## Security Notes

✅ API keys are now server-side only
✅ All requests require authentication
✅ CORS is configured to restrict origins
✅ No sensitive data in client-side code
