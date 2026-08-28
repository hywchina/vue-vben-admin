import { describe, expect, it, vi } from 'vitest';

import { copyTextToClipboard } from './copy-text';

describe('copyTextToClipboard', () => {
  it('uses the Clipboard API when the browser confirms the write', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    await expect(
      copyTextToClipboard('真实复制内容', {
        clipboard: { writeText },
        document: null,
      }),
    ).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('真实复制内容');
  });

  it('reports failure instead of claiming success without a fallback', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('permission denied'));

    await expect(
      copyTextToClipboard('无法复制的内容', {
        clipboard: { writeText },
        document: null,
      }),
    ).resolves.toBe(false);
  });
});
