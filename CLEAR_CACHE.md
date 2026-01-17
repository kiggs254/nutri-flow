# Clear Service Worker Cache - IMPORTANT!

The app is using a **service worker** that's caching the old JavaScript code with API keys. You MUST clear it:

## Quick Fix (Browser DevTools):

1. **Open Browser DevTools** (F12)
2. Go to **Application** tab (Chrome) or **Storage** tab (Firefox)
3. Click **Service Workers** in the left sidebar
4. Click **Unregister** for any registered service workers
5. Click **Clear storage** → **Clear site data**
6. **Hard refresh**: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)

## Or Use Console:

Open browser console (F12) and run:
```javascript
// Unregister all service workers
navigator.serviceWorker.getRegistrations().then(function(registrations) {
  for(let registration of registrations) {
    registration.unregister();
  }
});

// Clear all caches
caches.keys().then(function(names) {
  for (let name of names) {
    caches.delete(name);
  }
});

// Reload page
location.reload(true);
```

## After Clearing:

1. **Restart your dev server:**
   ```bash
   # Stop current server (Ctrl+C)
   npm run dev
   ```

2. **Verify backend is running:**
   ```bash
   cd backend
   npm start
   ```

3. **Check browser console** - you should see:
   - `[AI Proxy] Calling backend: http://localhost:3000/api/ai/...`
   - No errors about API keys

4. **Test the app** - it should now use the backend proxy!
