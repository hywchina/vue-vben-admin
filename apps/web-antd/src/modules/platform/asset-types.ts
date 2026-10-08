import type { AssetType } from './types';

import { platformUiIcons } from './ui-icons';

export const assetTypeLabels: Record<AssetType, string> = {
  archive: '压缩包',
  audio: '音频',
  document: '文档',
  image: '图片',
  model: '模型文件',
  model3d: '3D 模型',
  text: '文本',
  video: '视频',
};

export const assetTypeIcons: Record<AssetType, string> = {
  archive: 'lucide:file-archive',
  audio: 'lucide:audio-lines',
  document: 'lucide:file-text',
  image: 'lucide:image',
  model: 'lucide:brain-circuit',
  model3d: 'lucide:box',
  text: 'lucide:notebook-text',
  video: 'lucide:video',
};

/** 未知类型不得冒充文档；已知八类文件统一使用真实类型图标。 */
export function assetTypeIcon(kind?: null | string) {
  return kind && Object.hasOwn(assetTypeIcons, kind)
    ? assetTypeIcons[kind as AssetType]
    : platformUiIcons.file;
}

export const assetTypeOptions = Object.entries(assetTypeLabels).map(
  ([value, label]) => ({ label, value }),
);

export const assetUploadAccept: Record<Exclude<AssetType, 'text'>, string> = {
  archive: '.zip,.7z,.rar,.tar,.gz,.tgz',
  audio: 'audio/*',
  document: '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv',
  image: 'image/*',
  model: '.safetensors,.ckpt,.pt,.pth,.onnx',
  model3d: '.glb,.gltf,.obj,.fbx,.stl,.step,.stp',
  video: 'video/*',
};
