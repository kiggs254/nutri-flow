import { extractTextFromWordDoc, isWordDocument, isDocxFile } from './wordExtractor.js';
import { extractTextFromPDF, isPDF } from './pdfExtractor.js';

export async function extractKnowledgeBaseText({ mimeType, fileName, base64Content }) {
  const buf = Buffer.from(base64Content, 'base64');
  if (isPDF(mimeType, fileName || '')) {
    return extractTextFromPDF(buf);
  }
  if (isDocxFile(mimeType, fileName || '')) {
    return extractTextFromWordDoc(buf);
  }
  if (mimeType?.startsWith('text/') || (fileName && fileName.toLowerCase().endsWith('.txt'))) {
    return buf.toString('utf8');
  }
  if (isWordDocument(mimeType, fileName || '') && !isDocxFile(mimeType, fileName || '')) {
    throw new Error('Only .docx Word files are supported. Convert .doc to .docx or use PDF/text.');
  }
  throw new Error('Unsupported file type. Use PDF, DOCX, or plain text.');
}
