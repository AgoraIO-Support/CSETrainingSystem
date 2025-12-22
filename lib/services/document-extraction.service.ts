/**
 * Document Extraction Service
 * Extracts text content from PDF, DOCX, and TXT files for RAG processing
 */

import { createRequire } from 'module';
import mammoth from 'mammoth';

const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse') as typeof import('pdf-parse');

export interface ExtractionResult {
  text: string;
  pageCount?: number;
  wordCount: number;
  metadata: {
    title?: string;
    author?: string;
    createdDate?: Date;
    modifiedDate?: Date;
  };
}

export interface ExtractionOptions {
  maxPages?: number;        // Limit pages for PDFs (default: all)
  preserveFormatting?: boolean; // Keep some formatting like paragraphs
  stripHtml?: boolean;      // Remove HTML tags from DOCX output
}

export class DocumentExtractionService {
  private static readonly DEFAULT_OPTIONS: ExtractionOptions = {
    maxPages: undefined,
    preserveFormatting: true,
    stripHtml: true,
  };

  /**
   * Extract text from a PDF buffer
   */
  static async extractFromPDF(
    buffer: Buffer,
    options: ExtractionOptions = {}
  ): Promise<ExtractionResult> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };

    try {
      const parser = new PDFParse({ data: buffer });
      try {
        const textResult = await parser.getText(
          opts.maxPages ? { first: opts.maxPages } : {}
        );
        const infoResult = await parser.getInfo();

        const text = this.cleanText(textResult.text, opts.preserveFormatting);
        const wordCount = this.countWords(text);

        const info = infoResult.info as Record<string, unknown> | undefined;
        const title = typeof info?.Title === 'string' ? info.Title : undefined;
        const author = typeof info?.Author === 'string' ? info.Author : undefined;
        const creationDate =
          typeof info?.CreationDate === 'string' ? info.CreationDate : undefined;
        const modDate = typeof info?.ModDate === 'string' ? info.ModDate : undefined;

        return {
          text,
          pageCount: textResult.total,
          wordCount,
          metadata: {
            title,
            author,
            createdDate: creationDate ? this.parsePDFDate(creationDate) : undefined,
            modifiedDate: modDate ? this.parsePDFDate(modDate) : undefined,
          },
        };
      } finally {
        try {
          await parser.destroy();
        } catch {
          // best-effort cleanup
        }
      }
    } catch (error) {
      console.error('PDF extraction error:', error);
      throw new Error(
        `Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Extract text from a DOCX buffer
   */
  static async extractFromDocx(
    buffer: Buffer,
    options: ExtractionOptions = {}
  ): Promise<ExtractionResult> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };

    try {
      // mammoth converts DOCX to HTML or plain text
      const result = await mammoth.extractRawText({ buffer });

      if (result.messages.length > 0) {
        // Log any warnings from mammoth
        console.warn('DOCX extraction warnings:', result.messages);
      }

      let text = result.value;

      // Clean up the text
      if (opts.stripHtml) {
        text = this.stripHtmlTags(text);
      }
      text = this.cleanText(text, opts.preserveFormatting);

      const wordCount = this.countWords(text);

      return {
        text,
        wordCount,
        metadata: {},
      };
    } catch (error) {
      console.error('DOCX extraction error:', error);
      throw new Error(
        `Failed to extract text from DOCX: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Extract text from a plain text buffer
   */
  static async extractFromText(
    buffer: Buffer,
    options: ExtractionOptions = {}
  ): Promise<ExtractionResult> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };

    try {
      // Try to detect encoding and convert to UTF-8
      let text = buffer.toString('utf-8');

      // Clean up the text
      text = this.cleanText(text, opts.preserveFormatting);

      const wordCount = this.countWords(text);

      return {
        text,
        wordCount,
        metadata: {},
      };
    } catch (error) {
      console.error('Text extraction error:', error);
      throw new Error(
        `Failed to extract text: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Route to appropriate extractor based on MIME type
   */
  static async extract(
    buffer: Buffer,
    mimeType: string,
    options: ExtractionOptions = {}
  ): Promise<ExtractionResult> {
    const normalizedMimeType = mimeType.toLowerCase().trim();

    switch (normalizedMimeType) {
      case 'application/pdf':
        return this.extractFromPDF(buffer, options);

      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      case 'application/msword':
        return this.extractFromDocx(buffer, options);

      case 'text/plain':
      case 'text/markdown':
      case 'text/html':
        return this.extractFromText(buffer, options);

      default:
        throw new Error(`Unsupported MIME type for text extraction: ${mimeType}`);
    }
  }

  /**
   * Get the MaterialAssetType based on MIME type
   */
  static getMaterialAssetType(mimeType: string): 'PDF' | 'DOCX' | 'TXT' | 'VTT' {
    const normalizedMimeType = mimeType.toLowerCase().trim();

    if (normalizedMimeType === 'application/pdf') {
      return 'PDF';
    }

    if (
      normalizedMimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      normalizedMimeType === 'application/msword'
    ) {
      return 'DOCX';
    }

    if (normalizedMimeType === 'text/vtt') {
      return 'VTT';
    }

    return 'TXT';
  }

  /**
   * Check if a MIME type is supported for extraction
   */
  static isSupportedMimeType(mimeType: string): boolean {
    const supportedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
      'text/markdown',
      'text/html',
      'text/vtt',
    ];

    return supportedTypes.includes(mimeType.toLowerCase().trim());
  }

  /**
   * Clean and normalize extracted text
   */
  private static cleanText(text: string, preserveFormatting?: boolean): string {
    let cleaned = text;

    // Remove null bytes and other control characters (except newlines and tabs)
    cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Normalize line endings
    cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    if (preserveFormatting) {
      // Collapse multiple newlines to double newlines (preserve paragraphs)
      cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
      // Collapse multiple spaces to single space
      cleaned = cleaned.replace(/ {2,}/g, ' ');
    } else {
      // Collapse all whitespace to single spaces
      cleaned = cleaned.replace(/\s+/g, ' ');
    }

    // Trim leading/trailing whitespace
    cleaned = cleaned.trim();

    return cleaned;
  }

  /**
   * Strip HTML tags from text
   */
  private static stripHtmlTags(html: string): string {
    return html
      .replace(/<[^>]+>/g, ' ')  // Remove HTML tags
      .replace(/&nbsp;/g, ' ')   // Replace non-breaking spaces
      .replace(/&amp;/g, '&')    // Replace ampersands
      .replace(/&lt;/g, '<')     // Replace less than
      .replace(/&gt;/g, '>')     // Replace greater than
      .replace(/&quot;/g, '"')   // Replace quotes
      .replace(/&#39;/g, "'");   // Replace apostrophes
  }

  /**
   * Count words in text
   */
  private static countWords(text: string): number {
    return text
      .split(/\s+/)
      .filter(word => word.length > 0)
      .length;
  }

  /**
   * Parse PDF date format (D:YYYYMMDDHHmmSS)
   */
  private static parsePDFDate(pdfDate: string): Date | undefined {
    try {
      // PDF dates can be in format: D:YYYYMMDDHHmmSS or variations
      const match = pdfDate.match(/D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/);
      if (match) {
        const [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
        return new Date(
          parseInt(year),
          parseInt(month) - 1,
          parseInt(day),
          parseInt(hour),
          parseInt(minute),
          parseInt(second)
        );
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Get file extension from MIME type
   */
  static getFileExtension(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      'application/pdf': '.pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/msword': '.doc',
      'text/plain': '.txt',
      'text/markdown': '.md',
      'text/html': '.html',
      'text/vtt': '.vtt',
    };

    return mimeToExt[mimeType.toLowerCase()] || '';
  }

  /**
   * Estimate processing time based on file size
   */
  static estimateProcessingTime(fileSize: number, mimeType: string): number {
    // Returns estimated time in milliseconds
    const bytesPerSecond: Record<string, number> = {
      'application/pdf': 500000,      // PDFs are slower to parse
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 1000000,
      'text/plain': 5000000,          // Plain text is fastest
    };

    const speed = bytesPerSecond[mimeType.toLowerCase()] || 1000000;
    return Math.ceil((fileSize / speed) * 1000);
  }
}
