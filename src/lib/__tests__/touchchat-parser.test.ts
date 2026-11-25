import { zipSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { boardSetToSnapshot, parseAacFile, ParserRefusalError } from '../parsers';
import { getSqlJs } from '../parsers/sqlite-loader';

/**
 * Builds a small synthetic Saltillo .ce ZIP fixture in memory following the documented
 * .c4v schema (resources, pages, button_boxes, button_box_instances, button_box_cells,
 * buttons, button_sets, button_set_modifiers, actions, action_data, variables) plus a
 * dummy Images.c4s file to confirm symbol/image blobs are ignored.
 */
async function buildSyntheticCeFixture(options: {
  vocabName: string;
  c4vFileName?: string;
}): Promise<Uint8Array> {
  const SQL = await getSqlJs();
  const db = new SQL.Database();

  db.run(`
    CREATE TABLE variables (name TEXT, value TEXT);
    CREATE TABLE resources (id INTEGER PRIMARY KEY, rid TEXT, name TEXT, type INTEGER);
    CREATE TABLE pages (id INTEGER PRIMARY KEY, resource_id INTEGER, name TEXT);
    CREATE TABLE button_boxes (id INTEGER PRIMARY KEY, resource_id INTEGER, layout_x INTEGER, layout_y INTEGER);
    CREATE TABLE button_box_instances (id INTEGER PRIMARY KEY, page_id INTEGER, button_box_id INTEGER);
    CREATE TABLE button_box_cells (id INTEGER PRIMARY KEY, button_box_id INTEGER, resource_id INTEGER, location INTEGER, span_x INTEGER, span_y INTEGER);
    CREATE TABLE buttons (id INTEGER PRIMARY KEY, resource_id INTEGER, label TEXT, message TEXT, symbol_link_id INTEGER, visible INTEGER, pronunciation TEXT);
    CREATE TABLE button_sets (id INTEGER PRIMARY KEY, resource_id INTEGER);
    CREATE TABLE button_set_modifiers (id INTEGER PRIMARY KEY, button_set_id INTEGER, button_id INTEGER, modifier INTEGER);
    CREATE TABLE actions (id INTEGER PRIMARY KEY, resource_id INTEGER, rank INTEGER, code INTEGER);
    CREATE TABLE action_data (id INTEGER PRIMARY KEY, action_id INTEGER, key INTEGER, value TEXT);
  `);

  const HOME_RID = '{11111111-1111-1111-1111-111111111111}';
  const SNACKS_RID = '{22222222-2222-2222-2222-222222222222}';

  db.run(`INSERT INTO variables (name, value) VALUES ('Name', ?), ('HomePage', ?)`, [
    options.vocabName,
    HOME_RID,
  ]);

  // Resources:
  // type 7 = page, type 6 = button box, type 4 = button, type 5 = button set
  db.run(`
    INSERT INTO resources (id, rid, name, type) VALUES
      (1, '${HOME_RID}', 'Home', 7),
      (2, '${SNACKS_RID}', 'Snacks', 7),
      (10, '{BOX-HOME}', 'HomeBox', 6),
      (11, '{BOX-SNACKS}', 'SnacksBox', 6),
      (20, '{BTN-WANT}', 'want', 4),
      (21, '{BTN-SNACKS}', 'snacks', 4),
      (22, '{BTN-EAT-BASE}', 'eat', 4),
      (23, '{BTN-EAT-ING}', 'eating', 4),
      (24, '{SET-EAT}', 'eat-set', 5),
      (25, '{BTN-APPLE}', 'apple', 4),
      (26, '{BTN-HOME}', 'go home', 4),
      (27, '{BTN-HIDDEN}', 'secret hidden', 4);
  `);

  db.run(`
    INSERT INTO pages (id, resource_id, name) VALUES
      (1, 1, 'Home'),
      (2, 2, 'Snacks');
  `);

  // Home: layout_x=4 columns, layout_y=3 rows -> "3 x 4"
  // Snacks: layout_x=3 columns, layout_y=2 rows -> "2 x 3"
  db.run(`
    INSERT INTO button_boxes (id, resource_id, layout_x, layout_y) VALUES
      (1, 10, 4, 3),
      (2, 11, 3, 2);
  `);

  db.run(`
    INSERT INTO button_box_instances (id, page_id, button_box_id) VALUES
      (1, 1, 1),
      (2, 2, 2);
  `);

  db.run(`
    INSERT INTO buttons (id, resource_id, label, message, symbol_link_id, visible, pronunciation) VALUES
      (100, 20, 'want', 'I want ', 14, 1, NULL),
      (101, 21, 'SNACKS', 'snacks', 14, 1, NULL),
      (102, 22, 'eat', 'eat ', 14, 1, NULL),
      (103, 23, 'eating', 'eating ', 14, 1, NULL),
      (104, 25, 'apple', 'red apple please', 145, 1, NULL),
      (105, 26, 'HOME', '', 14, 1, NULL),
      (106, 27, 'hidden button', 'should not appear', 0, 0, NULL);
  `);

  // Button set (resource_id 24) points via modifier 0 to buttons.id = 102 ("eat")
  db.run(`INSERT INTO button_sets (id, resource_id) VALUES (50, 24);`);
  db.run(`
    INSERT INTO button_set_modifiers (id, button_set_id, button_id, modifier) VALUES
      (1, 50, 102, 0),
      (2, 50, 103, 1);
  `);

  // Place buttons in cells (location = row * layout_x + col)
  // Home (4 cols x 3 rows):
  //   loc 0 (r0,c0) -> resource 20 ('want')
  //   loc 1 (r0,c1) -> resource 24 (button set -> 'eat')
  //   loc 5 (r1,c1) -> resource 21 ('SNACKS', navigates to Snacks via code 9)
  //   loc 6 (r1,c2) -> resource 27 (hidden -> must be excluded)
  // Snacks (3 cols x 2 rows):
  //   loc 0 (r0,c0) -> resource 25 ('apple')
  //   loc 5 (r1,c2) -> resource 26 ('HOME', navigates to Home via code 8)
  db.run(`
    INSERT INTO button_box_cells (id, button_box_id, resource_id, location, span_x, span_y) VALUES
      (1, 1, 20, 0, 1, 1),
      (2, 1, 24, 1, 1, 1),
      (3, 1, 21, 5, 1, 1),
      (4, 1, 27, 6, 1, 1),
      (5, 2, 25, 0, 1, 1),
      (6, 2, 26, 5, 1, 1);
  `);

  // Navigation actions: code 9 on SNACKS button -> SNACKS_RID, code 8 on HOME button -> HOME_RID
  db.run(`
    INSERT INTO actions (id, resource_id, rank, code) VALUES
      (1, 21, 0, 9),
      (2, 26, 0, 8),
      (3, 20, 0, 10);
  `);
  db.run(`
    INSERT INTO action_data (id, action_id, key, value) VALUES
      (1, 1, 0, '${SNACKS_RID}'),
      (2, 2, 0, '${HOME_RID}');
  `);

  const c4vBytes = db.export();
  db.close();

  return zipSync({
    [options.c4vFileName ?? 'SyntheticVocab.c4v']: c4vBytes,
    'Images.c4s': strToU8('dummy-image-store-ignored'),
    'version.txt': strToU8('5'),
  });
}

describe('TouchChat and LAMP Words for Life (.ce) parser', () => {
  it('extracts vocabulary name, page count, grid sizes, labels, messages, button sets, and page links', async () => {
    const fixtureBytes = await buildSyntheticCeFixture({
      vocabName: 'WordPower 60 Synthetic',
      c4vFileName: 'RenamedExport.c4v',
    });

    const boardSet = await parseAacFile('export-2026.ce', fixtureBytes);
    expect(boardSet.format).toBe('open-board-0.1');
    expect(boardSet.sourceSystem).toBe('TouchChat');
    // Vocabulary name comes from variables.Name, NOT the filename!
    expect(boardSet.vocabularyName).toBe('WordPower 60 Synthetic');
    expect(boardSet.mainGridSize).toBe('3 x 4');
    expect(boardSet.boards).toHaveLength(2);

    const home = boardSet.boards[0];
    expect(home.name).toBe('Home');
    expect(home.rows).toBe(3);
    expect(home.columns).toBe(4);
    expect(home.buttons).toHaveLength(3); // hidden button excluded

    const wantBtn = home.buttons.find((b) => b.label === 'want');
    expect(wantBtn).toMatchObject({ row: 0, column: 0, vocalization: 'I want' });

    const eatBtn = home.buttons.find((b) => b.label === 'eat');
    expect(eatBtn).toMatchObject({ row: 0, column: 1 });

    const snacksNav = home.buttons.find((b) => b.label === 'SNACKS');
    expect(snacksNav).toMatchObject({
      row: 1,
      column: 1,
      loadBoardName: 'Snacks',
    });

    const snacks = boardSet.boards[1];
    expect(snacks.name).toBe('Snacks');
    expect(snacks.rows).toBe(2);
    expect(snacks.columns).toBe(3);
    expect(snacks.buttons).toHaveLength(2);

    const appleBtn = snacks.buttons.find((b) => b.label === 'apple');
    expect(appleBtn).toMatchObject({
      row: 0,
      column: 0,
      vocalization: 'red apple please',
    });

    const homeNav = snacks.buttons.find((b) => b.label === 'HOME');
    expect(homeNav).toMatchObject({
      row: 1,
      column: 2,
      loadBoardName: 'Home',
    });

    const snapshot = boardSetToSnapshot(boardSet, 'export-2026.ce', 'Baseline');
    expect(snapshot.pageCount).toBe(2);
    expect(snapshot.buttonCount).toBe(5);
    expect(snapshot.wordList).toEqual(['apple', 'eat', 'HOME', 'SNACKS', 'want']);
    expect(snapshot.gridSize).toBe('3 x 4');
  });

  it('identifies LAMP Words for Life when the vocabulary name belongs to LAMP', async () => {
    const fixtureBytes = await buildSyntheticCeFixture({
      vocabName: 'LAMP Words for Life Full Synthetic',
    });
    const boardSet = await parseAacFile('lamp-export.ce', fixtureBytes);
    expect(boardSet.sourceSystem).toBe('LAMP Words for Life');
  });

  it('refuses a corrupt, non-ZIP, missing-.c4v, or encrypted-looking .ce file cleanly', async () => {
    // 1. Not a ZIP file
    await expect(parseAacFile('bad.ce', strToU8('not a zip at all'))).rejects.toThrow(
      ParserRefusalError
    );

    // 2. ZIP missing .c4v database
    const noC4vZip = zipSync({ 'version.txt': strToU8('5') });
    await expect(parseAacFile('empty.ce', noC4vZip)).rejects.toThrow(/does not contain a Saltillo \.c4v/i);

    // 3. High-entropy encrypted-looking payload inside .c4v
    const highEntropy = new Uint8Array(1024);
    for (let i = 0; i < highEntropy.length; i++) {
      highEntropy[i] = (i * 73 + 19) & 0xff;
    }
    const encryptedZip = zipSync({ 'Locked.c4v': highEntropy });
    await expect(parseAacFile('locked.ce', encryptedZip)).rejects.toThrow(/encrypted/i);
  });
});
