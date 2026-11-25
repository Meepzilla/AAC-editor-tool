import { strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { boardSetToSnapshot, parseAacFile, ParserRefusalError } from '../parsers';
import { getSqlJs } from '../parsers/sqlite-loader';

/**
 * Builds a synthetic TD Snap .sps SQLite database matching schema 4.13 verified in
 * rjpenny16/AAC-Editor (Page, Button, ElementReference, ElementPlacement, PageLayout,
 * CommandSequence, ButtonPageLink, PageSetProperties, SyncData, Synchronization).
 */
async function buildSyntheticTdSnapFixture(options: {
  schemaVersion?: string;
  friendlyName?: string;
  omitOptionalSyncTables?: boolean;
} = {}): Promise<Uint8Array> {
  const SQL = await getSqlJs();
  const db = new SQL.Database();

  const HOME_UID = '11111111-1111-4111-8111-111111111111';
  const PLAY_UID = '22222222-2222-4222-8222-222222222222';
  const MSGBAR_UID = '33333333-3333-4333-8333-333333333333';

  db.run(`
    CREATE TABLE Page (
      Id INTEGER PRIMARY KEY,
      UniqueId TEXT,
      Title TEXT,
      PageType INTEGER,
      Timestamp INTEGER,
      SyncHash INTEGER
    );
    CREATE TABLE ElementReference (
      Id INTEGER PRIMARY KEY,
      PageId INTEGER,
      ElementType INTEGER
    );
    CREATE TABLE PageLayout (
      Id INTEGER PRIMARY KEY,
      PageLayoutSetting TEXT,
      PageId INTEGER
    );
    CREATE TABLE ElementPlacement (
      Id INTEGER PRIMARY KEY,
      GridPosition TEXT,
      GridSpan TEXT,
      Visible INTEGER,
      ElementReferenceId INTEGER,
      PageLayoutId INTEGER
    );
    CREATE TABLE Button (
      Id INTEGER PRIMARY KEY,
      Label TEXT,
      Message TEXT,
      UniqueId TEXT,
      ElementReferenceId INTEGER
    );
    CREATE TABLE CommandSequence (
      Id INTEGER PRIMARY KEY,
      SerializedCommands TEXT,
      ButtonId INTEGER
    );
    CREATE TABLE ButtonPageLink (
      Id INTEGER PRIMARY KEY,
      ButtonId INTEGER,
      PageUniqueId TEXT
    );
    CREATE TABLE PageSetProperties (
      Id INTEGER PRIMARY KEY,
      SchemaVersion TEXT,
      GridDimension TEXT,
      DefaultHomePageUniqueId TEXT,
      FriendlyName TEXT
    );
  `);

  if (!options.omitOptionalSyncTables) {
    db.run(`
      CREATE TABLE SyncData (UniqueId TEXT PRIMARY KEY, SyncHash INTEGER);
      CREATE TABLE Synchronization (Id INTEGER PRIMARY KEY, PageSetTimestamp INTEGER);
      INSERT INTO Synchronization (Id, PageSetTimestamp) VALUES (1, 638000000000000000);
    `);
  }

  // TD Snap GridDimension is "cols,rows" -> "5,3" means 5 columns by 3 rows ("3 x 5").
  db.run(
    `INSERT INTO PageSetProperties (Id, SchemaVersion, GridDimension, DefaultHomePageUniqueId, FriendlyName)
     VALUES (1, ?, '5,3', ?, ?)`,
    [
      options.schemaVersion ?? '4.13',
      HOME_UID,
      options.friendlyName ?? 'Core First Synthetic 3x5',
    ]
  );

  // Two vocabulary pages (PageType=1) and one system message-bar page (PageType=3, must be excluded)
  db.run(`
    INSERT INTO Page (Id, UniqueId, Title, PageType, Timestamp, SyncHash) VALUES
      (1, '${HOME_UID}', 'Core Home', 1, 100, 999999),
      (2, '${PLAY_UID}', 'Play Time', 1, 100, 888888),
      (3, '${MSGBAR_UID}', 'Message Bar', 3, 100, 777777);
  `);

  // Home has TWO layouts: an unused 3x3 layout and the active 5,3 layout matching GridDimension.
  db.run(`
    INSERT INTO PageLayout (Id, PageLayoutSetting, PageId) VALUES
      (10, '3,3,False,0', 1),
      (11, '5,3,False,0', 1),
      (12, '4,2,False,0', 2),
      (13, '5,1,False,0', 3);
  `);

  db.run(`
    INSERT INTO ElementReference (Id, PageId, ElementType) VALUES
      (100, 1, 0),
      (101, 1, 0),
      (102, 1, 0),
      (103, 1, 0),
      (200, 2, 0),
      (201, 2, 0),
      (300, 3, 0);
  `);

  db.run(`
    INSERT INTO Button (Id, Label, Message, UniqueId, ElementReferenceId) VALUES
      (1, 'more', 'more please', 'b-1', 100),
      (2, 'Play', '', 'b-2', 101),
      (3, 'hidden item', 'hidden', 'b-3', 102),
      (4, 'wrong layout btn', 'ignored', 'b-4', 103),
      (5, 'blocks', 'build with blocks', 'b-5', 200),
      (6, 'Back Home', '', 'b-6', 201),
      (7, 'Speak', '', 'b-7', 300);
  `);

  // GridPosition is zero-based "col,row"
  db.run(`
    INSERT INTO ElementPlacement (Id, GridPosition, GridSpan, Visible, ElementReferenceId, PageLayoutId) VALUES
      (1, '0,0', '1,1', 1, 100, 11),
      (2, '4,2', '1,1', 1, 101, 11),
      (3, '1,0', '1,1', 0, 102, 11),
      (4, '0,0', '1,1', 1, 103, 10),
      (5, '2,1', '1,1', 1, 200, 12),
      (6, '0,0', '1,1', 1, 201, 12),
      (7, '0,0', '1,1', 1, 300, 13);
  `);

  // Button 2 links to Play Time via CommandSequence ($type: "2")
  const navCmd = JSON.stringify({
    $values: [{ $type: '2', LinkedPageId: PLAY_UID }],
  });
  const speakCmd = JSON.stringify({
    $values: [{ $type: '3' }],
  });
  db.run(
    `INSERT INTO CommandSequence (Id, SerializedCommands, ButtonId) VALUES (1, ?, 1), (2, ?, 2)`,
    [speakCmd, navCmd]
  );

  // Button 6 links back to Core Home via ButtonPageLink table
  db.run(
    `INSERT INTO ButtonPageLink (Id, ButtonId, PageUniqueId) VALUES (1, 6, ?)`,
    [HOME_UID]
  );

  const bytes = db.export();
  db.close();
  return bytes;
}

describe('TD Snap (.sps / .spb) parser', () => {
  it('discovers schema at runtime and extracts pages, grid sizes, labels, messages, and links', async () => {
    const spsBytes = await buildSyntheticTdSnapFixture();
    const boardSet = await parseAacFile('student-export.sps', spsBytes);

    expect(boardSet.format).toBe('open-board-0.1');
    expect(boardSet.sourceSystem).toBe('TD Snap');
    expect(boardSet.vocabularyName).toBe('Core First Synthetic 3x5');
    // TD Snap "5,3" (cols,rows) maps to "3 x 5" (rows x columns)
    expect(boardSet.mainGridSize).toBe('3 x 5');
    // Message bar (PageType=3) is excluded -> 2 vocabulary pages
    expect(boardSet.boards).toHaveLength(2);

    const home = boardSet.boards[0];
    expect(home.name).toBe('Core Home');
    expect(home.rows).toBe(3);
    expect(home.columns).toBe(5);
    // Only visible buttons on the active 5,3 layout (excludes hidden button and 3,3 layout button)
    expect(home.buttons).toHaveLength(2);

    const moreBtn = home.buttons.find((b) => b.label === 'more');
    expect(moreBtn).toMatchObject({ row: 0, column: 0, vocalization: 'more please' });

    const playNav = home.buttons.find((b) => b.label === 'Play');
    expect(playNav).toMatchObject({
      row: 2,
      column: 4,
      loadBoardName: 'Play Time',
    });

    const play = boardSet.boards[1];
    expect(play.name).toBe('Play Time');
    expect(play.rows).toBe(2);
    expect(play.columns).toBe(4);
    expect(play.buttons).toHaveLength(2);

    const blocksBtn = play.buttons.find((b) => b.label === 'blocks');
    expect(blocksBtn).toMatchObject({
      row: 1,
      column: 2,
      vocalization: 'build with blocks',
    });

    const backHome = play.buttons.find((b) => b.label === 'Back Home');
    expect(backHome).toMatchObject({
      row: 0,
      column: 0,
      loadBoardName: 'Core Home',
    });

    const snapshot = boardSetToSnapshot(boardSet, 'student-export.sps');
    expect(snapshot.pageCount).toBe(2);
    expect(snapshot.buttonCount).toBe(4);
    expect(snapshot.wordList).toEqual(['Back Home', 'blocks', 'more', 'Play']);
  });

  it('handles .spb backups and different TD Snap schema versions without hard-coding one schema', async () => {
    const spbBytes = await buildSyntheticTdSnapFixture({
      schemaVersion: '3.9',
      friendlyName: 'Older Schema Backup',
      omitOptionalSyncTables: true,
    });
    const boardSet = await parseAacFile('full-backup.spb', spbBytes);
    expect(boardSet.sourceSystem).toBe('TD Snap');
    expect(boardSet.vocabularyName).toBe('Older Schema Backup');
    expect(boardSet.boards).toHaveLength(2);
  });

  it('refuses non-SQLite, corrupt, or non-TD-Snap SQLite .sps files cleanly', async () => {
    // 1. Plain text disguised as .sps
    await expect(parseAacFile('broken.sps', strToU8('not sqlite'))).rejects.toThrow(
      ParserRefusalError
    );

    // 2. Valid SQLite database lacking TD Snap tables
    const SQL = await getSqlJs();
    const otherDb = new SQL.Database();
    otherDb.run('CREATE TABLE unrelated (id INTEGER PRIMARY KEY, note TEXT);');
    const unrelatedBytes = otherDb.export();
    otherDb.close();

    await expect(parseAacFile('wrong-db.sps', unrelatedBytes)).rejects.toThrow(
      /missing tables/i
    );
  });
});
