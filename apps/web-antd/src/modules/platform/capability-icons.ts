import { assetTypeIcons } from './asset-types';
import { platformSemanticIcons } from './semantic-icons';
import { platformUiIcons } from './ui-icons';

/** 能力代码是稳定语义；已有数据库图标不应让同一功能在不同入口变成不同图形。 */
export const capabilitySemanticIcons: Record<string, string> = {
  'text-to-image': platformUiIcons.imagePlus,
  'text-to-image-lora': platformUiIcons.sparkles,
  'single-image-edit': platformUiIcons.scanLine,
  'screen-capture-edit': platformUiIcons.monitorUp,
  'multi-image-edit': platformUiIcons.images,
  'inpaint-single': platformSemanticIcons.mask,
  'inpaint-reference': platformUiIcons.blend,
  outpaint: platformUiIcons.expand,
  'region-edit': platformUiIcons.squareDashedMousePointer,
  'region-marker-edit': platformUiIcons.tags,
  'multiview-to-3d': assetTypeIcons.model3d,
  'image-understanding': platformUiIcons.scanSearch,
  'text-chat': platformSemanticIcons.conversations,
  'image-upscale': platformUiIcons.zoomIn,
  'camera-control-single': platformUiIcons.camera,
  'camera-control-multi': platformUiIcons.orbit,
  'image-edit-base': platformUiIcons.layers,
  'image-edit-kv': platformUiIcons.layers,
  'lora-training': platformSemanticIcons.modelTraining,
  'report-generator': platformSemanticIcons.report,
};

export function applicationSemanticIcon(application: {
  icon?: string;
  key: string;
}) {
  const known = capabilitySemanticIcons[application.key];
  if (known) return known;
  const provided = application.icon;
  const local = [
    ...Object.values(platformUiIcons),
    ...Object.values(platformSemanticIcons),
    ...Object.values(assetTypeIcons),
  ];
  return provided && local.includes(provided as (typeof local)[number])
    ? provided
    : platformSemanticIcons.applications;
}
