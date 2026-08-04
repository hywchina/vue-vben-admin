import type { AssetType } from './types';

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
