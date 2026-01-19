# Nutritherapy Solutions - AI Proxy Backend

A Node.js/Express backend server that proxies AI API calls (Gemini, OpenAI, DeepSeek) with Supabase authentication.

## Features

- Secure server-side API key management
- Supabase JWT authentication
- Support for multiple AI providers (Gemini, OpenAI, DeepSeek)
- Email service for authentication emails (signup, password reset, etc.)
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

# VAPID Keys for Web Push Notifications (optional)
# Generate using: npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=your_vapid_public_key_here
VAPID_PRIVATE_KEY=your_vapid_private_key_here
VAPID_SUBJECT=mailto:admin@nutritherapy.co.ke

# Email Service Configuration (SMTP)
# Required for sending authentication emails (signup, password reset, etc.)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=your-email@gmail.com
SMTP_FROM_NAME=NutriTherapy Solutions
APP_URL=http://localhost:5173

# Supabase Service Role Key (optional, for admin operations)
# Required for generating email verification and password reset links
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Webhook Secret (optional, for database trigger webhooks)
# Should match the secret configured in database triggers
WEBHOOK_SECRET=your-webhook-secret-here
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

### Authentication & Email Endpoints

#### Signup
- `POST /api/auth/signup`
- Body: `{ email: string, password: string }`
- Returns: `{ success: boolean, message: string, user: { id, email, emailConfirmed } }`
- Sends signup confirmation email

#### Password Reset
- `POST /api/auth/reset-password`
- Body: `{ email: string }`
- Returns: `{ success: boolean, message: string }`
- Sends password reset email

#### Verify Email
- `GET /api/auth/verify-email?token=<token>&type=<type>`
- Returns: `{ success: boolean, message: string }`

#### Password Changed Confirmation
- `POST /api/auth/change-password-confirmation`
- Body: `{ email: string }`
- Returns: `{ success: boolean, message: string }`
- Sends password changed confirmation email

#### Email Webhook (for database triggers)
- `POST /api/auth/webhook`
- Body: `{ event: string, data: object }`
- Headers: `X-Webhook-Secret: <secret>` (if configured)
- Called by database triggers to send emails

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
| `SUPABASE_SERVICE_ROLE_KEY` | No | Supabase service role key (for admin operations, recommended) |
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `OPENAI_API_KEY` | No | OpenAI API key (optional) |
| `DEEPSEEK_API_KEY` | No | DeepSeek API key (optional) |
| `SMTP_HOST` | Yes* | SMTP server hostname (e.g., smtp.gmail.com) |
| `SMTP_PORT` | No | SMTP port (default: 587) |
| `SMTP_SECURE` | No | Use TLS/SSL (true/false, default: false for port 587) |
| `SMTP_USER` | Yes* | SMTP username/email |
| `SMTP_PASSWORD` | Yes* | SMTP password or app password |
| `SMTP_FROM` | No | From email address (defaults to SMTP_USER) |
| `SMTP_FROM_NAME` | No | From name (default: "NutriTherapy Solutions") |
| `APP_URL` | No | Application URL for email links (default: http://localhost:5173) |
| `WEBHOOK_SECRET` | No | Secret for webhook validation (optional) |
| `VAPID_PUBLIC_KEY` | No | VAPID public key for push notifications |
| `VAPID_PRIVATE_KEY` | No | VAPID private key for push notifications |
| `VAPID_SUBJECT` | No | VAPID subject (email or URL) |

*Required for email functionality

## Security Notes

- API keys are stored server-side only
- All requests require valid Supabase JWT tokens
- CORS is configured to restrict origins (set `CORS_ORIGIN` in production)
- Never commit `.env` file to version control

## Email Service Setup

The backend includes an email service for sending authentication-related emails. This is essential for self-hosted Supabase instances that cannot send emails.

### SMTP Configuration

1. **Gmail Setup:**
   - Enable 2-factor authentication
   - Generate an App Password: https://myaccount.google.com/apppasswords
   - Use these settings:
     ```env
     SMTP_HOST=smtp.gmail.com
     SMTP_PORT=587
     SMTP_SECURE=false
     SMTP_USER=your-email@gmail.com
     SMTP_PASSWORD=your-16-char-app-password
     ```

2. **Other SMTP Providers:**
   - Outlook: `smtp-mail.outlook.com:587`
   - SendGrid: `smtp.sendgrid.net:587`
   - Custom SMTP: Use your provider's SMTP settings

### Database Triggers (Optional)

For automatic email sending via database triggers, run the migration:
```sql
-- In Supabase SQL Editor
\i migrations/add_email_triggers.sql
```

Then configure the webhook URL in your database:
```sql
ALTER DATABASE postgres SET app.webhook_url = 'https://your-backend.com/api/auth/webhook';
ALTER DATABASE postgres SET app.webhook_secret = 'your-secret-key';
```

### Email Templates

The service sends the following emails:
- **Signup Confirmation**: Sent when a new user signs up
- **Password Reset**: Sent when user requests password reset
- **Password Changed**: Sent after successful password change
- **Welcome Email**: Sent after email verification

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

### Email Service Errors
- Verify SMTP credentials are correct
- Check SMTP host and port settings
- For Gmail, ensure you're using an App Password, not your regular password
- Test SMTP connection: The service will log connection status on startup
- Check backend logs for detailed error messages
- Ensure `APP_URL` is set correctly for email links

## License

Private - Nutritherapy Solutions
