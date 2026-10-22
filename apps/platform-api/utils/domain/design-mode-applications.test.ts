import { describe, expect, it } from 'vitest';

import {
  assertDesignModeApplications,
  designModeApplicationsSchema,
} from './design-mode-applications';
const config = {
  applicationKeys: ['text-to-image', 'single-image-edit'],
  defaultImageApplicationKey: 'single-image-edit',
  expectedRevision: 1,
};
describe('design module function settings', () => {
  it('preserves administrator order and validates the image default', () => {
    expect(designModeApplicationsSchema.parse(config)).toEqual(config);
    expect(() =>
      assertDesignModeApplications(config, config.applicationKeys),
    ).not.toThrow();
  });
  it.each([
    { applicationKeys: ['single-image-edit', 'single-image-edit'] },
    { applicationKeys: ['unknown'] },
    { defaultImageApplicationKey: 'text-to-image' },
    { defaultImageApplicationKey: 'inpaint-single' },
    {
      applicationKeys: ['screen-capture-edit'],
      defaultImageApplicationKey: 'screen-capture-edit',
    },
    { applicationKeys: ['text-chat'], defaultImageApplicationKey: 'text-chat' },
  ])(
    'rejects duplicate, unavailable, non-image and standalone capture choices: %j',
    (override) => {
      expect(() =>
        assertDesignModeApplications({ ...config, ...override }, [
          ...config.applicationKeys,
          'screen-capture-edit',
          'text-chat',
        ]),
      ).toThrow('功能重复、不可用');
    },
  );
  it.each([{ expectedRevision: 0 }, { applicationKeys: [] }, { extra: true }])(
    'rejects malformed configuration: %j',
    (override) => {
      expect(
        designModeApplicationsSchema.safeParse({ ...config, ...override })
          .success,
      ).toBe(false);
    },
  );
});
