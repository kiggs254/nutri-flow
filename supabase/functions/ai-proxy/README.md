# AI Proxy Edge Function

This Supabase Edge Function proxies AI API calls to Gemini, OpenAI, and DeepSeek, securing API keys server-side.

## Setup

### 1. Set Environment Secrets

Set the following secrets in your Supabase project:

```bash
supabase secrets set GEMINI_API_KEY=your_gemini_api_key_here
supabase secrets set OPENAI_API_KEY=your_openai_api_key_here
supabase secrets set DEEPSEEK_API_KEY=your_deepseek_api_key_here
```

Or via Supabase Dashboard:
1. Go to Project Settings → Edge Functions → Secrets
2. Add each secret key-value pair

### 2. Deploy the Function

```bash
supabase functions deploy ai-proxy
```

### 3. Verify Deployment

The function will be available at:
```
https://your-project.supabase.co/functions/v1/ai-proxy
```

## Usage

The Edge Function requires:
- **Authentication**: Valid Supabase JWT token in `Authorization` header
- **Request Body**: JSON with provider and parameters

### Request Format

```typescript
{
  provider: 'gemini' | 'openai' | 'deepseek',
  model?: string,              // Optional, defaults per provider
  systemInstruction?: string,  // System prompt
  messages?: Array<{           // For OpenAI/DeepSeek format
    role: string,
    content: string | Array<any>
  }>,
  parts?: Array<{              // For Gemini format
    text?: string,
    inlineData?: { data: string, mimeType: string }
  }>,
  temperature?: number,
  maxTokens?: number,
  responseSchema?: object,      // Gemini JSON schema
  responseMimeType?: string,    // Gemini response format
  images?: Array<{              // Image attachments
    data: string,              // Base64 encoded
    mimeType: string
  }>
}
```

### Response Format

```typescript
{
  text: string,                // The generated text response
  raw?: any                    // Raw API response (optional)
}
```

## Default Models

- **Gemini**: `gemini-2.5-flash`
- **OpenAI**: `gpt-4o`
- **DeepSeek**: `deepseek-chat`

## Error Handling

The function returns consistent error format:
```typescript
{
  error: string  // Error message
}
```

HTTP Status Codes:
- `401`: Unauthorized (missing/invalid JWT)
- `400`: Bad Request (missing provider or invalid parameters)
- `500`: Internal Server Error (API call failed)
