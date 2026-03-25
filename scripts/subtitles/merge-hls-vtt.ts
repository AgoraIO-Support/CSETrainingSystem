import { promises as fs } from 'fs'
import path from 'path'

type Cue = {
    startMs: number
    endMs: number
    text: string
}

type Options = {
    playlist: string
    output: string
    language?: string
    stripVoiceTags: boolean
    stripAllTags: boolean
    rebaseFromFirstCue: boolean
}

function printUsage() {
    console.log(`
Usage:
  npx tsx scripts/subtitles/merge-hls-vtt.ts --playlist <path/to/track.m3u8> --output <path/to/output.vtt> [options]

Options:
  --language <code>         Optional language tag for logging only, e.g. en-US
  --keep-voice-tags         Preserve <v ...> tags in cue text
  --keep-html-tags          Preserve all cue tags
  --no-rebase               Keep original cue timestamps instead of rebasing from the first cue
  --help                    Show this help message
`)
}

function parseArgs(argv: string[]): Options {
    let playlist = ''
    let output = ''
    let language: string | undefined
    let stripVoiceTags = true
    let stripAllTags = true
    let rebaseFromFirstCue = true

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i]

        if (arg === '--playlist') {
            playlist = argv[i + 1] ?? ''
            i += 1
            continue
        }
        if (arg === '--output') {
            output = argv[i + 1] ?? ''
            i += 1
            continue
        }
        if (arg === '--language') {
            language = argv[i + 1] ?? ''
            i += 1
            continue
        }
        if (arg === '--keep-voice-tags') {
            stripVoiceTags = false
            continue
        }
        if (arg === '--keep-html-tags') {
            stripAllTags = false
            continue
        }
        if (arg === '--no-rebase') {
            rebaseFromFirstCue = false
            continue
        }
        if (arg === '--help' || arg === '-h') {
            printUsage()
            process.exit(0)
        }

        throw new Error(`Unknown argument: ${arg}`)
    }

    if (!playlist || !output) {
        printUsage()
        throw new Error('Both --playlist and --output are required')
    }

    return {
        playlist,
        output,
        language: language?.trim() || undefined,
        stripVoiceTags,
        stripAllTags,
        rebaseFromFirstCue,
    }
}

function normalizeNewlines(input: string) {
    return input.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function parsePlaylistSegmentPaths(content: string) {
    return normalizeNewlines(content)
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#'))
}

function parseTimestampToMs(raw: string) {
    const normalized = raw.trim().replace(',', '.')
    const parts = normalized.split(':')
    if (parts.length < 2 || parts.length > 3) {
        throw new Error(`Unsupported timestamp format: ${raw}`)
    }

    const secondsPart = parts[parts.length - 1]
    const seconds = Number(secondsPart)
    const minutes = Number(parts[parts.length - 2])
    const hours = parts.length === 3 ? Number(parts[0]) : 0

    if ([hours, minutes, seconds].some((value) => Number.isNaN(value))) {
        throw new Error(`Invalid timestamp value: ${raw}`)
    }

    return Math.round(((hours * 60 * 60) + (minutes * 60) + seconds) * 1000)
}

function formatTimestamp(ms: number) {
    const safe = Math.max(0, ms)
    const hours = Math.floor(safe / 3_600_000)
    const minutes = Math.floor((safe % 3_600_000) / 60_000)
    const seconds = Math.floor((safe % 60_000) / 1000)
    const millis = safe % 1000
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

function sanitizeCueText(input: string, options: Pick<Options, 'stripVoiceTags' | 'stripAllTags'>) {
    let text = input
    if (options.stripVoiceTags) {
        text = text.replace(/<v(?:\s+[^>]*)?>/gi, '').replace(/<\/v>/gi, '')
    }
    if (options.stripAllTags) {
        text = text.replace(/<[^>]+>/g, '')
    }

    return text
        .split('\n')
        .map((line) => line.trimEnd())
        .join('\n')
        .trim()
}

function parseCueBlock(block: string, options: Pick<Options, 'stripVoiceTags' | 'stripAllTags'>): Cue | null {
    const lines = normalizeNewlines(block)
        .split('\n')
        .map((line) => line.trimEnd())
        .filter((line, index, all) => !(index === 0 && line.trim() === '') && !(index === all.length - 1 && line.trim() === ''))

    if (lines.length === 0) return null
    if (lines[0].startsWith('NOTE') || lines[0] === 'STYLE' || lines[0] === 'REGION') return null

    const timingLineIndex = lines.findIndex((line) => line.includes('-->'))
    if (timingLineIndex === -1) return null

    const timingLine = lines[timingLineIndex]
    const match = timingLine.match(/^\s*([0-9:.]+)\s+-->\s+([0-9:.]+)/)
    if (!match) {
        throw new Error(`Failed to parse timing line: ${timingLine}`)
    }

    const textLines = lines.slice(timingLineIndex + 1)
    const text = sanitizeCueText(textLines.join('\n'), options)
    if (!text) return null

    return {
        startMs: parseTimestampToMs(match[1]),
        endMs: parseTimestampToMs(match[2]),
        text,
    }
}

function parseSegmentVtt(content: string, options: Pick<Options, 'stripVoiceTags' | 'stripAllTags'>) {
    const normalized = normalizeNewlines(content).replace(/^\uFEFF/, '')
    const blocks = normalized.split(/\n{2,}/)
    const cues: Cue[] = []

    for (const block of blocks) {
        const trimmed = block.trim()
        if (!trimmed || trimmed === 'WEBVTT') continue
        const cue = parseCueBlock(trimmed, options)
        if (cue) {
            cues.push(cue)
        }
    }

    return cues
}

function dedupeAndSortCues(cues: Cue[]) {
    const seen = new Set<string>()
    const sorted = cues
        .slice()
        .sort((a, b) => (a.startMs - b.startMs) || (a.endMs - b.endMs) || a.text.localeCompare(b.text))

    return sorted.filter((cue) => {
        const key = `${cue.startMs}|${cue.endMs}|${cue.text}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })
}

function renderWebVtt(cues: Cue[]) {
    const lines = ['WEBVTT', '']

    cues.forEach((cue, index) => {
        lines.push(String(index + 1))
        lines.push(`${formatTimestamp(cue.startMs)} --> ${formatTimestamp(cue.endMs)}`)
        lines.push(cue.text)
        lines.push('')
    })

    return `${lines.join('\n').trimEnd()}\n`
}

async function main() {
    const options = parseArgs(process.argv.slice(2))
    const playlistPath = path.resolve(options.playlist)
    const outputPath = path.resolve(options.output)
    const playlistDir = path.dirname(playlistPath)

    const playlistContent = await fs.readFile(playlistPath, 'utf8')
    const segmentPaths = parsePlaylistSegmentPaths(playlistContent)

    if (segmentPaths.length === 0) {
        throw new Error(`No subtitle segments found in playlist: ${playlistPath}`)
    }

    const allCues: Cue[] = []

    for (const relativeSegmentPath of segmentPaths) {
        const segmentPath = path.resolve(playlistDir, relativeSegmentPath)
        const segmentContent = await fs.readFile(segmentPath, 'utf8')
        const segmentCues = parseSegmentVtt(segmentContent, options)
        allCues.push(...segmentCues)
    }

    if (allCues.length === 0) {
        throw new Error(`No cues parsed from playlist: ${playlistPath}`)
    }

    const dedupedCues = dedupeAndSortCues(allCues)
    const baseMs = options.rebaseFromFirstCue ? dedupedCues[0].startMs : 0
    const rebasedCues = dedupedCues.map((cue) => ({
        ...cue,
        startMs: cue.startMs - baseMs,
        endMs: cue.endMs - baseMs,
    }))

    await fs.mkdir(path.dirname(outputPath), { recursive: true })
    await fs.writeFile(outputPath, renderWebVtt(rebasedCues), 'utf8')

    const totalDurationMs = rebasedCues[rebasedCues.length - 1].endMs
    console.log(`Merged ${segmentPaths.length} segment files into ${outputPath}`)
    console.log(`Language: ${options.language ?? 'unspecified'}`)
    console.log(`Cues: ${rebasedCues.length}`)
    console.log(`Duration: ${formatTimestamp(totalDurationMs)}`)
    console.log(`Rebased from first cue: ${options.rebaseFromFirstCue ? 'yes' : 'no'}`)
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
})
