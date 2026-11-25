import { inspectContainerStructure } from './container-inspect';
import {
  ParserRefusalError,
  type StructuralInspectionReport,
} from './types';

/**
 * Proloquo2Go (.p2gbk full backup, .p2g partial export) recognition stub.
 *
 * Internal structure is not publicly documented. This module intentionally does NOT
 * guess a parser: it recognizes the extension, runs a read-only structure-only container
 * inspection (never reading or outputting vocabulary content), and returns a plain
 * "format not mapped yet" refusal naming what was found.
 */

export function isProloquo2GoFile(fileName: string): boolean {
  const lower = fileName.trim().toLowerCase();
  return lower.endsWith('.p2gbk') || lower.endsWith('.p2g');
}

export function proloquo2GoFileKind(fileName: string): string {
  const lower = fileName.trim().toLowerCase();
  if (lower.endsWith('.p2gbk')) return 'Proloquo2Go full backup (.p2gbk)';
  if (lower.endsWith('.p2g')) return 'Proloquo2Go partial export (.p2g)';
  return 'Proloquo2Go export';
}

/**
 * Formats a privacy-safe, structure-only report suitable for documenting a sample
 * Proloquo2Go export. Generalized paths & SQLite table/column names only — never
 * includes button labels, word lists, or student names.
 */
export function formatStructureReportText(report: StructuralInspectionReport): string {
  const lines: string[] = [
    `Extension: ${report.detectedExtension || '(none)'}`,
    `Container: ${report.container} (${report.byteSize} bytes, magic ${report.magicHex || 'n/a'})`,
    `Entropy: ${report.entropy} bits/byte (looks encrypted: ${report.looksEncrypted ? 'yes' : 'no'})`,
  ];

  if (report.container === 'zip') {
    lines.push(
      `ZIP entries: ${report.zipEntryCount ?? 0} (zip-encrypted: ${report.zipEncryptedEntryCount ?? 0})`
    );
    for (const item of report.entryShapes ?? []) {
      lines.push(
        `  ${item.shape}  x${item.count}  ${item.bytes} bytes${
          item.contentType ? `  [${item.contentType}]` : ''
        }`
      );
      for (const tbl of item.sqliteTables ?? []) {
        lines.push(`    table ${tbl.table} (${tbl.rows ?? '?'} rows)`);
        lines.push(`      ${tbl.columns.join(', ')}`);
      }
    }
  } else if (report.sqliteTables && report.sqliteTables.length > 0) {
    for (const tbl of report.sqliteTables) {
      lines.push(`  table ${tbl.table} (${tbl.rows ?? '?'} rows)`);
      lines.push(`    ${tbl.columns.join(', ')}`);
    }
  }

  lines.push(
    'Note: Entry names are generalized and no vocabulary labels, messages, or student names are included.'
  );
  return lines.join('\n');
}

/**
 * Recognizes a Proloquo2Go file, inspects only its container/table structure, and refuses
 * cleanly with a plain "format not mapped yet" message naming what was found.
 */
export async function parseProloquo2GoStub(
  fileName: string,
  bytes: Uint8Array
): Promise<never> {
  const kind = proloquo2GoFileKind(fileName);
  const inspection = await inspectContainerStructure(fileName, bytes);

  const findingParts: string[] = [`container: ${inspection.container}`];
  if (inspection.container === 'zip') {
    findingParts.push(`${inspection.zipEntryCount ?? 0} entries`);
  }
  if (inspection.looksEncrypted) {
    findingParts.push('encryption detected');
  }

  const message =
    `Recognized ${kind}, but Proloquo2Go format is not mapped yet (${findingParts.join(', ')}). ` +
    'Nothing was saved. Review or copy the structure-only report below from a disposable stock export to help map this format safely.';

  throw new ParserRefusalError(
    'FORMAT_NOT_MAPPED',
    message,
    'proloquo2go',
    inspection
  );
}
