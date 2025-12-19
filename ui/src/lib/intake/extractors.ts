import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import mammoth from 'mammoth';

import { INTAKE_STATUS_STEPS } from './config';
import type { IntakeProgressUpdate, ResumeExtractionResult } from './types';

import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.js?url';

GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function detectLanguage(text: string): string | undefined {
  const printableAscii = text.replace(/[^\u0020-\u007E]/g, '');
  const asciiRatio = printableAscii.length / (text.length || 1);
  if (asciiRatio > 0.98) {
    return 'en';
  }
  return undefined;
}

async function extractPdf(file: File): Promise<ResumeExtractionResult> {
  const arrayBuffer = await file.arrayBuffer();
  // Clone the buffer to preserve original for vault storage
  const clonedForPdfJs = arrayBuffer.slice(0);
  const pdf = await getDocument({ data: clonedForPdfJs }).promise;

  let text = '';
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    let pageText = '';

    for (const item of content.items) {
      if (!('str' in item)) continue;

      // transform[5] is the y-coordinate (from bottom-left in PDF usually)
      const currentY = item.transform[5];

      if (lastY !== null && Math.abs(currentY - lastY) > 5) {
        pageText += '\n';
      } else if (pageText.length > 0 && !pageText.endsWith('\n')) {
        pageText += ' ';
      }

      pageText += item.str;
      lastY = currentY;
    }

    text += `${pageText}\n\n`;
  }

  return {
    text: text.trim(),
    raw: arrayBuffer,
    metadata: {
      fileName: file.name,
      fileType: file.type || 'application/pdf',
      fileSize: file.size,
      pageCount: pdf.numPages,
      wordCount: countWords(text),
      language: detectLanguage(text),
    },
  };
}

async function extractDocx(file: File): Promise<ResumeExtractionResult> {
  const arrayBuffer = await file.arrayBuffer();
  // Clone the ArrayBuffer before passing to mammoth to prevent detachment
  const clonedBuffer = arrayBuffer.slice(0);
  const result = await mammoth.extractRawText({ arrayBuffer: clonedBuffer });

  return {
    text: result.value.trim(),
    raw: arrayBuffer,
    metadata: {
      fileName: file.name,
      fileType:
        file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileSize: file.size,
      wordCount: countWords(result.value),
      language: detectLanguage(result.value),
    },
  };
}

async function extractPlainText(file: File): Promise<ResumeExtractionResult> {
  const [text, arrayBuffer] = await Promise.all([file.text(), file.arrayBuffer()]);
  return {
    text: text.trim(),
    raw: arrayBuffer,
    metadata: {
      fileName: file.name,
      fileType: file.type || 'text/plain',
      fileSize: file.size,
      wordCount: countWords(text),
      language: detectLanguage(text),
    },
  };
}

export async function extractResumeWithProgress(
  file: File,
  emit: (update: IntakeProgressUpdate) => void
): Promise<ResumeExtractionResult> {
  emit({
    stage: 'extract',
    step: {
      ...INTAKE_STATUS_STEPS.extract,
      state: 'in_progress',
      startedAt: new Date().toISOString(),
    },
  });

  const extension = file.name.split('.').pop()?.toLowerCase();
  let result: ResumeExtractionResult;

  try {
    if (file.type === 'application/pdf' || extension === 'pdf') {
      result = await extractPdf(file);
    } else if (
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      extension === 'docx'
    ) {
      result = await extractDocx(file);
    } else {
      result = await extractPlainText(file);
    }
  } catch (error) {
    emit({
      stage: 'extract',
      step: {
        ...INTAKE_STATUS_STEPS.extract,
        state: 'error',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });
    throw error;
  }

  emit({
    stage: 'extract',
    step: {
      ...INTAKE_STATUS_STEPS.extract,
      state: 'completed',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    },
  });

  return result;
}
