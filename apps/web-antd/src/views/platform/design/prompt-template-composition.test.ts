import { describe, expect, it } from 'vitest';

import {
  composePromptApplication,
  mergePromptTemplate,
} from '#/modules/platform/prompt-template-composition';

describe('prompt application preserves the design request', () => {
  it('never claims an identical handwritten instruction as an inserted template', () => {
    const applied = composePromptApplication(
      '采用白天光照。',
      '采用白天光照。',
    );
    expect(applied.appliedTemplate).toBe('');
    expect(
      mergePromptTemplate(
        applied.text,
        '窗外为森林。',
        applied.appliedTemplate,
      ),
    ).toBe('采用白天光照。\n窗外为森林。');
  });
  it('keeps the workflow default and user instructions', () => {
    expect(
      mergePromptTemplate(
        '图1为空间底图。\n只调整座椅配色。',
        '采用暖色光照。',
      ),
    ).toBe('图1为空间底图。\n只调整座椅配色。\n采用暖色光照。');
  });
  it('replaces the last intact template without duplicating it', () => {
    expect(
      mergePromptTemplate(
        '只修改座椅。\n采用白天光照。',
        '采用夜间光照。',
        '采用白天光照。',
      ),
    ).toBe('只修改座椅。\n采用夜间光照。');
    expect(mergePromptTemplate('采用夜间光照。', '采用夜间光照。')).toBe(
      '采用夜间光照。',
    );
  });
  it('keeps text edited by the user instead of guessing what to remove', () => {
    expect(
      mergePromptTemplate(
        '采用白天柔和光照。',
        '窗外为森林。',
        '采用白天光照。',
      ),
    ).toBe('采用白天柔和光照。\n窗外为森林。');
    expect(mergePromptTemplate('保留座椅布局。', '')).toBe('保留座椅布局。');
  });
});
