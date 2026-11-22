import type { PlatformCapability } from './types';

export const imageGenerationCountKey = 'generationCount';
export const imageGenerationCountMax = 8;
export const imageGenerationCountOptions = Array.from(
  { length: imageGenerationCountMax },
  (_, index) => ({ label: `${index + 1} 张`, value: index + 1 }),
);

export function savedImageGenerationCount(
  capability: PlatformCapability | undefined,
  values: Record<string, unknown>,
) {
  const count = values[imageGenerationCountKey];
  if (
    typeof count === 'number' &&
    Number.isInteger(count) &&
    count >= 1 &&
    count <= imageGenerationCountMax
  )
    return count;
  const legacyKey = capability?.presentation?.legacyGenerationCountKey;
  const legacy = legacyKey ? Number(values[legacyKey]) : undefined;
  if (legacy !== undefined && Number.isSafeInteger(legacy) && legacy >= 1)
    return Math.min(
      imageGenerationCountMax,
      legacy * (capability?.presentation?.legacyGenerationCountMultiplier ?? 1),
    );
}
