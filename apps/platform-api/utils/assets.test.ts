import { describe, expect, it } from 'vitest';

import {
  assetAccent,
  assetFormat,
  formatFileSize,
  validateFileForKind,
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

  it('accepts files that match the declared file category', () => {
    expect(validateFileForKind('image', 'image/png', 'reference.png')).toBe(
      true,
    );
    expect(
      validateFileForKind('document', 'application/pdf', 'review.pdf'),
    ).toBe(true);
    expect(
      validateFileForKind(
        'model',
        'application/octet-stream',
        'style.safetensors',
      ),
    ).toBe(true);
    expect(
      validateFileForKind('archive', 'application/zip', 'materials.zip'),
    ).toBe(true);
    expect(validateFileForKind('audio', 'audio/wav', 'brief.wav')).toBe(true);
    expect(
      validateFileForKind('model3d', 'model/gltf-binary', 'cabin.glb'),
    ).toBe(true);
  });

  it('rejects mime types or extensions from another file category', () => {
    expect(validateFileForKind('image', 'video/mp4', 'reference.mp4')).toBe(
      false,
    );
    expect(
      validateFileForKind('document', 'application/pdf', 'review.zip'),
    ).toBe(false);
    expect(validateFileForKind('video', 'video/mp4', 'walkthrough.mp4')).toBe(
      true,
    );
    expect(validateFileForKind('text', 'application/json', 'prompt.json')).toBe(
      true,
    );
  });
});
