import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AIRequest {
  provider: 'gemini' | 'openai' | 'deepseek'
  model?: string
  messages?: Array<{ role: string; content: string | Array<any> }>
  systemInstruction?: string
  temperature?: number
  maxTokens?: number
  responseSchema?: any
  responseMimeType?: string
  images?: Array<{ data: string; mimeType: string }>
  // For Gemini parts format
  parts?: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }>
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client to verify JWT
    // In Supabase Edge Functions, these are available via environment or request headers
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || 
                        req.headers.get('x-supabase-url') || 
                        'https://superbase.emmerce.io'
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') || 
                       req.headers.get('x-supabase-anon-key') || 
                       'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE'
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    })

    // Verify the user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const requestData: AIRequest = await req.json()
    const { provider, model, messages, systemInstruction, temperature, maxTokens, responseSchema, responseMimeType, images, parts } = requestData

    if (!provider) {
      return new Response(
        JSON.stringify({ error: 'Provider is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let response: Response
    let result: any

    switch (provider) {
      case 'gemini':
        result = await callGemini({
          model: model || 'gemini-2.5-flash',
          systemInstruction,
          parts: parts || convertMessagesToParts(messages || [], images),
          temperature,
          maxOutputTokens: maxTokens,
          responseSchema,
          responseMimeType: responseMimeType || (responseSchema ? 'application/json' : undefined)
        })
        break

      case 'openai':
        result = await callOpenAI({
          model: model || 'gpt-4o',
          messages: messages || [],
          systemInstruction,
          temperature,
          maxTokens,
          images
        })
        break

      case 'deepseek':
        result = await callDeepSeek({
          model: model || 'deepseek-chat',
          messages: messages || [],
          systemInstruction,
          temperature,
          maxTokens,
          images
        })
        break

      default:
        return new Response(
          JSON.stringify({ error: `Unsupported provider: ${provider}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error('Edge Function Error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// Helper to convert messages format to Gemini parts format
function convertMessagesToParts(
  messages: Array<{ role: string; content: string | Array<any> }>,
  images?: Array<{ data: string; mimeType: string }>
): Array<{ text?: string; inlineData?: { data: string; mimeType: string } }> {
  const parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }> = []

  // Add images first if provided
  if (images) {
    for (const img of images) {
      parts.push({ inlineData: { data: img.data, mimeType: img.mimeType } })
    }
  }

  // Convert messages to text parts
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      parts.push({ text: msg.content })
    } else if (Array.isArray(msg.content)) {
      // Handle OpenAI-style content array
      for (const item of msg.content) {
        if (item.type === 'text') {
          parts.push({ text: item.text })
        } else if (item.type === 'image_url') {
          // Extract base64 from data URL
          const url = item.image_url?.url || ''
          const match = url.match(/^data:([^;]+);base64,(.+)$/)
          if (match) {
            parts.push({ inlineData: { data: match[2], mimeType: match[1] } })
          }
        }
      }
    }
  }

  return parts
}

// Gemini API call
async function callGemini(params: {
  model: string
  systemInstruction?: string
  parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }>
  temperature?: number
  maxOutputTokens?: number
  responseSchema?: any
  responseMimeType?: string
}): Promise<any> {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured')
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:generateContent?key=${apiKey}`

  const body: any = {
    contents: [{ parts: params.parts }]
  }

  if (params.systemInstruction) {
    body.systemInstruction = { parts: [{ text: params.systemInstruction }] }
  }

  const generationConfig: any = {}
  if (params.temperature !== undefined) generationConfig.temperature = params.temperature
  if (params.maxOutputTokens !== undefined) generationConfig.maxOutputTokens = params.maxOutputTokens
  if (params.responseMimeType) generationConfig.responseMimeType = params.responseMimeType
  if (params.responseSchema) generationConfig.responseSchema = params.responseSchema

  if (Object.keys(generationConfig).length > 0) {
    body.generationConfig = generationConfig
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: response.statusText } }))
    throw new Error(`Gemini API Error: ${error.error?.message || response.statusText}`)
  }

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

  return {
    text,
    raw: data
  }
}

// OpenAI API call
async function callOpenAI(params: {
  model: string
  messages: Array<{ role: string; content: string | Array<any> }>
  systemInstruction?: string
  temperature?: number
  maxTokens?: number
  images?: Array<{ data: string; mimeType: string }>
}): Promise<any> {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured')
  }

  const messages: any[] = []
  
  if (params.systemInstruction) {
    messages.push({ role: 'system', content: params.systemInstruction })
  }

  // Process user messages
  for (const msg of params.messages) {
    if (typeof msg.content === 'string') {
      messages.push({ role: msg.role, content: msg.content })
    } else if (Array.isArray(msg.content)) {
      // Already in OpenAI format
      messages.push({ role: msg.role, content: msg.content })
    } else {
      // Convert to text
      messages.push({ role: msg.role, content: String(msg.content) })
    }
  }

  // Handle images in the last user message if provided
  if (params.images && params.images.length > 0 && messages.length > 0) {
    const lastMessage = messages[messages.length - 1]
    if (lastMessage.role === 'user') {
      const content: any[] = []
      if (typeof lastMessage.content === 'string') {
        content.push({ type: 'text', text: lastMessage.content })
      } else if (Array.isArray(lastMessage.content)) {
        content.push(...lastMessage.content)
      }
      
      for (const img of params.images) {
        content.push({
          type: 'image_url',
          image_url: { url: `data:${img.mimeType};base64,${img.data}` }
        })
      }
      lastMessage.content = content
    }
  }

  const body: any = {
    model: params.model,
    messages,
    temperature: params.temperature ?? 0.7,
    max_tokens: params.maxTokens ?? 4096
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: response.statusText } }))
    throw new Error(`OpenAI API Error: ${error.error?.message || response.statusText}`)
  }

  const data = await response.json()
  const text = data.choices?.[0]?.message?.content || ''

  return {
    text,
    raw: data
  }
}

// DeepSeek API call (OpenAI-compatible)
async function callDeepSeek(params: {
  model: string
  messages: Array<{ role: string; content: string | Array<any> }>
  systemInstruction?: string
  temperature?: number
  maxTokens?: number
  images?: Array<{ data: string; mimeType: string }>
}): Promise<any> {
  const apiKey = Deno.env.get('DEEPSEEK_API_KEY')
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY not configured')
  }

  const messages: any[] = []
  
  if (params.systemInstruction) {
    messages.push({ role: 'system', content: params.systemInstruction })
  }

  // Process user messages (same as OpenAI)
  for (const msg of params.messages) {
    if (typeof msg.content === 'string') {
      messages.push({ role: msg.role, content: msg.content })
    } else if (Array.isArray(msg.content)) {
      messages.push({ role: msg.role, content: msg.content })
    } else {
      messages.push({ role: msg.role, content: String(msg.content) })
    }
  }

  // Handle images in the last user message if provided
  if (params.images && params.images.length > 0 && messages.length > 0) {
    const lastMessage = messages[messages.length - 1]
    if (lastMessage.role === 'user') {
      const content: any[] = []
      if (typeof lastMessage.content === 'string') {
        content.push({ type: 'text', text: lastMessage.content })
      } else if (Array.isArray(lastMessage.content)) {
        content.push(...lastMessage.content)
      }
      
      for (const img of params.images) {
        content.push({
          type: 'image_url',
          image_url: { url: `data:${img.mimeType};base64,${img.data}` }
        })
      }
      lastMessage.content = content
    }
  }

  const body: any = {
    model: params.model,
    messages,
    temperature: params.temperature ?? 0.7,
    max_tokens: params.maxTokens ?? 4096
  }

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: response.statusText } }))
    throw new Error(`DeepSeek API Error: ${error.error?.message || response.statusText}`)
  }

  const data = await response.json()
  const text = data.choices?.[0]?.message?.content || ''

  return {
    text,
    raw: data
  }
}
