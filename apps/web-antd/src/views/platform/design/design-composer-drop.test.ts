import type {
  CapabilityField,
  PlatformAsset,
  PlatformJobOutput,
} from '#/modules/platform/types';

import { describe, expect, it, vi } from 'vitest';

import {
  acceptComposerImageDrop,
  imageDropTarget,
} from './design-composer-drop';
import { mediaInputProgress } from './design-composer-media';

const fields = (count: number): CapabilityField[] =>
  Array.from({ length: count }, (_, assetIndex) => ({
    acceptedKinds: ['image'],
    advanced: false,
    assetIndex,
    integer: false,
    key: `image-${assetIndex}`,
    label: `图片 ${assetIndex + 1}`,
    options: [],
    required: true,
    type: 'asset',
    uiControl: 'default',
  }));
const asset = {
  id: 'image-a',
  projectId: 'project-a',
  type: 'image',
  status: 'available',
} as PlatformAsset;
const output = {
  assetId: asset.id,
  kind: 'image',
  saved: true,
} as PlatformJobOutput;

function harness(count = 1) {
  const slots = fields(count);
  const selections: Record<number, string> = {};
  const commit = vi.fn(async (image: PlatformAsset, field: CapabilityField) => {
    if (field.assetIndex !== undefined) selections[field.assetIndex] = image.id;
  });
  return {
    selections,
    slots,
    options: {
      assetId: asset.id,
      projectId: asset.projectId,
      output: { ...output },
      fields: () => slots,
      selections: () => selections,
      isCurrent: () => true,
      getAsset: vi.fn(async () => ({ ...asset })),
      commit,
    },
  };
}

describe('design composer generated-image drop', () => {
  it.each([1, 2, 3, 4])(
    'fills %i workflow slots without overwriting and rejects overflow',
    async (count) => {
      const { options, selections, slots } = harness(count);
      for (let index = 0; index < count; index += 1) {
        const id = `image-${index}`;
        options.assetId = id;
        options.output = { ...output, assetId: id };
        options.getAsset.mockResolvedValueOnce({ ...asset, id });
        expect(await acceptComposerImageDrop(options)).toBe(true);
        expect(selections[index]).toBe(id);
        expect(mediaInputProgress(slots, selections).missingRequired).toBe(
          count - index - 1,
        );
      }
      const before = { ...selections };
      options.assetId = 'overflow';
      options.output = { ...output, assetId: 'overflow', saved: false };
      await expect(acceptComposerImageDrop(options)).rejects.toThrow(
        `最多接收 ${count} 张`,
      );
      expect(selections).toEqual(before);
      expect(options.getAsset).toHaveBeenCalledTimes(count);
    },
  );

  it('uses ordered image slots only, including optional slots', () => {
    const slots = fields(4);
    const modelSlot = slots[1];
    const optionalSlot = slots[3];
    if (!modelSlot || !optionalSlot) throw new Error('Missing test slots');
    modelSlot.acceptedKinds = ['model'];
    optionalSlot.required = false;
    expect(
      imageDropTarget(slots.toReversed(), { 0: 'existing' }, 'new').assetIndex,
    ).toBe(2);
    expect(
      imageDropTarget(slots, { 0: 'existing', 2: 'second' }, 'new').assetIndex,
    ).toBe(3);
  });

  it('rejects text-to-image before fetching or saving', async () => {
    const { options } = harness(0);
    await expect(acceptComposerImageDrop(options)).rejects.toThrow(
      '不接受图片',
    );
    expect(options.getAsset).not.toHaveBeenCalled();
  });

  it('rejects duplicate input before authorization or confirmation', async () => {
    const { options, selections } = harness(2);
    selections[0] = asset.id;
    await expect(acceptComposerImageDrop(options)).rejects.toThrow(
      '请勿重复添加',
    );
    expect(options.getAsset).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    { ...output, kind: 'model' },
    { ...output, assetId: 'foreign' },
  ])('rejects non-conversation or non-image output: %j', async (candidate) => {
    const { options } = harness();
    await expect(
      acceptComposerImageDrop({
        ...options,
        output: candidate as PlatformJobOutput | undefined,
      }),
    ).rejects.toThrow('当前会话生成');
    expect(options.getAsset).not.toHaveBeenCalled();
  });

  it('reuses a staged image via read only without registering or changing saved state', async () => {
    const { options } = harness();
    options.output.saved = false;
    await acceptComposerImageDrop(options);
    expect(options.getAsset).toHaveBeenCalledExactlyOnceWith(asset.id);
    expect(options.output.saved).toBe(false);
    expect(options.commit).toHaveBeenCalledOnce();
  });

  it.each([
    { projectId: 'other-project' },
    { type: 'video' },
    { status: 'failed' },
    { status: 'pending' },
    { id: 'other-image' },
  ])('rejects invalid resolved asset: %j', async (changes) => {
    const { options } = harness();
    options.getAsset.mockResolvedValue({
      ...asset,
      ...changes,
    } as PlatformAsset);
    await expect(acceptComposerImageDrop(options)).rejects.toThrow(
      '不属于当前项目或已不可用',
    );
    expect(options.commit).not.toHaveBeenCalled();
  });

  it('permission/read failures do not attach or fall back to save', async () => {
    const { options } = harness();
    options.getAsset.mockRejectedValue(new Error('FORBIDDEN'));
    await expect(acceptComposerImageDrop(options)).rejects.toThrow('FORBIDDEN');
    expect(options.commit).not.toHaveBeenCalled();
  });

  it('staged image read failure leaves selections and saved state untouched', async () => {
    const { options, selections } = harness();
    options.output.saved = false;
    options.getAsset.mockRejectedValue(new Error('READ_FAILED'));
    await expect(acceptComposerImageDrop(options)).rejects.toThrow(
      'READ_FAILED',
    );
    expect(selections).toEqual({});
    expect(options.commit).not.toHaveBeenCalled();
  });

  it('rejects stale context before reading', async () => {
    const { options } = harness();
    options.isCurrent = () => false;
    await expect(acceptComposerImageDrop(options)).rejects.toThrow('已切换');
    expect(options.getAsset).not.toHaveBeenCalled();
  });

  it('does not attach to a changed conversation/function after async read', async () => {
    const { options } = harness();
    let current = true;
    options.isCurrent = () => current;
    options.getAsset.mockImplementation(async () => {
      current = false;
      return asset;
    });
    await expect(acceptComposerImageDrop(options)).rejects.toThrow('已切换');
    expect(options.commit).not.toHaveBeenCalled();
  });

  it('rechecks capacity after an asynchronous read', async () => {
    const { options, selections } = harness();
    options.getAsset.mockImplementation(async () => {
      selections[0] = 'another-input';
      return asset;
    });
    await expect(acceptComposerImageDrop(options)).rejects.toThrow(
      '最多接收 1 张',
    );
    expect(selections).toEqual({ 0: 'another-input' });
    expect(options.commit).not.toHaveBeenCalled();
  });
});
