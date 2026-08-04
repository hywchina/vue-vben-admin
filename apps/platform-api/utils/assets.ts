import { extname } from 'node:path';

export const ASSET_KINDS = [
  'archive',
  'audio',
  'document',
  'image',
  'model',
  'model3d',
  'text',
  'video',
] as const;

export type AssetKind = (typeof ASSET_KINDS)[number];

const ACCENTS: Record<AssetKind, string> = {
  archive: '#786b5f',
  audio: '#746b8f',
  document: '#876d37',
  image: '#b91c32',
  model: '#62558b',
  model3d: '#3f6b5a',
  text: '#5d6470',
  video: '#315b70',
};

const EXTENSIONS: Partial<Record<AssetKind, Set<string>>> = {
  archive: new Set(['.7z', '.gz', '.rar', '.tar', '.tgz', '.zip']),
  document: new Set([
    '.csv',
    '.doc',
    '.docx',
    '.pdf',
    '.ppt',
    '.pptx',
    '.xls',
    '.xlsx',
  ]),
  model: new Set(['.ckpt', '.onnx', '.pt', '.pth', '.safetensors']),
  model3d: new Set(['.fbx', '.glb', '.gltf', '.obj', '.step', '.stl', '.stp']),
};

const BINARY_MIME = 'application/octet-stream';

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

export function validateFileForKind(
  kind: AssetKind,
  mimeType: string,
  filename: string,
) {
  const extension = extname(filename).toLowerCase();
  const allowedExtensions = EXTENSIONS[kind];
  if (allowedExtensions && !allowedExtensions.has(extension)) return false;

  if (kind === 'image') return mimeType.startsWith('image/');
  if (kind === 'video') return mimeType.startsWith('video/');
  if (kind === 'audio') return mimeType.startsWith('audio/');
  if (kind === 'text') {
    return mimeType.startsWith('text/') || mimeType === 'application/json';
  }
  if (kind === 'archive') {
    return (
      mimeType === BINARY_MIME ||
      [
        'application/gzip',
        'application/vnd.rar',
        'application/x-7z-compressed',
        'application/x-rar-compressed',
        'application/x-tar',
        'application/x-zip-compressed',
        'application/zip',
      ].includes(mimeType)
    );
  }
  if (kind === 'document') {
    return (
      mimeType === BINARY_MIME ||
      mimeType === 'application/msword' ||
      mimeType === 'application/pdf' ||
      mimeType === 'application/vnd.ms-excel' ||
      mimeType === 'application/vnd.ms-powerpoint' ||
      mimeType.startsWith('application/vnd.openxmlformats-officedocument.') ||
      mimeType === 'text/csv'
    );
  }
  if (kind === 'model') {
    return (
      mimeType === BINARY_MIME ||
      ['application/onnx', 'application/x-pytorch'].includes(mimeType)
    );
  }
  return (
    mimeType === BINARY_MIME ||
    mimeType.startsWith('model/') ||
    ['application/sla', 'application/step'].includes(mimeType)
  );
}
