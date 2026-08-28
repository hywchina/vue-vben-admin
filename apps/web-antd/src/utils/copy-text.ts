interface ClipboardWriter {
  writeText: (text: string) => Promise<void>;
}

interface CopyTextOptions {
  clipboard?: ClipboardWriter | null;
  document?: Document | null;
}

/**
 * 将文本真实写入系统剪贴板。
 *
 * Clipboard API 不可用时使用隐藏 textarea 回退；只有浏览器确认写入成功时
 * 才返回 true，调用方不得在失败时显示成功提示。
 */
export async function copyTextToClipboard(
  content: string,
  options: CopyTextOptions = {},
) {
  const clipboard =
    options.clipboard === undefined
      ? typeof navigator === 'undefined'
        ? null
        : navigator.clipboard
      : options.clipboard;

  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(content);
      return true;
    } catch {
      // 非安全来源、浏览器权限或系统策略可能拒绝 Clipboard API，继续回退。
    }
  }

  const targetDocument =
    options.document === undefined
      ? typeof document === 'undefined'
        ? null
        : document
      : options.document;
  if (!targetDocument?.body) return false;

  const activeElement = targetDocument.activeElement;
  const textarea = targetDocument.createElement('textarea');
  textarea.value = content;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.inset = '0 auto auto -9999px';
  textarea.style.opacity = '0';
  targetDocument.body.append(textarea);
  textarea.focus({ preventScroll: true });
  textarea.select();
  textarea.setSelectionRange(0, content.length);

  let copied: boolean;
  try {
    copied = targetDocument.execCommand('copy') === true;
  } catch {
    copied = false;
  } finally {
    textarea.remove();
    if (activeElement instanceof HTMLElement) {
      activeElement.focus({ preventScroll: true });
    }
  }

  return copied;
}
