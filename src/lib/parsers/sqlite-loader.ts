import type { Database, SqlJsStatic, SqlValue } from 'sql.js';
import { looksEncrypted } from './container-inspect';
import { ParserRefusalError, type DetectedAacFormat } from './types';

export const SQLITE_HEADER = 'SQLite format 3\0';
const SQLITE_HEADER_BYTES = new TextEncoder().encode(SQLITE_HEADER);

let sqlJsPromise: Promise<SqlJsStatic> | null = null;

/**
 * Loads sql.js WASM strictly locally:
 * - In the browser: fetches `/wasm/sql-wasm.wasm` from the same origin (precached offline by sw.js).
 * - In Node (Vitest unit tests): resolves `node_modules/sql.js/dist/sql-wasm.wasm` from disk.
 */
export async function getSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsPromise) {
    sqlJsPromise = (async () => {
      const mod = await import('sql.js');
      const initSqlJs = mod.default;
      const isNode =
        typeof process !== 'undefined' &&
        Boolean(process.versions?.node) &&
        typeof window === 'undefined';

      if (isNode) {
        const wasmPath = `${process.cwd()}/node_modules/sql.js/dist/sql-wasm.wasm`;
        return initSqlJs({ locateFile: () => wasmPath });
      }

      return initSqlJs({
        locateFile: () => '/wasm/sql-wasm.wasm',
      });
    })();
  }
  return sqlJsPromise;
}

export function isSqliteBytes(bytes: Uint8Array): boolean {
  if (bytes.length < SQLITE_HEADER_BYTES.length) return false;
  for (let i = 0; i < SQLITE_HEADER_BYTES.length; i++) {
    if (bytes[i] !== SQLITE_HEADER_BYTES[i]) return false;
  }
  return true;
}

/** Quotes a SQLite identifier safely (doubling any embedded double-quote). */
export function quoteIdentifier(name: string): string {
  return `"${String(name).replace(/"/g, '""')}"`;
}

/**
 * Opens an untrusted SQLite byte buffer strictly in memory (read-only on the source file),
 * hardens it with `trusted_schema=OFF` and `cell_size_check=ON`, and verifies `PRAGMA integrity_check`.
 */
export async function openReadOnlySqlite(
  bytes: Uint8Array,
  format: DetectedAacFormat,
  label: string
): Promise<Database> {
  if (!isSqliteBytes(bytes)) {
    if (looksEncrypted(bytes)) {
      throw new ParserRefusalError(
        'ENCRYPTED_DATABASE',
        `Refused: ${label} appears encrypted or DRM-protected rather than a standard SQLite database. Encrypted vocabularies cannot be read.`,
        format
      );
    }
    throw new ParserRefusalError(
      'NOT_SQLITE',
      `Refused: ${label} is not a valid SQLite database (unexpected file header).`,
      format
    );
  }

  const SQL = await getSqlJs();
  let db: Database | null = null;
  try {
    db = new SQL.Database(bytes);
    // Defense-in-depth settings recommended for untrusted SQLite databases (from rjpenny16/AAC-Editor).
    db.run('PRAGMA trusted_schema = OFF;');
    db.run('PRAGMA cell_size_check = ON;');

    const check = db.exec('PRAGMA integrity_check(1);');
    const status = check[0]?.values?.[0]?.[0];
    if (String(status).toLowerCase() !== 'ok') {
      throw new ParserRefusalError(
        'CORRUPT_SQLITE',
        `Refused: ${label} failed SQLite integrity verification and may be damaged or truncated.`,
        format
      );
    }

    return db;
  } catch (err) {
    if (db) {
      try {
        db.close();
      } catch {
        // ignore close error
      }
    }
    if (err instanceof ParserRefusalError) throw err;
    throw new ParserRefusalError(
      'SQLITE_OPEN_FAILED',
      `Refused: ${label} could not be opened as a readable SQLite database.`,
      format
    );
  }
}

export type RowRecord = Record<string, SqlValue>;

/** Executes a parameterized SELECT query and maps rows into plain objects. */
export function queryRows(
  db: Database,
  sql: string,
  params: SqlValue[] = []
): RowRecord[] {
  const stmt = db.prepare(sql);
  try {
    if (params.length > 0) {
      stmt.bind(params);
    }
    const rows: RowRecord[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    return rows;
  } finally {
    stmt.free();
  }
}

/** Discovers all table names in a SQLite database at runtime. */
export function listTables(db: Database): string[] {
  const rows = queryRows(
    db,
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
  );
  return rows.map((r) => String(r.name ?? '')).filter(Boolean);
}

/** Discovers all column names (and types) of a table at runtime via PRAGMA table_info. */
export function listColumns(
  db: Database,
  table: string
): Array<{ name: string; type: string; pk: boolean }> {
  const rows = queryRows(db, `PRAGMA table_info(${quoteIdentifier(table)})`);
  return rows.map((r) => ({
    name: String(r.name ?? ''),
    type: String(r.type ?? ''),
    pk: Number(r.pk ?? 0) > 0,
  }));
}

export function findColumnCaseInsensitive(
  columns: Array<{ name: string }>,
  candidates: string[]
): string | null {
  const lowerMap = new Map(columns.map((c) => [c.name.toLowerCase(), c.name]));
  for (const candidate of candidates) {
    const hit = lowerMap.get(candidate.toLowerCase());
    if (hit) return hit;
  }
  return null;
}
