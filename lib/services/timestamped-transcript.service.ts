export type TimestampedTranscriptCue = {
    startTime: number
    endTime: number
    text: string
}

const TIMESTAMP_PATTERN = String.raw`\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?`
const LINE_START_RE = new RegExp(String.raw`^\s*(?:\[|\()?(${TIMESTAMP_PATTERN})(?:\]|\))?\s*(?:[-–—:]\s*)?(.*)$`)
const RANGE_HEADER_RE = new RegExp(String.raw`^\s*(?:\[|\()?(${TIMESTAMP_PATTERN})(?:\]|\))?\s*(?:-->|-|–|—)\s*(?:\[|\()?(${TIMESTAMP_PATTERN})(?:\]|\))?\s*$`)
const INLINE_RANGE_RE = new RegExp(String.raw`^\s*(?:\[|\()?(${TIMESTAMP_PATTERN})(?:\]|\))?\s*(?:-->|-|–|—)\s*(?:\[|\()?(${TIMESTAMP_PATTERN})(?:\]|\))?\s*(.*)$`)

const normalizeTimestampText = (value: string) => value.trim().replace(',', '.')

const escapeVttText = (value: string) =>
    value
        .replace(/\r/g, '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')

export class TimestampedTranscriptService {
    static parse(content: string): TimestampedTranscriptCue[] {
        const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        const rangeCues = this.parseRangeBlocks(normalized)
        if (rangeCues.length > 0) return rangeCues

        return this.parseStartTimestampLines(normalized)
    }

    static toVtt(cues: TimestampedTranscriptCue[]): string {
        const blocks = cues.map((cue, index) => {
            return [
                String(index + 1),
                `${this.formatVttTimestamp(cue.startTime)} --> ${this.formatVttTimestamp(cue.endTime)}`,
                escapeVttText(cue.text.trim()),
            ].join('\n')
        })

        return `WEBVTT\n\n${blocks.join('\n\n')}\n`
    }

    static formatVttTimestamp(seconds: number): string {
        const totalMilliseconds = Math.max(0, Math.round(seconds * 1000))
        const hours = Math.floor(totalMilliseconds / 3_600_000)
        const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000)
        const wholeSeconds = Math.floor((totalMilliseconds % 60_000) / 1000)
        const milliseconds = totalMilliseconds % 1000

        return [
            String(hours).padStart(2, '0'),
            String(minutes).padStart(2, '0'),
            `${String(wholeSeconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`,
        ].join(':')
    }

    static parseTimestamp(value: string): number | null {
        const parts = normalizeTimestampText(value).split(':')
        if (parts.length !== 2 && parts.length !== 3) return null

        const [secondsText, millisecondsText = '0'] = parts[parts.length - 1].split('.')
        const seconds = Number.parseInt(secondsText, 10)
        const milliseconds = Number.parseInt(millisecondsText.padEnd(3, '0').slice(0, 3), 10)
        const minutes = Number.parseInt(parts[parts.length - 2], 10)
        const hours = parts.length === 3 ? Number.parseInt(parts[0], 10) : 0

        if (![hours, minutes, seconds, milliseconds].every(Number.isFinite)) return null
        if (minutes < 0 || seconds < 0 || seconds >= 60 || milliseconds < 0) return null

        return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000
    }

    private static parseRangeBlocks(content: string): TimestampedTranscriptCue[] {
        const lines = content.split('\n')
        const cues: TimestampedTranscriptCue[] = []
        let pending: { startTime: number; endTime: number; textLines: string[] } | null = null

        const flush = () => {
            if (!pending) return
            const text = pending.textLines.join(' ').replace(/\s+/g, ' ').trim()
            if (text && pending.endTime > pending.startTime) {
                cues.push({ startTime: pending.startTime, endTime: pending.endTime, text })
            }
            pending = null
        }

        for (const rawLine of lines) {
            const line = rawLine.trim()
            const inlineMatch = line.match(INLINE_RANGE_RE)
            if (inlineMatch) {
                flush()
                const startTime = this.parseTimestamp(inlineMatch[1])
                const endTime = this.parseTimestamp(inlineMatch[2])
                const text = inlineMatch[3]?.trim()
                if (startTime !== null && endTime !== null && text) {
                    cues.push({ startTime, endTime, text })
                } else if (startTime !== null && endTime !== null) {
                    pending = { startTime, endTime, textLines: [] }
                }
                continue
            }

            const rangeMatch = line.match(RANGE_HEADER_RE)
            if (rangeMatch) {
                flush()
                const startTime = this.parseTimestamp(rangeMatch[1])
                const endTime = this.parseTimestamp(rangeMatch[2])
                if (startTime !== null && endTime !== null) {
                    pending = { startTime, endTime, textLines: [] }
                }
                continue
            }

            if (!line) {
                flush()
                continue
            }

            if (pending) {
                pending.textLines.push(line)
            }
        }

        flush()
        return cues
    }

    private static parseStartTimestampLines(content: string): TimestampedTranscriptCue[] {
        const starts: Array<{ startTime: number; text: string }> = []

        for (const rawLine of content.split('\n')) {
            const line = rawLine.trim()
            if (!line) continue
            const match = line.match(LINE_START_RE)
            if (!match) continue
            const startTime = this.parseTimestamp(match[1])
            const text = match[2]?.trim()
            if (startTime === null || !text) continue
            starts.push({ startTime, text })
        }

        return starts
            .map((cue, index) => {
                const nextStart = starts[index + 1]?.startTime
                const inferredEnd = nextStart && nextStart > cue.startTime
                    ? nextStart
                    : cue.startTime + 8
                return {
                    startTime: cue.startTime,
                    endTime: Math.max(cue.startTime + 0.5, inferredEnd),
                    text: cue.text,
                }
            })
            .filter((cue) => cue.text.trim().length > 0)
    }
}
