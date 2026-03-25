# Subtitle Tools

This directory is reserved for standalone subtitle conversion utilities.

Available tool:
- `merge-hls-vtt.ts`
  Convert an HLS subtitle playlist (`.m3u8` + segmented `.vtt`) into a single standard WebVTT file per language.

This tooling is intentionally kept outside the main app runtime so subtitle preprocessing can be run manually before upload.

Example:

```bash
npx tsx scripts/subtitles/merge-hls-vtt.ts \
  --playlist translation/en-US_A42AA38RC57RH68JT45NA44KP47XF55C_emmatest.m3u8 \
  --output tmp/subtitles/ConvoAICaseStudy-09March2026-en-US.vtt \
  --language en-US
```

Notes:
- The script expects a local `.m3u8` playlist that references local `.vtt` segment files.
- By default it rebases timestamps from the first cue so the output starts near `00:00:00.xxx`.
- By default it strips `<v ...>` speaker tags to produce cleaner output for upload and downstream processing.
