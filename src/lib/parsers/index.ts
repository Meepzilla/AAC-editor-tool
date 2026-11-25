import { inspectContainerStructure } from './container-inspect';
import { parseTdSnapFile } from './tdsnap';
import { parseTouchChatCe } from './touchchat';
import {
  ParserRefusalError,
  type DetectedAacFormat,
  type ObfBoardSet,
} from './types';

export * from './types';
export { inspectContainerStructure } from './container-inspect';

/**
 * Detects an AAC export format from its filename extension.
 */
export function detectAacFileFormat(fileName: string): DetectedAacFormat {
  const lower = fileName.trim().toLowerCase();
  if (lower.endsWith('.ce')) return 'touchchat-lamp';
  if (lower.endsWith('.sps') || lower.endsWith('.spb')) return 'td-snap';
  if (lower.endsWith('.p2gbk') || lower.endsWith('.p2g')) return 'proloquo2go';
  return 'unknown';
}

/**
 * Parses an AAC vocabulary export file completely on-device into the common OBF board model.
 * Never modifies the input buffer and never saves partial results.
 * Refuses unrecognized, corrupt, encrypted, or unmapped files with a plain structural message.
 */
export async function parseAacFile(
  fileName: string,
  bytes: Uint8Array
): Promise<ObfBoardSet> {
  if (bytes.length === 0) {
    throw new ParserRefusalError(
      'EMPTY_FILE',
      'Refused: the selected file is empty (0 bytes).',
      detectAacFileFormat(fileName)
    );
  }

  const format = detectAacFileFormat(fileName);

  if (format === 'touchchat-lamp') {
    return parseTouchChatCe(fileName, bytes);
  }

  if (format === 'td-snap') {
    return parseTdSnapFile(fileName, bytes);
  }

  const inspection = await inspectContainerStructure(fileName, bytes);

  if (format === 'proloquo2go') {
    throw new ParserRefusalError(
      'FORMAT_NOT_MAPPED',
      'Proloquo2Go (.p2gbk / .p2g) format is not mapped yet. No snapshot was saved.',
      'proloquo2go',
      inspection
    );
  }

  if (inspection.looksEncrypted) {
    throw new ParserRefusalError(
      'ENCRYPTED_OR_UNKNOWN',
      `Refused: unrecognized file (${inspection.container} container, ${inspection.byteSize} bytes) appears encrypted (entropy ${inspection.entropy} bits/byte). Supported formats: TouchChat/LAMP (.ce) and TD Snap (.sps/.spb).`,
      'unknown',
      inspection
    );
  }

  throw new ParserRefusalError(
    'UNSUPPORTED_FORMAT',
    `Refused: unsupported file format (${inspection.detectedExtension || 'no extension'}, detected ${inspection.container} container). Supported formats: TouchChat/LAMP (.ce) and TD Snap (.sps/.spb).`,
    'unknown',
    inspection
  );
}
