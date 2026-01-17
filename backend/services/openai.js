/**
 * OpenAI API Service
 */

function extractMessageText(messageContent) {
  if (messageContent == null) return '';

  if (Array.isArray(messageContent)) {
    const parts = messageContent
      .map((part) => {
        if (typeof part === 'string') return part;
        if (typeof part?.text === 'string') return part.text;
        if (typeof part?.content === 'string') return part.content;
        if (Array.isArray(part?.content)) {
          return part.content
            .map((p) => (typeof p === 'string' ? p : p.text ?? ''))
            .join('');
        }
        return '';
      })
      .filter(Boolean);
    return parts.join('\n').trim();
  }

  if (typeof messageContent === 'string') {
    return messageContent;
  }

  if (typeof messageContent === 'object') {
    if (typeof messageContent.text === 'string') {
      return messageContent.text;
    }
    if (Array.isArray(messageContent.content)) {
      return messageContent.content
        .map((p) => (typeof p === 'string' ? p : p.text ?? ''))
        .join('\n')
        .trim();
    }
    try {
      return JSON.stringify(messageContent);
    } catch {
      return '';
    }
  }

  return '';
}

export async function callOpenAI({
  model = 'gpt-4o',
  systemPrompt,
  userPrompt,
  imageBase64,
  mimeType,
  jsonMode = false,
  temperature = 0.7,
  maxTokens = 4096
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const messages = [{ role: 'system', content: systemPrompt }];

  if (imageBase64 && mimeType) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: userPrompt },
        {
          type: 'image_url',
          image_url: { url: `data:${mimeType};base64,${imageBase64}` }
        }
      ]
    });
  } else {
    messages.push({ role: 'user', content: userPrompt });
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      response_format: jsonMode ? { type: 'json_object' } : undefined,
      max_tokens: maxTokens,
      temperature
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new Error(`OpenAI Error: ${err.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const rawContent = data?.choices?.[0]?.message?.content;
  const text = extractMessageText(rawContent);
  
  return text;
}
