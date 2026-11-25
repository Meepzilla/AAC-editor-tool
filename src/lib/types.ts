export type AacSystem =
  | 'TouchChat'
  | 'LAMP Words for Life'
  | 'Proloquo2Go'
  | 'TD Snap'
  | 'Grid 3'
  | 'Other';

export type AccessMethod =
  | 'Direct touch'
  | 'Switch scanning'
  | 'Eye gaze'
  | 'Head tracking'
  | 'Partner assisted scanning'
  | 'Other';

export type Modality =
  | 'speech'
  | 'vocalizations'
  | 'gestures'
  | 'signs'
  | 'AAC device'
  | 'eye gaze'
  | 'body movement';

export type CommunicativeFunction =
  | 'requesting'
  | 'protesting'
  | 'commenting'
  | 'asking'
  | 'answering'
  | 'social closeness'
  | 'directing attention'
  | 'other';

export interface ModelingNote {
  id: string;
  /** Calendar date in YYYY-MM-DD local format. */
  date: string;
  text: string;
  createdAt: string;
}

/**
 * Deduplicated symbol/photo image extracted from an AAC export file
 * (for example `Images.c4s` in TouchChat/LAMP `.ce` or `PageSetData` in TD Snap `.sps`).
 */
export interface VocabSymbolAsset {
  id: string;
  dataUrl: string;
  mimeType: string;
  width?: number;
  height?: number;
}

/**
 * Reference to a built-in app symbol library (e.g. SymbolStix or PCS) whose artwork
 * lives inside the AAC app on the iPad rather than inside the exported vocabulary file.
 */
export interface SymbolLibraryRef {
  library: string;
  id: string;
}

export interface VocabButton {
  id: string;
  row: number;
  column: number;
  /** Number of rows spanned by this button (defaults to 1). */
  rowSpan?: number;
  /** Number of columns spanned by this button (defaults to 1). */
  colSpan?: number;
  label: string;
  message: string;
  linkTargetPageName?: string;
  linkTargetPageId?: string;
  /** Points to an extracted image in `VocabSnapshot.symbols[symbolImageId]`. */
  symbolImageId?: string;
  /** Present when the button uses a built-in app symbol library referenced by ID. */
  symbolLibraryRef?: SymbolLibraryRef;
  /** Hex color `#RRGGBB` extracted from button style when present. */
  backgroundColor?: string;
  /** Hex color `#RRGGBB` extracted from button border style when present. */
  borderColor?: string;
  /** Hex color `#RRGGBB` extracted from button text style when present. */
  textColor?: string;
}

export interface VocabPage {
  id: string;
  name: string;
  rows: number;
  columns: number;
  buttons: VocabButton[];
}

export interface VocabSnapshot {
  id: string;
  importedAt: string;
  sourceSystem: AacSystem;
  sourceFileName: string;
  vocabularyName: string;
  /** Main grid size formatted as "rows x columns" (e.g. "6 x 10"). */
  gridSize: string;
  pageCount: number;
  buttonCount: number;
  /** Unique button labels across the snapshot, sorted. */
  wordList: string[];
  pages: VocabPage[];
  /** Deduplicated embedded symbol/image assets referenced by `VocabButton.symbolImageId`. */
  symbols?: Record<string, VocabSymbolAsset>;
  notes: string;
}

export interface StudentProfile {
  id: string;
  schemaVersion: number;
  /** Initials by default (e.g. "A.B."); full name is optional per profile. */
  displayName: string;
  /** Optional full name, shown only when showFullName is enabled on this profile. */
  fullName?: string;
  showFullName: boolean;
  /** Photo field exists but is off by default and explicitly opt-in. */
  photoEnabled: boolean;
  photoDataUrl?: string;
  school: string;
  classroom: string;
  teacher: string;
  aacSystem: AacSystem;
  vocabularyName: string;
  /** Rows x columns of the main page set (e.g. "6 x 10"). */
  gridSize: string;
  accessMethod: AccessMethod;
  accessNotes: string;
  motorNotes: string;
  visualNotes: string;
  modalities: Modality[];
  communicativeFunctions: CommunicativeFunction[];
  independenceLevel: string;
  navigationNotes: string;
  environmentalSupports: string;
  modelingNotes: string;
  modelingNotesLog: ModelingNote[];
  snapshots: VocabSnapshot[];
  /** Scheduled review date in YYYY-MM-DD format (empty string if unset). */
  reviewDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface BackupBundle {
  app: 'AAC Profile Manager';
  formatVersion: number;
  exportedAt: string;
  profileCount: number;
  profiles: StudentProfile[];
}
