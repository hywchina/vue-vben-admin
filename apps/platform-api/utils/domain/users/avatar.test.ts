import { describe, expect, it } from 'vitest';

import {
  avatarFileExtension,
  detectAvatarMimeType,
  MAX_AVATAR_BYTES,
  readImageDimensions,
} from './avatar';

describe('用户头像文件校验', () => {
  it('按文件签名识别 PNG、JPEG 和 WebP', () => {
    expect(
      detectAvatarMimeType(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])),
    ).toBe('image/png');
    expect(detectAvatarMimeType(Uint8Array.from([255, 216, 255]))).toBe(
      'image/jpeg',
    );
    expect(
      detectAvatarMimeType(
        Uint8Array.from([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]),
      ),
    ).toBe('image/webp');
  });

  it('拒绝伪装成图片的未知正文并提供稳定扩展名', () => {
    expect(detectAvatarMimeType(new TextEncoder().encode('not-image'))).toBe(
      undefined,
    );
    expect(avatarFileExtension('image/jpeg')).toBe('jpg');
    expect(avatarFileExtension('image/png')).toBe('png');
    expect(avatarFileExtension('image/webp')).toBe('webp');
    expect(MAX_AVATAR_BYTES).toBe(5 * 1024 * 1024);
  });

  it('读取头像尺寸供服务端强制执行方形约束', () => {
    const pngHeader = Uint8Array.from([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 2, 0,
      0, 0, 1, 0,
    ]);
    expect(readImageDimensions(pngHeader, 'image/png')).toEqual({
      height: 256,
      width: 512,
    });
  });
});
