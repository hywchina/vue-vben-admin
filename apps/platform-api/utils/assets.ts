import { extname } from 'node:path';

export const ASSET_KINDS = [
  'audio',
  'image',
  'lora',
  'mask',
  'material',
  'model3d',
  'report',
  'text',
  'video',
] as const;

export type AssetKind = (typeof ASSET_KINDS)[number];

const ACCENTS: Record<AssetKind, string> = {
  audio: '#746b8f',
  image: '#b91c32',
  lora: '#62558b',
  mask: '#4d6472',
  material: '#9b6b43',
  model3d: '#3f6b5a',
  report: '#876d37',
  text: '#5d6470',
  video: '#315b70',
};

export function assetAccent(kind: AssetKind) {
  return ACCENTS[kind];
}

export function assetFormat(filename: null | string, mimeType: string) {
  const extension = filename ? extname(filename).slice(1) : '';
  if (extension) return extension.toUpperCase();
  return mimeType.split('/').at(-1)?.toUpperCase() ?? 'FILE';
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function validateMimeForKind(kind: AssetKind, mimeType: string) {
  if (kind === 'image' || kind === 'mask' || kind === 'material') {
    return mimeType.startsWith('image/');
  }
  if (kind === 'video') return mimeType.startsWith('video/');
  if (kind === 'audio') return mimeType.startsWith('audio/');
  if (kind === 'text') {
    return mimeType.startsWith('text/') || mimeType === 'application/json';
  }
  return [
    'application/octet-stream',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'model/gltf+json',
    'model/gltf-binary',
  ].includes(mimeType);
}
