import { describe, expect, it } from 'vitest';

import {
  parseRegionStrokes,
  serializeRegionStrokes,
} from './region-annotation';

describe('region annotation protocol', () => {
  it('keeps numbered regions when parsing and serializing', () => {
    const value = 'brush:square:24:1:255,0,0:2:10.00,12.00;80.00,92.00';
    const strokes = parseRegionStrokes(value);

    expect(strokes).toHaveLength(1);
    expect(strokes[0]).toMatchObject({
      marker: '2',
      mode: 'brush',
      type: 'square',
    });
    expect(serializeRegionStrokes(strokes)).toBe(value);
  });

  it('ignores malformed region data instead of rendering it', () => {
    expect(parseRegionStrokes('invalid')).toEqual([]);
    expect(parseRegionStrokes('brush:circle:24:1:255,0,0:1,1')).toEqual([]);
  });
});

describe('per-region instruction groups', () => {
  it('labels the entire legacy frame with the enclosed small numbered badge', async () => {
    const { regionPromptGroups } = await import('./region-annotation');
    expect(
      regionPromptGroups(
        'brush:box:8:1:255,0,0:0,0;100,100|brush:square:8:1:255,0,0:1:10,10;20,20',
      ),
    ).toEqual([{ key: 'number_1', label: '区域1' }]);
  });
  it('keeps distinct numbered and color groups, and ignores eraser requirements', async () => {
    const { regionPromptGroups } = await import('./region-annotation');
    expect(
      regionPromptGroups(
        'brush:square:8:1:255,0,0:1:0,0;20,20|brush:box:8:1:0,255,0:50,50;90,90|erase:free:8:1:0,0,0:0,0;1,1',
      ).map(({ key }) => key),
    ).toEqual(['number_1', 'color_green']);
  });
});
