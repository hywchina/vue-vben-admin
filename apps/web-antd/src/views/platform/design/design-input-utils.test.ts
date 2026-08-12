import { describe, expect, it } from 'vitest';

import { appendTextInput, markdownTextContent } from './design-input-utils';

describe('design Markdown input', () => {
  it('extracts readable text and ignores Markdown images', () => {
    expect(
      markdownTextContent(
        '# 客室方案\n\n![效果图](https://example.test/a.png)\n- 使用[耐磨材料](https://example.test/material)\n> 易维护',
      ),
    ).toBe('客室方案\n使用耐磨材料\n易维护');
  });

  it('appends imported content and reports truncation', () => {
    expect(appendTextInput('已有要求', '补充要求')).toEqual({
      truncated: false,
      value: '已有要求\n\n补充要求',
    });
    expect(appendTextInput('', '123456', 4)).toEqual({
      truncated: true,
      value: '1234',
    });
  });
});
