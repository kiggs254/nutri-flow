/**
 * Word Document Text Extractor
 * Uses mammoth library to extract text from .docx files
 */

import mammoth from 'mammoth';

/**
 * Extract text from a Word document (.docx)
 * @param {Buffer} fileBuffer - The Word document as a Buffer
 * @returns {Promise<string>} The extracted text content
 */
export async function extractTextFromWordDoc(fileBuffer) {
  try {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return result.value; // Returns the extracted text
  } catch (error) {
    throw new Error(`Failed to extract text from Word document: ${error.message}`);
  }
}

/**
 * Check if a file is a Word document based on MIME type or extension
 * @param {string} mimeType - The MIME type
 * @param {string} fileName - The file name (optional, for extension check)
 * @returns {boolean}
 */
export function isWordDocument(mimeType, fileName = '') {
  const wordMimeTypes = [
    'application/msword', // .doc
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // .docx
  ];
  
  const wordExtensions = ['.doc', '.docx'];
  
  return wordMimeTypes.includes(mimeType) || 
         wordExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
}

/**
 * Check if a file is a .docx file (supported by mammoth)
 * @param {string} mimeType - The MIME type
 * @param {string} fileName - The file name (optional)
 * @returns {boolean}
 */
export function isDocxFile(mimeType, fileName = '') {
  return mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
         fileName.toLowerCase().endsWith('.docx');
}
