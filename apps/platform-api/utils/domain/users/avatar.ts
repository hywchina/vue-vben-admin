export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export type AvatarMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ImageDimensions {
  height: number;
  width: number;
}

export function detectAvatarMimeType(
  data: Uint8Array,
): AvatarMimeType | undefined {
  if (
    data.length >= 8 &&
    data[0] === 137 &&
    data[1] === 80 &&
    data[2] === 78 &&
    data[3] === 71 &&
    data[4] === 13 &&
    data[5] === 10 &&
    data[6] === 26 &&
    data[7] === 10
  ) {
    return 'image/png';
  }
  if (
    data.length >= 3 &&
    data[0] === 255 &&
    data[1] === 216 &&
    data[2] === 255
  ) {
    return 'image/jpeg';
  }
  if (
    data.length >= 12 &&
    data[0] === 82 &&
    data[1] === 73 &&
    data[2] === 70 &&
    data[3] === 70 &&
    data[8] === 87 &&
    data[9] === 69 &&
    data[10] === 66 &&
    data[11] === 80
  ) {
    return 'image/webp';
  }
  return undefined;
}

export function avatarFileExtension(mimeType: AvatarMimeType) {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
}

function readUint24LE(data: Uint8Array, offset: number) {
  return (
    (data.at(offset) ?? 0) |
    ((data.at(offset + 1) ?? 0) << 8) |
    ((data.at(offset + 2) ?? 0) << 16)
  );
}

function readUint16BE(data: Uint8Array, offset: number) {
  return ((data.at(offset) ?? 0) << 8) | (data.at(offset + 1) ?? 0);
}

function readUint32BE(data: Uint8Array, offset: number) {
  return (
    (data.at(offset) ?? 0) * 16_777_216 +
    ((data.at(offset + 1) ?? 0) << 16) +
    ((data.at(offset + 2) ?? 0) << 8) +
    (data.at(offset + 3) ?? 0)
  );
}

export function readImageDimensions(
  data: Uint8Array,
  mimeType: AvatarMimeType,
): ImageDimensions | undefined {
  if (mimeType === 'image/png') {
    if (data.length < 24) return undefined;
    return {
      height: readUint32BE(data, 20),
      width: readUint32BE(data, 16),
    };
  }
  if (mimeType === 'image/jpeg') {
    let offset = 2;
    while (offset + 8 < data.length) {
      if (data[offset] !== 255) {
        offset += 1;
        continue;
      }
      const marker = data.at(offset + 1) ?? 0;
      if (
        (marker >= 192 && marker <= 195) ||
        (marker >= 197 && marker <= 199) ||
        (marker >= 201 && marker <= 203) ||
        (marker >= 205 && marker <= 207)
      ) {
        return {
          height: readUint16BE(data, offset + 5),
          width: readUint16BE(data, offset + 7),
        };
      }
      if (marker === 216 || marker === 217) {
        offset += 2;
        continue;
      }
      const segmentLength = readUint16BE(data, offset + 2);
      if (segmentLength < 2) return undefined;
      offset += segmentLength + 2;
    }
    return undefined;
  }
  if (data.length < 30) return undefined;
  const subtype = String.fromCodePoint(...data.slice(12, 16));
  if (subtype === 'VP8X') {
    return {
      height: 1 + readUint24LE(data, 27),
      width: 1 + readUint24LE(data, 24),
    };
  }
  if (subtype === 'VP8L' && data.length >= 25 && data[20] === 47) {
    const bits =
      (data.at(21) ?? 0) |
      ((data.at(22) ?? 0) << 8) |
      ((data.at(23) ?? 0) << 16) |
      ((data.at(24) ?? 0) << 24);
    return {
      height: ((bits >> 14) & 16_383) + 1,
      width: (bits & 16_383) + 1,
    };
  }
  if (subtype === 'VP8 ' && data.length >= 30) {
    return {
      height: readUint16BE(data, 28) & 16_383,
      width: readUint16BE(data, 26) & 16_383,
    };
  }
  return undefined;
}
