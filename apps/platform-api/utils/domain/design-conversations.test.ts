import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DESIGN_CONVERSATION_TITLE,
  deriveDesignConversationTitle,
} from './design-conversation-titles';

const fields = [
  {
    acceptedKinds: [],
    advanced: false,
    assetIndex: undefined,
    defaultValue: '',
    inputName: 'text',
    integer: false,
    key: 'prompt',
    label: '任务说明',
    nodeId: '1',
    options: [],
    required: true,
    targets: [],
    type: 'textarea',
    uiControl: 'default',
  },
];

describe('design conversation title', () => {
  it('normalizes whitespace and limits the first text to 20 characters', () => {
    expect(
      deriveDesignConversationTitle(
        { prompt: '  设计一套\n现代轨道客室空间，强调柔和照明与耐用材质  ' },
        fields,
      ),
    ).toBe('设计一套 现代轨道客室空间，强调柔和照…');
  });

  it('keeps the default title when no textual input exists', () => {
    expect(
      deriveDesignConversationTitle({ prompt: '   ' }, fields),
    ).toBeUndefined();
    expect(DEFAULT_DESIGN_CONVERSATION_TITLE).toBe('新设计会话');
  });
});
