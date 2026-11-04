import type { DisplayProfile } from './profiles';

export interface MonoBitmap { width: number; height: number; strideBytes: number; bitOrder: 'msb_first'; oneBit: 'black'; data: Uint8Array }

/** Pack RGBA pixels as row-major MSB-first mono1. Thresholded black pixels are 1. */
export function packRgbaMono1(rgba: Uint8ClampedArray | Uint8Array, profile: DisplayProfile, threshold = 160): MonoBitmap {
  const { width, height } = profile;
  if (rgba.length !== width * height * 4) throw new Error(`RGBA length ${rgba.length} does not match ${width}x${height}.`);
  const strideBytes = Math.ceil(width / 8);
  const data = new Uint8Array(strideBytes * height);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const i = (y * width + x) * 4;
    const luminance = .2126 * rgba[i] + .7152 * rgba[i + 1] + .0722 * rgba[i + 2];
    if (rgba[i + 3] > 0 && luminance < threshold) data[y * strideBytes + (x >> 3)] |= 1 << (7 - (x & 7));
  }
  return { width, height, strideBytes, bitOrder: 'msb_first', oneBit: 'black', data };
}

export function assertMonoBitmap(bitmap: MonoBitmap, profile: DisplayProfile): void {
  if (bitmap.width !== profile.width || bitmap.height !== profile.height) throw new Error('Bitmap dimensions do not match display profile.');
  if (bitmap.strideBytes !== Math.ceil(profile.width / 8) || bitmap.data.length !== bitmap.strideBytes * profile.height) throw new Error('Invalid mono1 stride or payload length.');
  if (bitmap.bitOrder !== 'msb_first' || bitmap.oneBit !== 'black') throw new Error('Unsupported mono1 byte convention.');
}
