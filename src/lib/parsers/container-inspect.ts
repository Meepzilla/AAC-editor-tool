import { unzipSync } from 'fflate';
import {
  getSqlJs,
  isSqliteBytes,
  listColumns,
  listTables,
  queryRows,
  quoteIdentifier,
} from './sqlite-loader';
import {
  ParserRefusalError,
  type DetectedAacFormat,
  type StructuralInspectionReport,
} from './types';

const ZIP_LOCAL_HEADER = [0x50, 0x4b, 0x03, 0x04];
const ZIP_EMPTY_HEADER = [0x50, 0x4b, 0x05, 0x06];
const BPLIST_HEADER = 'bplist00';

const SAMPLE_BYTES = 65536;
const MAX_ZIP_ENTRIES = 10000;
const MAX_UNCOMPRESSED_BYTES = 250 * 1024 * 1024;
const MAX_INSPECT_SQLITE_BYTES = 64 * 1024 * 1024;

const STRUCTURAL_STEMS = new Set([
  'settings',
  'styles',
  'manifest',
  'filemap',
  'grid',
  'index',
  'info',
  'metadata',
  'content',
  'config',
  'version',
  'data',
  'images',
  'info.plist',
]);

export function bytesToHex(bytes: Uint8Array, limit = 8): string {
  const slice = bytes.subarray(0, Math.min(limit, bytes.length));
  return Array.from(slice, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function isZipBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  const matchesLocal = ZIP_LOCAL_HEADER.every((b, i) => bytes[i] === b);
  const matchesEmpty = ZIP_EMPTY_HEADER.every((b, i) => bytes[i] === b);
  return matchesLocal || matchesEmpty;
}

export function isBinaryPlistBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  const head = new TextDecoder('ascii', { fatal: false }).decode(bytes.subarray(0, 8));
  return head === BPLIST_HEADER;
}

/** Shannon entropy in bits per byte (0..8). Encrypted data typically scores > 7.5. */
export function shannonEntropy(bytes: Uint8Array): number {
  const sample = bytes.subarray(0, Math.min(bytes.length, SAMPLE_BYTES));
  if (sample.length === 0) return 0;
  const counts = new Uint32Array(256);
  for (let i = 0; i < sample.length; i++) {
    counts[sample[i]] += 1;
  }
  let entropy = 0;
  const n = sample.length;
  for (let i = 0; i < 256; i++) {
    const c = counts[i];
    if (c === 0) continue;
    const p = c / n;
    entropy -= p * Math.log2(p);
  }
  return Math.round(entropy * 100) / 100;
}

/**
 * Heuristic ported from rjpenny16/AAC-Editor (`tdsnap/formats.py`):
 * High entropy (> 7.5 bits/byte) with >= 256 bytes and 16-byte block alignment
 * (or very high entropy > 7.85 on unknown binary) suggests encryption.
 */
export function looksEncrypted(bytes: Uint8Array): boolean {
  if (bytes.length < 256) return false;
  const e = shannonEntropy(bytes);
  return (e > 7.5 && bytes.length % 16 === 0) || e > 7.85;
}

interface ZipCentralEntry {
  name: string;
  encrypted: boolean;
  uncompressedSize: number;
  isDirectory: boolean;
}

/**
 * Scans the ZIP Central Directory (or Local File Headers fallback) to inspect entry count,
 * uncompressed size budget, and encryption bit flags BEFORE decompressing anything.
 */
export function scanZipDirectory(bytes: Uint8Array): ZipCentralEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries: ZipCentralEntry[] = [];

  // Locate End of Central Directory (EOCD) signature 0x06054b50 from the end of the buffer.
  let eocdOffset = -1;
  const minOffset = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= minOffset; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset !== -1) {
    const totalEntries = view.getUint16(eocdOffset + 10, true);
    const cdOffset = view.getUint32(eocdOffset + 16, true);
    const cdSize = view.getUint32(eocdOffset + 12, true);
    const decoder = new TextDecoder('utf-8', { fatal: false });
    let pos = cdOffset;
    const end = Math.min(bytes.length, cdOffset + cdSize);

    for (let idx = 0; idx < totalEntries && pos + 46 <= end; idx++) {
      if (view.getUint32(pos, true) !== 0x02014b50) break;
      const flags = view.getUint16(pos + 8, true);
      const uncompressedSize = view.getUint32(pos + 24, true);
      const nameLen = view.getUint16(pos + 28, true);
      const extraLen = view.getUint16(pos + 30, true);
      const commentLen = view.getUint16(pos + 32, true);
      const nameBytes = bytes.subarray(pos + 46, pos + 46 + nameLen);
      const name = decoder.decode(nameBytes);
      entries.push({
        name,
        encrypted: (flags & 0x1) !== 0,
        uncompressedSize,
        isDirectory: name.endsWith('/'),
      });
      pos += 46 + nameLen + extraLen + commentLen;
    }
  }

  return entries;
}

/**
 * Safely unzips a ZIP archive after checking for encryption flags and decompression size limits.
 */
export function safeUnzip(
  bytes: Uint8Array,
  format: DetectedAacFormat
): Record<string, Uint8Array> {
  if (!isZipBytes(bytes)) {
    if (looksEncrypted(bytes)) {
      throw new ParserRefusalError(
        'ENCRYPTED_FILE',
        'Refused: this file appears encrypted and is not a standard ZIP archive.',
        format
      );
    }
    throw new ParserRefusalError(
      'NOT_ZIP',
      'Refused: expected a ZIP archive, but this file has a different container header.',
      format
    );
  }

  const directory = scanZipDirectory(bytes);
  if (directory.length > MAX_ZIP_ENTRIES) {
    throw new ParserRefusalError(
      'ZIP_TOO_MANY_ENTRIES',
      `Refused: archive contains ${directory.length} entries, exceeding the safety limit.`,
      format
    );
  }

  const encryptedCount = directory.filter((e) => e.encrypted).length;
  if (encryptedCount > 0) {
    throw new ParserRefusalError(
      'ZIP_ENCRYPTED',
      `Refused: this ZIP archive has ${encryptedCount} password-encrypted entr${encryptedCount === 1 ? 'y' : 'ies'} and cannot be read.`,
      format
    );
  }

  const totalUncompressed = directory.reduce((sum, e) => sum + e.uncompressedSize, 0);
  if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
    throw new ParserRefusalError(
      'ZIP_TOO_LARGE',
      'Refused: uncompressed archive size exceeds the 250 MB safety limit.',
      format
    );
  }

  try {
    return unzipSync(bytes);
  } catch {
    throw new ParserRefusalError(
      'CORRUPT_ZIP',
      'Refused: this ZIP archive is damaged or incomplete and could not be extracted.',
      format
    );
  }
}

/**
 * Replaces potentially student-identifying file/folder stems with `*` while preserving
 * structural names and extensions — ported from `tdsnap/formats.py` `_shape()`.
 */
export function generalizeEntryPath(rawPath: string): string {
  const normalized = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length === 0) return '*';

  const last = segments[segments.length - 1];
  const dot = last.lastIndexOf('.');
  const stem = dot > 0 ? last.slice(0, dot) : last;
  const ext = dot > 0 ? last.slice(dot).toLowerCase() : '';
  const keepLast = STRUCTURAL_STEMS.has(stem.toLowerCase()) || STRUCTURAL_STEMS.has(last.toLowerCase());
  const generalizedLast = keepLast ? last : `*${ext}`;

  if (segments.length === 1) return generalizedLast;
  return [segments[0], ...segments.slice(1, -1).map(() => '*'), generalizedLast].join('/');
}

async function inspectSqliteTablesOnly(
  bytes: Uint8Array
): Promise<Array<{ table: string; columns: string[]; rows: number | null }> | undefined> {
  if (!isSqliteBytes(bytes) || bytes.length > MAX_INSPECT_SQLITE_BYTES) return undefined;
  try {
    const SQL = await getSqlJs();
    const db = new SQL.Database(bytes);
    try {
      db.run('PRAGMA trusted_schema = OFF;');
      db.run('PRAGMA cell_size_check = ON;');
      const tables = listTables(db);
      return tables.map((table) => {
        const cols = listColumns(db, table).map((c) =>
          c.type ? `${c.name} ${c.type}` : c.name
        );
        let rowCount: number | null = null;
        try {
          const res = queryRows(db, `SELECT COUNT(*) AS c FROM ${quoteIdentifier(table)}`);
          rowCount = typeof res[0]?.c === 'number' ? res[0].c : null;
        } catch {
          rowCount = null;
        }
        return { table, columns: cols, rows: rowCount };
      });
    } finally {
      db.close();
    }
  } catch {
    return undefined;
  }
}

/**
 * Safe structure-only file inspection (container type, encryption indicators, generalized
 * entry shapes, and SQLite table/column names with row counts).
 * NEVER reads or prints button labels, word lists, or student names.
 */
export async function inspectContainerStructure(
  fileName: string,
  bytes: Uint8Array
): Promise<StructuralInspectionReport> {
  const dot = fileName.lastIndexOf('.');
  const ext = dot >= 0 ? fileName.slice(dot).toLowerCase() : '';
  const entropy = shannonEntropy(bytes);
  const magicHex = bytesToHex(bytes, 8);

  if (isSqliteBytes(bytes)) {
    const sqliteTables = await inspectSqliteTablesOnly(bytes);
    return {
      detectedExtension: ext,
      container: 'sqlite',
      byteSize: bytes.length,
      magicHex,
      looksEncrypted: false,
      entropy,
      sqliteTables,
    };
  }

  if (isZipBytes(bytes)) {
    const directory = scanZipDirectory(bytes);
    const zipEncryptedEntryCount = directory.filter((e) => e.encrypted).length;
    const base: StructuralInspectionReport = {
      detectedExtension: ext,
      container: 'zip',
      byteSize: bytes.length,
      magicHex,
      looksEncrypted: zipEncryptedEntryCount > 0,
      entropy,
      zipEntryCount: directory.length,
      zipEncryptedEntryCount,
    };

    if (zipEncryptedEntryCount === 0 && directory.length <= MAX_ZIP_ENTRIES) {
      try {
        const entries = unzipSync(bytes);
        const shapes = new Map<
          string,
          {
            shape: string;
            count: number;
            bytes: number;
            contentType?: string;
            sqliteTables?: Array<{ table: string; columns: string[]; rows: number | null }>;
          }
        >();

        for (const [entryName, entryData] of Object.entries(entries)) {
          if (entryName.endsWith('/')) continue;
          const shape = generalizeEntryPath(entryName);
          const existing = shapes.get(shape) ?? { shape, count: 0, bytes: 0 };
          existing.count += 1;
          existing.bytes += entryData.length;

          if (!existing.contentType) {
            if (isSqliteBytes(entryData)) {
              existing.contentType = 'sqlite';
              existing.sqliteTables = await inspectSqliteTablesOnly(entryData);
            } else if (isBinaryPlistBytes(entryData)) {
              existing.contentType = 'binary-plist';
            } else if (isZipBytes(entryData)) {
              existing.contentType = 'nested-zip';
            } else {
              const preview = new TextDecoder('utf-8', { fatal: false })
                .decode(entryData.subarray(0, 64))
                .trimStart();
              if (preview.startsWith('<')) existing.contentType = 'xml';
              else if (preview.startsWith('{') || preview.startsWith('['))
                existing.contentType = 'json';
              else if (looksEncrypted(entryData)) existing.contentType = 'encrypted-looking';
              else existing.contentType = 'binary/text';
            }
          }
          shapes.set(shape, existing);
        }

        base.entryShapes = Array.from(shapes.values()).sort((a, b) =>
          a.shape.localeCompare(b.shape)
        );
        if (base.entryShapes.some((s) => s.contentType === 'encrypted-looking')) {
          base.looksEncrypted = true;
        }
      } catch {
        // Keep top-level directory summary if unzip fails
      }
    }

    return base;
  }

  if (isBinaryPlistBytes(bytes)) {
    return {
      detectedExtension: ext,
      container: 'plist',
      byteSize: bytes.length,
      magicHex,
      looksEncrypted: false,
      entropy,
    };
  }

  const headText = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.subarray(0, 64))
    .trimStart();
  if (headText.startsWith('<')) {
    return {
      detectedExtension: ext,
      container: 'xml',
      byteSize: bytes.length,
      magicHex,
      looksEncrypted: false,
      entropy,
    };
  }
  if (headText.startsWith('{') || headText.startsWith('[')) {
    return {
      detectedExtension: ext,
      container: 'json',
      byteSize: bytes.length,
      magicHex,
      looksEncrypted: false,
      entropy,
    };
  }

  return {
    detectedExtension: ext,
    container: 'other',
    byteSize: bytes.length,
    magicHex,
    looksEncrypted: looksEncrypted(bytes),
    entropy,
  };
}
