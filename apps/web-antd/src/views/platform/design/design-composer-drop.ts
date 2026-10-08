import type {
  CapabilityField,
  PlatformAsset,
  PlatformJobOutput,
} from '#/modules/platform/types';

import { orderedImageMediaFields } from './design-composer-media';

export function imageDropTarget(
  fields: readonly CapabilityField[],
  selections: Readonly<Record<number, string>>,
  assetId: string,
) {
  const slots = orderedImageMediaFields(fields);
  if (slots.length === 0)
    throw new Error('当前功能不接受图片输入，请先选择图生图功能');
  if (Object.values(selections).includes(assetId)) {
    throw new Error('这张图片已在输入区，请勿重复添加');
  }
  const target = slots.find(
    (field) => field.assetIndex !== undefined && !selections[field.assetIndex],
  );
  if (!target) {
    throw new Error(
      `当前功能最多接收 ${slots.length} 张图片，请先移除已有图片`,
    );
  }
  return target;
}

interface ComposerImageDrop {
  assetId: string;
  projectId: string;
  output?: PlatformJobOutput;
  fields: () => readonly CapabilityField[];
  selections: () => Readonly<Record<number, string>>;
  isCurrent: () => boolean;
  confirmSave: () => Promise<boolean>;
  getAsset: (assetId: string) => Promise<PlatformAsset>;
  saveOutput: (assetId: string) => Promise<PlatformAsset>;
  commit: (asset: PlatformAsset, field: CapabilityField) => Promise<void>;
}

// The drop is only an input action. Authorization and registration still use
// platform APIs; neither signed URLs nor source-job parameters are reused.
export async function acceptComposerImageDrop(options: ComposerImageDrop) {
  const checkTarget = () => {
    if (!options.isCurrent()) {
      throw new Error('会话或功能已切换，请重新拖拽图片');
    }
    return imageDropTarget(
      options.fields(),
      options.selections(),
      options.assetId,
    );
  };
  checkTarget();
  if (
    options.output?.assetId !== options.assetId ||
    options.output.kind !== 'image'
  ) {
    throw new Error('请拖入当前会话生成的图片');
  }
  if (!options.output.saved) {
    if (!(await options.confirmSave())) return false;
    checkTarget();
  }
  const asset = options.output.saved
    ? await options.getAsset(options.assetId)
    : await options.saveOutput(options.assetId);
  const target = checkTarget();
  if (
    asset.id !== options.assetId ||
    asset.projectId !== options.projectId ||
    asset.type !== 'image' ||
    asset.status !== 'available'
  ) {
    throw new Error('图片不属于当前项目或已不可用，请重新选择');
  }
  await options.commit(asset, target);
  return true;
}
