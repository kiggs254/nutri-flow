# Push Notifications Setup Guide

This guide explains how to set up push notifications for the NutriTherapy Solutions client portal.

## Prerequisites

- Node.js 18+ installed
- Backend server running
- Supabase project configured
- HTTPS enabled (required for push notifications, except localhost)

## Step 1: Generate VAPID Keys

VAPID (Voluntary Application Server Identification) keys are required for Web Push API.

### Generate keys using web-push:

```bash
cd backend
npx web-push generate-vapid-keys
```

This will output:
```
Public Key: <your-public-key>
Private Key: <your-private-key>
```

### Or generate programmatically:

```javascript
const webpush = require('web-push');
const vapidKeys = webpush.generateVAPIDKeys();
console.log('Public Key:', vapidKeys.publicKey);
console.log('Private Key:', vapidKeys.privateKey);
```

## Step 2: Configure Environment Variables

Add the following to your backend `.env` file:

```env
# VAPID Keys for Web Push Notifications
VAPID_PUBLIC_KEY=your-public-key-here
VAPID_PRIVATE_KEY=your-private-key-here
VAPID_SUBJECT=mailto:admin@nutritherapy.co.ke
```

**Important:**
- `VAPID_SUBJECT` should be either:
  - An email address: `mailto:admin@nutritherapy.co.ke`
  - A URL: `https://nutritherapy.co.ke`
- Keep the private key secure and never commit it to version control

## Step 3: Run Database Migration

Execute the migration script in your Supabase SQL Editor:

```bash
# The migration file is located at:
migrations/add_push_subscriptions.sql
```

This creates the `push_subscriptions` table with proper RLS policies.

## Step 4: Install Dependencies

```bash
cd backend
npm install
```

The `web-push` package should already be in `package.json`. If not, install it:

```bash
npm install web-push
```

## Step 5: Add PWA Icons

Add the following icon files to `public/icons/`:

- `icon-192x192.png` - 192x192 pixels
- `icon-512x512.png` - 512x512 pixels

These icons are used for:
- PWA installation
- Push notification display
- App badges

You can generate these from your logo using tools like:
- [PWA Asset Generator](https://github.com/onderceylan/pwa-asset-generator)
- [RealFaviconGenerator](https://realfavicongenerator.net/)

## Step 6: Test Push Notifications

1. Start the backend server:
   ```bash
   cd backend
   npm start
   ```

2. Open the client portal in a supported browser (Chrome, Firefox, Edge)

3. Click the notification bell icon in the header

4. Click "Enable" in the Push Notifications section

5. Grant notification permission when prompted

6. Test sending a notification using the backend API:
   ```bash
   curl -X POST http://localhost:3000/api/notifications/send \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <your-jwt-token>" \
     -d '{
       "clientId": "<client-id>",
       "payload": {
         "title": "Test Notification",
         "body": "This is a test push notification",
         "data": {
           "type": "reminder",
           "id": "test-123"
         }
       }
     }'
   ```

## Browser Support

- ✅ Chrome/Edge: Full support
- ✅ Firefox: Full support
- ✅ Opera: Full support
- ⚠️ Safari: Limited support (iOS 16.4+, macOS 13+)
- ❌ Safari (iOS < 16.4): Not supported

## Integration Points

Push notifications are automatically sent for:

1. **Reminders**: When a reminder is created for a client
2. **Messages**: When a nutritionist sends a message
3. **Meal Plans**: When a new meal plan is assigned
4. **Appointments**: When an appointment is created or updated
5. **Invoices**: When an invoice is created or paid

## Troubleshooting

### Notifications not working?

1. **Check VAPID keys**: Ensure they're correctly set in `.env`
2. **Check HTTPS**: Push notifications require HTTPS (except localhost)
3. **Check permissions**: User must grant notification permission
4. **Check service worker**: Ensure service worker is registered
5. **Check browser console**: Look for errors in browser DevTools

### Subscription errors?

- Check that the subscription endpoint is valid
- Ensure the client has an active subscription in the database
- Verify RLS policies allow the client to access their subscriptions

### Backend errors?

- Check backend logs for detailed error messages
- Verify Supabase connection and credentials
- Ensure the `push_subscriptions` table exists

## Security Notes

- VAPID private key must be kept secret
- Push subscriptions are stored with RLS policies
- Only clients can access their own subscriptions
- Backend validates all subscription requests

## Next Steps

After setup, you can:

1. Integrate push notifications with your existing systems
2. Create database triggers to automatically send notifications
3. Add notification preferences for clients
4. Implement notification scheduling
