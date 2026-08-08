import { describe, expect, it } from 'vitest';

import {
  assistantAttachmentExtension,
  deriveAssistantConversationTitle,
  isAssistantAttachmentSupported,
} from './conversations';

describe('ai assistant helpers', () => {
  it('accepts common design files and rejects executable content', () => {
    expect(isAssistantAttachmentSupported('reference.png', 'image/png')).toBe(
      true,
    );
    expect(
      isAssistantAttachmentSupported('brief.docx', 'application/octet-stream'),
    ).toBe(true);
    expect(isAssistantAttachmentSupported('walkthrough.mp4', 'video/mp4')).toBe(
      true,
    );
    expect(
      isAssistantAttachmentSupported(
        'installer.exe',
        'application/x-msdownload',
      ),
    ).toBe(false);
  });

  it('normalizes safe object extensions', () => {
    expect(assistantAttachmentExtension('客室方案.Final.PNG')).toBe('.png');
    expect(assistantAttachmentExtension('unsafe.<script>.png')).toBe('.png');
  });

  it('derives a concise conversation title without changing the message', () => {
    expect(deriveAssistantConversationTitle('  检查   当前客室方案  ')).toBe(
      '检查 当前客室方案',
    );
    expect(deriveAssistantConversationTitle('', '参考图.png')).toBe(
      '参考图.png',
    );
  });
});
