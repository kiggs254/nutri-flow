/**
 * PDF Text Extractor
 * Uses pdf-parse library to extract text from PDF files
 */

import pdf from 'pdf-parse';

/**
 * Extract text from a PDF file
 * @param {Buffer} fileBuffer - The PDF file as a Buffer
 * @returns {Promise<string>} The extracted text content
 */
export async function extractTextFromPDF(fileBuffer) {
  try {
    const data = await pdf(fileBuffer);
    return data.text; // Returns the extracted text
  } catch (error) {
    throw new Error(`Failed to extract text from PDF: ${error.message}`);
  }
}

/**
 * Check if a file is a PDF based on MIME type or extension
 * @param {string} mimeType - The MIME type
 * @param {string} fileName - The file name (optional, for extension check)
 * @returns {boolean}
 */
export function isPDF(mimeType, fileName = '') {
  return mimeType === 'application/pdf' || 
         fileName.toLowerCase().endsWith('.pdf');
}
