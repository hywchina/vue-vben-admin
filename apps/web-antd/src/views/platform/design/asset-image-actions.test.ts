import { describe, expect, it } from 'vitest';

import {
  assetImageAction,
  assetImageActions,
  assetImageActionUnavailable,
} from '#/modules/platform/asset-image-actions';

describe('asset image actions', () => {
  it('exposes the eight requested tools without duplicate asset registration', () => {
    expect(assetImageActions.map((action) => action.key)).toEqual([
      'rerun',
      'mask',
      'mark',
      'multi-image',
      'upscale',
      'environment',
      'understand',
      'multi-angle',
    ]);
    expect(assetImageAction('save')).toBeUndefined();
    expect(assetImageAction('invalid')).toBeUndefined();
  });
  it('requires an available workflow and a genuine source job for rerun', () => {
    expect(
      assetImageActionUnavailable({ type: 'image' }, 'rerun', [
        'text-to-image',
      ]),
    ).toContain('没有');
    expect(
      assetImageActionUnavailable(
        { type: 'image', sourceJobId: 'job', sourceAppKey: 'text-to-image' },
        'rerun',
        ['text-to-image'],
      ),
    ).toBe('');
    expect(
      assetImageActionUnavailable({ type: 'image' }, 'mask', []),
    ).toContain('不可用');
    expect(
      assetImageActionUnavailable({ type: 'image' }, 'mask', [
        'inpaint-single',
      ]),
    ).toBe('');
    expect(
      assetImageActionUnavailable({ type: 'text' }, 'mask', ['inpaint-single']),
    ).toContain('不可用');
  });
  it('recognizes grouping when the original result shortcut workflow is unavailable', () => {
    const asset = { type: 'image' } as const;
    expect(
      assetImageActionUnavailable(asset, 'multi-image', [
        'reference-image-edit',
        'image-edit-kv',
      ]),
    ).toBe('');
    expect(
      assetImageActionUnavailable(asset, 'mask', [
        'local-image-edit',
        'inpaint-reference',
      ]),
    ).toBe('');
    expect(
      assetImageActionUnavailable(asset, 'mask', [
        'local-image-edit',
        'region-edit',
      ]),
    ).toContain('不可用');
  });
  it('routes archived Base results through either available replacement', () => {
    const asset = {
      sourceAppKey: 'image-edit-base',
      sourceJobId: 'old-job',
      type: 'image',
    } as const;
    for (const key of ['single-image-edit', 'image-edit-kv'])
      expect(assetImageActionUnavailable(asset, 'rerun', [key])).toBe('');
    expect(
      assetImageActionUnavailable(asset, 'rerun', ['image-edit-base']),
    ).toContain('均不可用');
  });
});
