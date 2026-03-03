#!/usr/bin/env node
// Lightweight logic checks for VTT detection/display behavior.

const getFileExtension = (value) => {
  if (!value) return null;
  const cleanValue = value.split('?')[0]?.split('#')[0] || value;
  const dotIndex = cleanValue.lastIndexOf('.');
  if (dotIndex === -1 || dotIndex === cleanValue.length - 1) return null;
  return cleanValue.slice(dotIndex + 1).toLowerCase();
};

const isVttFile = (file) => {
  if (!file) return false;
  const mimeType = (file.type || '').toLowerCase();
  if (mimeType.includes('vtt')) return true;
  return getFileExtension(file.name || '') === 'vtt';
};

const isVttAsset = (asset) => {
  if (!asset) return false;
  const mimeType = (asset.mimeType || '').toLowerCase();
  if (mimeType.includes('vtt')) return true;
  const urlExt = getFileExtension(asset.url || '');
  const titleExt = getFileExtension(asset.title || '');
  return urlExt === 'vtt' || titleExt === 'vtt';
};

const getAssetDisplayType = (asset) => {
  if (isVttAsset(asset)) return 'VTT';
  return asset.type || asset.mimeType || 'Unknown';
};

const detectAssetType = (file) => {
  const mimeType = (file.type || '').toLowerCase();
  const extension = (file.name || '').split('.').pop()?.toLowerCase();

  if (isVttFile(file)) {
    return 'TEXT';
  }

  if (mimeType.startsWith('video/') || ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v'].includes(extension || '')) {
    return 'VIDEO';
  }
  if (mimeType.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(extension || '')) {
    return 'AUDIO';
  }
  if (['ppt', 'pptx', 'key', 'odp'].includes(extension || '') ||
      mimeType.includes('presentation') || mimeType.includes('powerpoint')) {
    return 'PRESENTATION';
  }
  if (['pdf', 'doc', 'docx', 'odt', 'rtf'].includes(extension || '') ||
      mimeType.includes('document') || mimeType === 'application/pdf') {
    return 'DOCUMENT';
  }
  if (mimeType.startsWith('text/') || ['txt', 'md', 'markdown'].includes(extension || '')) {
    return 'TEXT';
  }
  return 'OTHER';
};

const tests = [
  {
    name: 'detectAssetType: mp4 is VIDEO',
    actual: detectAssetType({ name: 'clip.mp4', type: 'video/mp4' }),
    expected: 'VIDEO',
  },
  {
    name: 'detectAssetType: vtt by extension is TEXT',
    actual: detectAssetType({ name: 'subtitles.vtt', type: '' }),
    expected: 'TEXT',
  },
  {
    name: 'detectAssetType: vtt by mime is TEXT (text/vtt)',
    actual: detectAssetType({ name: 'subtitles', type: 'text/vtt' }),
    expected: 'TEXT',
  },
  {
    name: 'detectAssetType: vtt by mime is TEXT (video/vtt)',
    actual: detectAssetType({ name: 'subtitles', type: 'video/vtt' }),
    expected: 'TEXT',
  },
  {
    name: 'getAssetDisplayType: vtt mime shows VTT',
    actual: getAssetDisplayType({ type: 'TEXT', mimeType: 'text/vtt' }),
    expected: 'VTT',
  },
  {
    name: 'getAssetDisplayType: vtt url shows VTT',
    actual: getAssetDisplayType({ type: 'TEXT', url: 'https://cdn/assets/abc.vtt' }),
    expected: 'VTT',
  },
  {
    name: 'getAssetDisplayType: video stays VIDEO',
    actual: getAssetDisplayType({ type: 'VIDEO', mimeType: 'video/mp4' }),
    expected: 'VIDEO',
  },
];

let failed = 0;
for (const t of tests) {
  if (t.actual !== t.expected) {
    failed += 1;
    console.error(`FAIL: ${t.name}\n  expected: ${t.expected}\n  actual:   ${t.actual}`);
  } else {
    console.log(`PASS: ${t.name}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}

console.log('\nAll tests passed.');
