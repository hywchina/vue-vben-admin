import { describe, expect, it } from 'vitest';

import { formatGeneratedAssetName } from './generated-names';

const contextPublicId = 'DSC-00000125';
const base = {
  contextPublicId,
  dateStamp: '20261008',
  filename: 'Flux2-Klein_00357_.png',
  mimeType: 'image/png',
  sequence: 1,
};

describe('generated asset names', () => {
  it('uses the conversation, date and three-digit ordinal without capability prefixes', () => {
    expect(formatGeneratedAssetName(base)).toBe(
      `${contextPublicId}-20261008-001.png`,
    );
  });
  it('does not truncate ordinals over 999', () => {
    expect(formatGeneratedAssetName({ ...base, sequence: 1000 })).toBe(
      `${contextPublicId}-20261008-1000.png`,
    );
  });
  it.each(['JPG', 'safetensors', 'glb', 'mp4', 'pptx', 'md'])(
    'retains the actual %s format',
    (extension) => {
      expect(
        formatGeneratedAssetName({
          ...base,
          filename: `external/result.${extension}`,
        }),
      ).toBe(`${contextPublicId}-20261008-001.${extension.toLowerCase()}`);
    },
  );
  it('uses MIME when there is no extension', () => {
    expect(formatGeneratedAssetName({ ...base, filename: 'result' })).toBe(
      `${contextPublicId}-20261008-001.png`,
    );
  });
  it.each([0, -1, 1.5, Number.NaN])(
    'rejects invalid ordinal %s',
    (sequence) => {
      expect(() => formatGeneratedAssetName({ ...base, sequence })).toThrow(
        '生成资产命名上下文无效',
      );
    },
  );
  it.each(['INS-00000001', 'TSK-00000001', 'DSC-100000000'])(
    'accepts the persistent context number %s',
    (contextPublicId) => {
      expect(formatGeneratedAssetName({ ...base, contextPublicId })).toBe(
        `${contextPublicId}-20261008-001.png`,
      );
    },
  );
  it.each([
    '../unsafe',
    'f645fd0d-ee3f-4ab1-976e-e301f1b457d5',
    'DSC-125',
    'AST-00000125',
    'dsc-00000125',
  ])('rejects invalid context number %s', (contextPublicId) => {
    expect(() =>
      formatGeneratedAssetName({ ...base, contextPublicId }),
    ).toThrow('生成资产命名上下文无效');
  });
});
