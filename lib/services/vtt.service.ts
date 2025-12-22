/**
 * VTT Validation Service
 * Validates WebVTT (Video Text Tracks) files for AI RAG processing
 */

export interface VTTValidationError {
  code: string;
  message: string;
  line?: number;
  column?: number;
  context?: string;
  details?: Record<string, any>;
}

export interface VTTValidationWarning {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface VTTValidationResult {
  valid: boolean;
  errors: VTTValidationError[];
  warnings: VTTValidationWarning[];
}

export class VTTValidationService {
  private static readonly TIMESTAMP_REGEX = /^(\d{2}:)?\d{2}:\d{2}\.\d{3}\s-->\s(\d{2}:)?\d{2}:\d{2}\.\d{3}/;

  /**
   * Validate VTT file content
   */
  static async validate(
    content: string,
    videoDuration?: number
  ): Promise<VTTValidationResult> {
    const errors: VTTValidationError[] = [];
    const warnings: VTTValidationWarning[] = [];

    try {
      // 1. Format Check
      const formatError = this.validateFormat(content);
      if (formatError) {
        errors.push(formatError);
        return { valid: false, errors, warnings };
      }

      // 2. Encoding Check
      const encodingError = this.validateEncoding(content);
      if (encodingError) {
        errors.push(encodingError);
        return { valid: false, errors, warnings };
      }

      // 3. Syntax Validation
      const syntaxErrors = this.validateSyntax(content);
      errors.push(...syntaxErrors);

      // 4. Timestamp Continuity
      const continuityWarnings = this.validateTimestampContinuity(content);
      warnings.push(...continuityWarnings);

      // 5. Duration Alignment (if video duration provided)
      if (videoDuration !== undefined) {
        const durationWarning = this.validateDurationAlignment(content, videoDuration);
        if (durationWarning) {
          warnings.push(durationWarning);
        }
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
      };
    } catch (error) {
      errors.push({
        code: 'VTT_VALIDATION_EXCEPTION',
        message: error instanceof Error ? error.message : 'Unknown validation error',
      });
      return { valid: false, errors, warnings };
    }
  }

  /**
   * Validate that file starts with "WEBVTT"
   */
  private static validateFormat(content: string): VTTValidationError | null {
    const trimmed = content.trimStart();

    if (!trimmed.startsWith('WEBVTT')) {
      return {
        code: 'VTT_INVALID_FORMAT',
        message: 'File must start with "WEBVTT"',
        line: 1,
        context: trimmed.split('\n')[0],
        details: {
          expected: 'WEBVTT',
          found: trimmed.split('\n')[0],
        },
      };
    }

    return null;
  }

  /**
   * Validate UTF-8 encoding
   */
  private static validateEncoding(content: string): VTTValidationError | null {
    try {
      // Check for common encoding issues
      // In browser/Node.js, strings are always UTF-16, but we can check for invalid characters
      const encoder = new TextEncoder();
      const decoder = new TextDecoder('utf-8', { fatal: true });

      const encoded = encoder.encode(content);
      decoder.decode(encoded);

      return null;
    } catch (error) {
      return {
        code: 'VTT_ENCODING_ERROR',
        message: 'File must be UTF-8 encoded',
        details: {
          error: error instanceof Error ? error.message : 'Unknown encoding error',
        },
      };
    }
  }

  /**
   * Validate VTT syntax (timestamps, cue structure)
   */
  private static validateSyntax(content: string): VTTValidationError[] {
    const errors: VTTValidationError[] = [];
    const lines = content.split(/\r?\n/);

    let lineNumber = 0;
    let inCue = false;
    let expectingTimestamp = false;

    for (const line of lines) {
      lineNumber++;

      // Skip the WEBVTT header
      if (lineNumber === 1) {
        continue;
      }

      const trimmedLine = line.trim();

      // Empty line - end of cue or separator
      if (trimmedLine === '') {
        inCue = false;
        expectingTimestamp = false;
        continue;
      }

      // NOTE line (starts with NOTE)
      if (trimmedLine.startsWith('NOTE')) {
        continue;
      }

      // Check if line contains timestamp
      if (trimmedLine.includes(' --> ')) {
        const timestampError = this.validateTimestampLine(trimmedLine, lineNumber);
        if (timestampError) {
          errors.push(timestampError);
        }
        inCue = true;
        expectingTimestamp = false;
      } else if (!inCue && trimmedLine !== '') {
        // This could be a cue identifier
        expectingTimestamp = true;
      } else if (expectingTimestamp && !trimmedLine.includes(' --> ')) {
        // We expected a timestamp after cue identifier
        errors.push({
          code: 'VTT_SYNTAX_ERROR',
          message: 'Expected timestamp after cue identifier',
          line: lineNumber,
          context: trimmedLine,
        });
      }
    }

    return errors;
  }

  /**
   * Validate a single timestamp line
   */
  private static validateTimestampLine(line: string, lineNumber: number): VTTValidationError | null {
    if (!this.TIMESTAMP_REGEX.test(line.split('-->')[0] + '-->' + line.split('-->')[1]?.split(/\s/)[0])) {
      // Try to provide helpful error message
      if (!line.includes(' --> ')) {
        return {
          code: 'VTT_SYNTAX_ERROR',
          message: 'Invalid timestamp separator (expected " --> " with spaces)',
          line: lineNumber,
          context: line,
          details: {
            expected: '" --> "',
            found: line.includes('->') ? '" -> "' : 'missing separator',
          },
        };
      }

      return {
        code: 'VTT_SYNTAX_ERROR',
        message: 'Invalid timestamp format',
        line: lineNumber,
        context: line,
        details: {
          expected: '00:00:00.000 --> 00:00:05.000 or 00:00.000 --> 00:05.000',
        },
      };
    }

    // Validate that start < end
    const timestamps = this.parseTimestampLine(line);
    if (timestamps && timestamps.start >= timestamps.end) {
      return {
        code: 'VTT_SYNTAX_ERROR',
        message: 'Cue end time must be greater than start time',
        line: lineNumber,
        context: line,
        details: {
          start: timestamps.start,
          end: timestamps.end,
        },
      };
    }

    return null;
  }

  /**
   * Parse timestamp line into start/end seconds
   */
  private static parseTimestampLine(line: string): { start: number; end: number } | null {
    const parts = line.split(' --> ');
    if (parts.length !== 2) return null;

    const start = this.parseTimestamp(parts[0].trim());
    const end = this.parseTimestamp(parts[1].split(/\s/)[0].trim());

    if (start === null || end === null) return null;

    return { start, end };
  }

  /**
   * Parse timestamp string to seconds
   * Formats: HH:MM:SS.mmm or MM:SS.mmm
   */
  private static parseTimestamp(timestamp: string): number | null {
    const parts = timestamp.split(':');

    try {
      if (parts.length === 3) {
        // HH:MM:SS.mmm
        const hours = parseInt(parts[0], 10);
        const minutes = parseInt(parts[1], 10);
        const [seconds, milliseconds] = parts[2].split('.');
        const secs = parseInt(seconds, 10);
        const ms = parseInt(milliseconds, 10);

        return hours * 3600 + minutes * 60 + secs + ms / 1000;
      } else if (parts.length === 2) {
        // MM:SS.mmm
        const minutes = parseInt(parts[0], 10);
        const [seconds, milliseconds] = parts[1].split('.');
        const secs = parseInt(seconds, 10);
        const ms = parseInt(milliseconds, 10);

        return minutes * 60 + secs + ms / 1000;
      }
    } catch (error) {
      return null;
    }

    return null;
  }

  /**
   * Validate timestamp continuity (warn on overlaps or gaps)
   */
  private static validateTimestampContinuity(content: string): VTTValidationWarning[] {
    const warnings: VTTValidationWarning[] = [];
    const lines = content.split(/\r?\n/);

    let previousEnd: number | null = null;
    let lineNumber = 0;

    for (const line of lines) {
      lineNumber++;

      if (line.includes(' --> ')) {
        const timestamps = this.parseTimestampLine(line);
        if (!timestamps) continue;

        // Check if start is before previous end (overlap)
        if (previousEnd !== null && timestamps.start < previousEnd) {
          warnings.push({
            code: 'VTT_TIMESTAMP_OVERLAP',
            message: 'Cue overlaps with previous cue',
            details: {
              line: lineNumber,
              currentStart: timestamps.start,
              previousEnd,
              overlap: previousEnd - timestamps.start,
            },
          });
        }

        previousEnd = timestamps.end;
      }
    }

    return warnings;
  }

  /**
   * Validate that transcript timestamps don't exceed video duration
   */
  private static validateDurationAlignment(
    content: string,
    videoDuration: number
  ): VTTValidationWarning | null {
    const lines = content.split(/\r?\n/);
    let maxTimestamp = 0;

    for (const line of lines) {
      if (line.includes(' --> ')) {
        const timestamps = this.parseTimestampLine(line);
        if (timestamps) {
          maxTimestamp = Math.max(maxTimestamp, timestamps.end);
        }
      }
    }

    // Allow 5% tolerance or 30 seconds, whichever is greater
    const tolerance = Math.max(videoDuration * 0.05, 30);

    if (maxTimestamp > videoDuration + tolerance) {
      return {
        code: 'VTT_DURATION_MISMATCH',
        message: 'Transcript timestamps exceed video duration',
        details: {
          videoDuration,
          maxTimestamp,
          difference: maxTimestamp - videoDuration,
          tolerance,
        },
      };
    }

    return null;
  }

  /**
   * Extract all timestamps from VTT content
   */
  static extractTimestamps(content: string): Array<{ start: number; end: number; text: string }> {
    const timestamps: Array<{ start: number; end: number; text: string }> = [];
    const lines = content.split(/\r?\n/);

    let currentCue: { start: number; end: number; text: string } | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.includes(' --> ')) {
        const parsed = this.parseTimestampLine(trimmed);
        if (parsed) {
          currentCue = { ...parsed, text: '' };
        }
      } else if (currentCue && trimmed !== '' && !trimmed.startsWith('NOTE')) {
        currentCue.text += (currentCue.text ? ' ' : '') + trimmed;
      } else if (trimmed === '' && currentCue) {
        timestamps.push(currentCue);
        currentCue = null;
      }
    }

    // Push last cue if exists
    if (currentCue) {
      timestamps.push(currentCue);
    }

    return timestamps;
  }
}
