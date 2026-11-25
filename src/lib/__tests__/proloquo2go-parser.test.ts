import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  detectAacFileFormat,
  formatStructureReportText,
  parseAacFile,
  ParserRefusalError,
} from '../parsers';
import { getSqlJs } from '../parsers/sqlite-loader';

describe('Proloquo2Go (.p2gbk / .p2g) recognition stub & safe structure inspection', () => {
  it('recognizes .p2gbk and .p2g extensions and refuses cleanly without guessing a parser', async () => {
    expect(detectAacFileFormat('SampleBackup.p2gbk')).toBe('proloquo2go');
    expect(detectAacFileFormat('SnacksFolder.p2g')).toBe('proloquo2go');

    // Synthetic ZIP containing an embedded SQLite DB with private-looking button text
    // and a student-named file to verify ZERO vocabulary content leaks into the report.
    const SQL = await getSqlJs();
    const db = new SQL.Database();
    db.run('CREATE TABLE ZBUTTON (Z_PK INTEGER PRIMARY KEY, ZLABEL TEXT, ZMESSAGE TEXT);');
    db.run(
      "INSERT INTO ZBUTTON (Z_PK, ZLABEL, ZMESSAGE) VALUES (1, 'SENSITIVE_WORD_XYZ', 'PRIVATE_SPEECH_123');"
    );
    const dbBytes = db.export();
    db.close();

    const syntheticP2gbk = zipSync({
      'Metadata/Info.plist': strToU8('<plist version="1.0"><dict></dict></plist>'),
      'Users/SamStudent/VocabData.sqlite': dbBytes,
    });

    let caught: unknown;
    try {
      await parseAacFile('SamStudent.p2gbk', syntheticP2gbk);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ParserRefusalError);
    const refusal = caught as ParserRefusalError;
    expect(refusal.code).toBe('FORMAT_NOT_MAPPED');
    expect(refusal.detectedFormat).toBe('proloquo2go');
    expect(refusal.message).toMatch(/not mapped yet/i);
    expect(refusal.inspection).toBeDefined();
    expect(refusal.inspection?.container).toBe('zip');
    expect(refusal.inspection?.zipEntryCount).toBe(2);

    const reportText = formatStructureReportText(refusal.inspection!);
    // Structure report captures table/column metadata cleanly...
    expect(reportText).toContain('table ZBUTTON (1 rows)');
    expect(reportText).toContain('ZLABEL TEXT');
    // ...while NEVER leaking student names, button labels, or spoken messages!
    expect(reportText).not.toContain('SENSITIVE_WORD_XYZ');
    expect(reportText).not.toContain('PRIVATE_SPEECH_123');
    expect(reportText).not.toContain('SamStudent');
    expect(refusal.message).not.toContain('SENSITIVE_WORD_XYZ');
  });

  it('flags encrypted-looking .p2g files clearly in refusal message and structure report', async () => {
    const encryptedLike = new Uint8Array(1024);
    for (let i = 0; i < encryptedLike.length; i++) {
      encryptedLike[i] = (i * 131 + 37) & 0xff;
    }

    let caught: unknown;
    try {
      await parseAacFile('export.p2g', encryptedLike);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ParserRefusalError);
    const refusal = caught as ParserRefusalError;
    expect(refusal.code).toBe('FORMAT_NOT_MAPPED');
    expect(refusal.message).toMatch(/not mapped yet/i);
    expect(refusal.message).toMatch(/encryption detected/i);
    expect(refusal.inspection?.looksEncrypted).toBe(true);
  });

  it('refuses unknown file extensions with a plain structural message', async () => {
    await expect(
      parseAacFile('notes.txt', strToU8('just plain text'))
    ).rejects.toThrow(/unsupported file format/i);
  });
});
