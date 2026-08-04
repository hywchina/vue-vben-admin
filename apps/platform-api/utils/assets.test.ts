import { describe, expect, it } from 'vitest';

import {
  assetAccent,
  assetFormat,
  formatFileSize,
  validateMimeForKind,
} from './assets';

describe('asset utilities', () => {
  it('maps asset kinds to stable platform accents', () => {
    expect(assetAccent('image')).toBe('#b91c32');
    expect(assetAccent('model3d')).toBe('#3f6b5a');
  });

  it('derives display formats from filenames and mime types', () => {
    expect(assetFormat('cabin.reference.png', 'image/png')).toBe('PNG');
    expect(assetFormat(null, 'application/pdf')).toBe('PDF');
  });

  it('formats binary file sizes at useful boundaries', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(1_572_864)).toBe('1.5 MB');
  });

  it('rejects mime types that do not match the declared asset kind', () => {
    expect(validateMimeForKind('image', 'image/png')).toBe(true);
    expect(validateMimeForKind('image', 'video/mp4')).toBe(false);
    expect(validateMimeForKind('video', 'video/mp4')).toBe(true);
    expect(validateMimeForKind('text', 'application/json')).toBe(true);
  });
});
