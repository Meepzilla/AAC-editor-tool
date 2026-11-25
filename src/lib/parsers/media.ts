import { inflateSync, unzlibSync } from 'fflate';
import type { VocabSymbolAsset } from '../types';

/** Safety caps so very large embedded photo books never overwhelm iPad browser memory. */
export const MAX_SINGLE_SYMBOL_BYTES = 2 * 1024 * 1024;
export const MAX_TOTAL_SYMBOL_BYTES = 25 * 1024 * 1024;

export function detectImageMime(bytes: Uint8Array): string | null {
  if (bytes.length < 4) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png';
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  // GIF: GIF8
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'image/gif';
  }
  // WebP: RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  // BMP: BM
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return 'image/bmp';
  }
  // SVG XML
  const head = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.subarray(0, Math.min(256, bytes.length)))
    .trimStart();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) {
    return 'image/svg+xml';
  }
  return null;
}

function readPngDimensions(bytes: Uint8Array): { width?: number; height?: number } {
  if (bytes.length < 24) return {};
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (width > 0 && height > 0 && width <= 16384 && height <= 16384) {
    return { width, height };
  }
  return {};
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

/**
 * Decodes an embedded image blob (optionally zlib/deflate compressed) into a compact
 * browser-renderable VocabSymbolAsset data URL. Returns null if unreadable or oversized.
 */
export function decodeEmbeddedSymbolAsset(
  id: string,
  rawBytes: Uint8Array,
  options: {
    compressed?: boolean;
    width?: number;
    height?: number;
  } = {}
): { asset: VocabSymbolAsset; byteLength: number } | null {
  if (!rawBytes || rawBytes.length === 0 || rawBytes.length > MAX_SINGLE_SYMBOL_BYTES) {
    return null;
  }

  let data = rawBytes;
  let mime = detectImageMime(data);

  if (!mime && options.compressed) {
    try {
      const unzipped = unzlibSync(rawBytes);
      if (unzipped.length <= MAX_SINGLE_SYMBOL_BYTES) {
        mime = detectImageMime(unzipped);
        if (mime) data = unzipped;
      }
    } catch {
      try {
        const inflated = inflateSync(rawBytes);
        if (inflated.length <= MAX_SINGLE_SYMBOL_BYTES) {
          mime = detectImageMime(inflated);
          if (mime) data = inflated;
        }
      } catch {
        return null;
      }
    }
  }

  if (!mime) return null;

  const dims = mime === 'image/png' ? readPngDimensions(data) : {};
  const width = options.width && options.width > 0 ? Math.round(options.width) : dims.width;
  const height = options.height && options.height > 0 ? Math.round(options.height) : dims.height;

  const dataUrl = `data:${mime};base64,${bytesToBase64(data)}`;
  return {
    asset: {
      id,
      dataUrl,
      mimeType: mime,
      ...(width ? { width } : {}),
      ...(height ? { height } : {}),
    },
    byteLength: data.length,
  };
}

/**
 * Converts Saltillo Windows COLORREF integer (`0x00BBGGRR`, red in low byte) to `#RRGGBB`.
 */
export function colorRefToHex(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const int = Math.trunc(value);
  if (int < 0) return undefined;
  const r = int & 0xff;
  const g = (int >> 8) & 0xff;
  const b = (int >> 16) & 0xff;
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b
    .toString(16)
    .padStart(2, '0')}`.toUpperCase();
}

/**
 * Converts TD Snap signed 32-bit ARGB integer (`0xAARRGGBB`) to `#RRGGBB`.
 * Returns undefined when alpha is 0 (transparent / unset).
 */
export function argbToHex(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const unsigned = Math.trunc(value) >>> 0;
  const alpha = (unsigned >>> 24) & 0xff;
  if (alpha === 0) return undefined;
  const rgb = unsigned & 0xffffff;
  return `#${rgb.toString(16).padStart(6, '0')}`.toUpperCase();
}
