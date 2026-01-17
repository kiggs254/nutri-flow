/**
 * OpenAI API Service
 */

/**
 * Upload a file to OpenAI Files API
 * @param {Buffer} fileBuffer - The file content as a Buffer
 * @param {string} fileName - The name of the file
 * @param {string} mimeType - The MIME type of the file
 * @returns {Promise<string>} The file_id from OpenAI
 */
export async function uploadFileToOpenAI(fileBuffer, fileName, mimeType) {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  // Determine the correct purpose based on file type
  // "vision" purpose only accepts images (gif, jpeg, jpg, png, webp)
  // For PDFs, we need to use a different approach - send directly in chat completions
  const isImage = mimeType && (
    mimeType.startsWith('image/') ||
    mimeType === 'image/jpeg' ||
    mimeType === 'image/png' ||
    mimeType === 'image/gif' ||
    mimeType === 'image/webp'
  );

  // For PDFs, we'll send them directly in the chat completions API instead of Files API
  // The Files API with "vision" purpose doesn't support PDFs
  if (mimeType === 'application/pdf') {
    // Return null to indicate we should send PDF directly, not via Files API
    return null;
  }

  // For images, use Files API with "vision" purpose
  if (isImage) {
    const formData = new FormData();
    
    let fileObject;
    if (typeof File !== 'undefined') {
      fileObject = new File([fileBuffer], fileName, { type: mimeType });
    } else {
      fileObject = new Blob([fileBuffer], { type: mimeType });
    }
    
    formData.append('file', fileObject, fileName);
    formData.append('purpose', 'vision');

    const response = await fetch('https://api.openai.com/v1/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(`OpenAI File Upload Error: ${err.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.id; // Return file_id
  }

  // For other file types, return null to handle differently
  return null;
}

/**
 * Delete a file from OpenAI Files API
 * @param {string} fileId - The file_id to delete
 * @returns {Promise<void>}
 */
export async function deleteOpenAIFile(fileId) {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const response = await fetch(`https://api.openai.com/v1/files/${fileId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    }
  });

  if (!response.ok) {
    // Log error but don't throw - cleanup failures shouldn't break the flow
    const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
    console.warn(`Failed to delete OpenAI file ${fileId}:`, err.error?.message || response.statusText);
  }
}

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
  fileId, // New parameter for OpenAI Files API file_id
  jsonMode = false,
  temperature = 0.7,
  maxTokens = 4096
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const messages = [{ role: 'system', content: systemPrompt }];

  // Handle file_id (for files uploaded via Files API - currently not used for PDFs)
  if (fileId) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: userPrompt },
        {
          type: 'input_file',
          input_file: { file_id: fileId }
        }
      ]
    });
  }
  // Handle images and PDFs sent as base64
  else if (imageBase64 && mimeType) {
    const isImageType = (
      mimeType.startsWith('image/') ||
      mimeType === 'image/jpeg' ||
      mimeType === 'image/png' ||
      mimeType === 'image/gif' ||
      mimeType === 'image/webp'
    );

    const isPDF = mimeType === 'application/pdf';

    if (isImageType) {
      // Send images using image_url format
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
    } else if (isPDF) {
      // PDFs can be sent directly to vision models (gpt-4o) as base64
      // OpenAI's vision API supports PDFs in the same format as images
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
      // For other non-image files sent as base64, send as text
      const fullPrompt = `${userPrompt}\n\n[Note: Document file was uploaded but text extraction is required for full analysis. Please analyze based on the provided context.]`;
      messages.push({ role: 'user', content: fullPrompt });
    }
  } else {
    // Regular text content
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
