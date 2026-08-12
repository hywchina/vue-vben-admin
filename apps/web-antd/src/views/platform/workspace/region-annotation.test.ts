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
