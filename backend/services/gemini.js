/**
 * Gemini API Service
 */
export async function callGemini({
  model = 'gemini-2.5-flash',
  systemInstruction,
  parts,
  temperature = 0.7,
  maxOutputTokens = 8192,
  responseSchema,
  responseMimeType
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ parts }]
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const generationConfig = {};
  if (temperature !== undefined) generationConfig.temperature = temperature;
  if (maxOutputTokens !== undefined) generationConfig.maxOutputTokens = maxOutputTokens;
  if (responseMimeType) generationConfig.responseMimeType = responseMimeType;
  if (responseSchema) generationConfig.responseSchema = responseSchema;

  if (Object.keys(generationConfig).length > 0) {
    body.generationConfig = generationConfig;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new Error(`Gemini API Error: ${error.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  if (!text) {
    throw new Error('No response text from Gemini API');
  }

  return text;
}
