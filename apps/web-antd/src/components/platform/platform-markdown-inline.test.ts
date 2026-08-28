import { describe, expect, it } from 'vitest';

import { parseMarkdownInline } from './platform-markdown-inline';

describe('platform Markdown inline parser', () => {
  it('parses common inline formatting without HTML rendering', () => {
    expect(
      parseMarkdownInline(
        '**重点**、*说明*、`code` 和 [文档](https://example.com/docs)',
      ),
    ).toEqual([
      { content: '重点', kind: 'strong' },
      { content: '、', kind: 'text' },
      { content: '说明', kind: 'emphasis' },
      { content: '、', kind: 'text' },
      { content: 'code', kind: 'code' },
      { content: ' 和 ', kind: 'text' },
      {
        content: '文档',
        href: 'https://example.com/docs',
        kind: 'link',
      },
    ]);
  });

  it('keeps unsafe links as plain text', () => {
    expect(parseMarkdownInline('[执行](javascript:alert(1))')).toEqual([
      { content: '[执行](javascript:alert(1))', kind: 'text' },
    ]);
  });
});
