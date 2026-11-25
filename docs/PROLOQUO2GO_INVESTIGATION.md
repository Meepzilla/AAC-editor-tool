# Proloquo2Go (`.p2gbk` / `.p2g`) Format Investigation Notes

AAC Profile Manager currently **recognizes** Proloquo2Go full backups (`.p2gbk`) and partial exports (`.p2g`) on the Import screen, runs a read-only, privacy-safe structure check, and reports **"Proloquo2Go format is not mapped yet"** without guessing a parser or saving a partial snapshot.

No schema assumptions are made until verified against a disposable sample export.

---

## Privacy First: Use Disposable Stock Exports Only

Never use a real student's vocabulary or backup file for format investigation.

1. In Proloquo2Go on an iPad, create a **fresh stock test user** (for example, default Crescendo Intermediate Core without student-specific words or photos).
2. Export two small disposable samples:
   - A full backup (`.p2gbk`) unchanged.
   - Optionally, the same test user after adding **one** synthetic test button (for example, `zzqx test`) and **one** synthetic folder/page, or a single-folder partial export (`.p2g`).
3. Note the Proloquo2Go iOS app version and Crescendo template used.

---

## Safe Structural Inspection Procedure

Open the disposable sample in **AAC Profile Manager → Import File**.

The built-in `inspectContainerStructure()` routine (ported from the `tdsnap/formats.py` approach in `rjpenny16/AAC-Editor`) checks only:

- **Container type & magic bytes**: ZIP archive, SQLite 3 database, Apple binary property list (`bplist00`), XML plist, JSON, or unknown binary.
- **Encryption indicators**: ZIP encryption flag bit (`0x1`) per entry and Shannon entropy check (`> 7.5 bits/byte` on 16-byte-aligned payloads or `> 7.85 bits/byte`).
- **Generalized entry shapes**: Replaces non-structural file and folder stems with `*` (for example, `*.sqlite`, `*.plist`) so user or folder names never appear in the report.
- **SQLite schema only** (if any SQLite database is present): Table names, column names/types (`PRAGMA table_info`), and row counts (`COUNT(*)`). It **never** reads or prints button labels, messages, or student names.

Use **Copy Safe Structure Report** on the Import screen to copy the sanitized report for review.

---

## Questions to Answer Before Proposing `src/lib/parsers/proloquo2go.ts`

Fill in each row from a verified disposable sample:

| Investigation Question | Observed Finding (Pending Sample) |
|---|---|
| Proloquo2Go app version & iPadOS version | _TBD_ |
| `.p2gbk` container type (ZIP, directory bundle, SQLite, plist, encrypted?) | _TBD_ |
| `.p2g` container type (ZIP, plist, JSON, SQLite, encrypted?) | _TBD_ |
| Are any entries encrypted or obfuscated? | _TBD_ |
| Where are pages / folders defined? (table or plist/JSON keys) | _TBD_ |
| Where are grid dimensions (rows × columns) stored? | _TBD_ |
| Where are button labels, spoken messages, and cell positions stored? | _TBD_ |
| How are folder/page navigation links represented? | _TBD_ |
| How are hidden/inactive buttons flagged? | _TBD_ |
| How are licensed SymbolStix/custom image references separated so they can be ignored? | _TBD_ |

---

## Next Step Once a Sample Is Inspected

Once a disposable `.p2gbk` / `.p2g` structure report confirms the container is unencrypted and reveals its table or plist layout:

1. Document the confirmed schema in this file.
2. Propose a read-only parser in `src/lib/parsers/proloquo2go.ts` mapping pages, grid sizes, labels, messages, and links into the common Open Board Format (`ObfBoardSet`) model while ignoring all symbol artwork.
3. Add a synthetic fixture test in `src/lib/__tests__/proloquo2go-parser.test.ts` proving page count, grid size, labels, messages, and page links without using real student data.
