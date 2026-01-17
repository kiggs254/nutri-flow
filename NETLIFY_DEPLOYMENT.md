# Netlify Deployment Guide

## Prerequisites

1. **Backend deployed on Coolify** (or your self-hosted server)
   - Backend should be accessible via HTTPS
   - Example: `https://api.yourdomain.com`

2. **Netlify account** and site created

## Step 1: Configure Environment Variables in Netlify

1. Go to your Netlify site dashboard
2. Navigate to **Site settings** → **Environment variables**
3. Add the following variable:

   ```
   VITE_BACKEND_URL = https://api.yourdomain.com
   ```
   
   Replace `https://api.yourdomain.com` with your actual backend URL.

## Step 2: Build Settings

Netlify should auto-detect these from `netlify.toml`, but verify:

- **Build command:** `npm run build`
- **Publish directory:** `dist`
- **Node version:** 18 (or higher)

## Step 3: Deploy

### Option A: Git Integration (Recommended)

1. Push your code to GitHub/GitLab/Bitbucket
2. Connect your repository to Netlify
3. Netlify will automatically deploy on every push

### Option B: Manual Deploy

1. Build locally:
   ```bash
   npm run build
   ```

2. Drag and drop the `dist` folder to Netlify dashboard

## Step 4: Verify Deployment

1. After deployment, visit your Netlify site
2. Open browser DevTools (F12) → Console
3. You should see: `[AI Proxy] Calling backend: https://api.yourdomain.com/api/ai/...`
4. Test AI features (meal plan generation, etc.)

## Important Notes

### Backend CORS Configuration

Make sure your backend has the correct CORS origin set:

In `backend/.env`:
```env
CORS_ORIGIN=https://your-netlify-site.netlify.app
```

Or for custom domain:
```env
CORS_ORIGIN=https://yourdomain.com
```

### Service Worker Cache

The service worker will cache the app. After deployment:
1. Users may need to hard refresh (`Ctrl+Shift+R` or `Cmd+Shift+R`)
2. Or wait for the service worker to update automatically

### Environment Variables

- **DO NOT** add API keys to Netlify environment variables
- Only add `VITE_BACKEND_URL` (the backend URL)
- All API keys stay in your backend server's environment variables

## Troubleshooting

### "Backend not reachable" errors

1. Check that `VITE_BACKEND_URL` is set correctly in Netlify
2. Verify backend is running and accessible
3. Check CORS settings in backend
4. Check browser console for detailed error messages

### Service worker issues

1. Clear browser cache
2. Unregister service worker in DevTools → Application → Service Workers
3. Hard refresh the page

### Build failures

1. Check Netlify build logs
2. Ensure Node version is 18+
3. Verify all dependencies are in `package.json`

## Production Checklist

- [ ] Backend deployed and running
- [ ] `VITE_BACKEND_URL` set in Netlify environment variables
- [ ] Backend `CORS_ORIGIN` includes your Netlify URL
- [ ] All API keys configured in backend environment variables
- [ ] Test AI features work correctly
- [ ] Service worker cache cleared (if needed)
