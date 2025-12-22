/**
 * VTT Parser Service
 * Parses WebVTT files into structured cues for RAG processing
 */

export interface VTTCue {
  id?: string;           // Optional cue identifier
  startTime: number;     // Seconds (float)
  endTime: number;       // Seconds (float)
  text: string;          // Plain text (HTML tags stripped)
  rawText: string;       // Original text with formatting
}

export interface VTTMetadata {
  totalCues: number;
  duration: number;      // Total duration in seconds
  language?: string;
  hasIdentifiers: boolean;
}

export interface ParsedVTT {
  cues: VTTCue[];
  metadata: VTTMetadata;
}

export class VTTParserService {
  /**
   * Parse VTT content into structured cues
   */
  static parse(content: string): ParsedVTT {
    const lines = content.split(/\r?\n/);
    const cues: VTTCue[] = [];

    let currentCue: Partial<VTTCue> | null = null;
    let currentCueId: string | undefined;
    let hasIdentifiers = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip empty lines and WEBVTT header
      if (line === '' || line.startsWith('WEBVTT')) {
        // If we have a current cue, finalize it
        if (currentCue && currentCue.startTime !== undefined && currentCue.endTime !== undefined) {
          cues.push(currentCue as VTTCue);
          currentCue = null;
          currentCueId = undefined;
        }
        continue;
      }

      // Skip NOTE lines
      if (line.startsWith('NOTE')) {
        continue;
      }

      // Check if line contains timestamp
      if (line.includes(' --> ')) {
        // Finalize previous cue if exists
        if (currentCue && currentCue.startTime !== undefined) {
          cues.push(currentCue as VTTCue);
        }

        // Parse timestamp line
        const timestamps = this.parseTimestampLine(line);
        if (timestamps) {
          currentCue = {
            id: currentCueId,
            startTime: timestamps.start,
            endTime: timestamps.end,
            text: '',
            rawText: '',
          };
          currentCueId = undefined;
        }
      } else if (currentCue) {
        // This is cue text
        const separator = currentCue.text ? ' ' : '';
        currentCue.rawText += (currentCue.rawText ? '\n' : '') + line;
        currentCue.text += separator + this.stripTags(line);
      } else if (line !== '') {
        // This might be a cue identifier
        currentCueId = line;
        hasIdentifiers = true;
      }
    }

    // Finalize last cue if exists
    if (currentCue && currentCue.startTime !== undefined && currentCue.endTime !== undefined) {
      cues.push(currentCue as VTTCue);
    }

    // Calculate metadata
    const metadata: VTTMetadata = {
      totalCues: cues.length,
      duration: cues.length > 0 ? Math.max(...cues.map(c => c.endTime)) : 0,
      hasIdentifiers,
    };

    return { cues, metadata };
  }

  /**
   * Parse timestamp line into start/end seconds
   */
  private static parseTimestampLine(line: string): { start: number; end: number } | null {
    const parts = line.split(' --> ');
    if (parts.length < 2) return null;

    // Remove any cue settings (after the end timestamp)
    const endPart = parts[1].split(/\s/)[0];

    const start = this.parseTimestamp(parts[0].trim());
    const end = this.parseTimestamp(endPart.trim());

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
        const ms = parseInt(milliseconds || '0', 10);

        if (isNaN(hours) || isNaN(minutes) || isNaN(secs) || isNaN(ms)) {
          return null;
        }

        return hours * 3600 + minutes * 60 + secs + ms / 1000;
      } else if (parts.length === 2) {
        // MM:SS.mmm
        const minutes = parseInt(parts[0], 10);
        const [seconds, milliseconds] = parts[1].split('.');
        const secs = parseInt(seconds, 10);
        const ms = parseInt(milliseconds || '0', 10);

        if (isNaN(minutes) || isNaN(secs) || isNaN(ms)) {
          return null;
        }

        return minutes * 60 + secs + ms / 1000;
      }
    } catch (error) {
      return null;
    }

    return null;
  }

  /**
   * Strip HTML tags from cue text
   */
  private static stripTags(text: string): string {
    // Remove WebVTT formatting tags like <c>, <v>, <i>, <b>, <u>, etc.
    // IMPORTANT: Do not strip arbitrary angle-bracket content (e.g. "<T>") because
    // it can represent literal spoken text. Unknown tags are preserved and will be
    // escaped later when generating XML.
    return text
      .replace(
        /<\/?(?:c|v|i|b|u|ruby|rt|lang)(?:\.[^>\s]+)?(?:\s[^>]*)?>/gi,
        ''
      )
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }

  /**
   * Format seconds to timestamp string (HH:MM:SS or MM:SS)
   */
  static formatTimestamp(seconds: number, includeHours: boolean = true): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const minutesStr = minutes.toString().padStart(2, '0');
    const secondsStr = secs.toString().padStart(2, '0');

    if (includeHours || hours > 0) {
      const hoursStr = hours.toString().padStart(2, '0');
      return `${hoursStr}:${minutesStr}:${secondsStr}`;
    } else {
      return `${minutesStr}:${secondsStr}`;
    }
  }

  /**
   * Format timestamp range for display
   */
  static formatTimestampRange(start: number, end: number): string {
    return `${this.formatTimestamp(start, false)}-${this.formatTimestamp(end, false)}`;
  }

  /**
   * Merge consecutive cues with similar timestamps (within threshold)
   */
  static mergeCues(cues: VTTCue[], maxGapSeconds: number = 2): VTTCue[] {
    if (cues.length === 0) return [];

    const merged: VTTCue[] = [];
    let current = { ...cues[0] };

    for (let i = 1; i < cues.length; i++) {
      const next = cues[i];

      // If gap between current end and next start is small, merge
      if (next.startTime - current.endTime <= maxGapSeconds) {
        current.endTime = next.endTime;
        current.text += ' ' + next.text;
        current.rawText += '\n' + next.rawText;
      } else {
        merged.push(current);
        current = { ...next };
      }
    }

    merged.push(current);
    return merged;
  }

  /**
   * Extract cues within a time range
   */
  static getCuesInRange(cues: VTTCue[], startTime: number, endTime: number): VTTCue[] {
    return cues.filter(
      cue => (cue.startTime >= startTime && cue.startTime < endTime) ||
             (cue.endTime > startTime && cue.endTime <= endTime) ||
             (cue.startTime <= startTime && cue.endTime >= endTime)
    );
  }

  /**
   * Get full text from all cues
   */
  static getFullText(cues: VTTCue[]): string {
    return cues.map(cue => cue.text).join(' ');
  }

  /**
   * Calculate total word count
   */
  static getWordCount(cues: VTTCue[]): number {
    const fullText = this.getFullText(cues);
    return fullText.split(/\s+/).filter(word => word.length > 0).length;
  }
}
