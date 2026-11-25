import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import manifest from '@/app/manifest';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function readPngDimensions(filePath: string): { width: number; height: number } {
  const buf = fs.readFileSync(filePath);
  expect(buf.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

describe('PWA manifest, icons, and offline service worker template', () => {
  it('defines a standalone iPad-installable web app manifest', () => {
    const m = manifest();
    expect(m.name).toBe('AAC Profile Manager');
    expect(m.short_name).toBe('AAC Profiles');
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('/');
    expect(m.icons).toBeDefined();
    expect((m.icons ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('ships valid PNG icons at exact required dimensions for iOS/iPadOS and PWA', () => {
    expect(readPngDimensions(path.join(ROOT, 'public/icons/icon-192.png'))).toEqual({
      width: 192,
      height: 192,
    });
    expect(readPngDimensions(path.join(ROOT, 'public/icons/icon-512.png'))).toEqual({
      width: 512,
      height: 512,
    });
    expect(readPngDimensions(path.join(ROOT, 'public/icons/icon-512-maskable.png'))).toEqual({
      width: 512,
      height: 512,
    });
    expect(readPngDimensions(path.join(ROOT, 'public/apple-touch-icon.png'))).toEqual({
      width: 180,
      height: 180,
    });
  });

  it('keeps the service worker template strictly same-origin with offline navigation fallback', () => {
    const swTemplate = fs.readFileSync(path.join(ROOT, 'scripts/sw-template.js'), 'utf8');
    expect(swTemplate).toContain('url.origin !== self.location.origin');
    expect(swTemplate).toContain("addEventListener('install'");
    expect(swTemplate).toContain("addEventListener('activate'");
    expect(swTemplate).toContain("addEventListener('fetch'");
    expect(swTemplate).toContain('__PRECACHE_URLS__');
    // Must not reference external analytics or remote CDNs.
    expect(swTemplate).not.toMatch(/https?:\/\//);

    // Substituting placeholders must produce syntactically valid JavaScript.
    const rendered = swTemplate
      .replaceAll('__VERSION__', JSON.stringify('test123'))
      .replaceAll('__PRECACHE_URLS__', JSON.stringify(['/', '/settings/']));
    expect(rendered).not.toContain('__VERSION__');
    expect(rendered).not.toContain('__PRECACHE_URLS__');
    expect(() => new Function(rendered)).not.toThrow();
  });
});
