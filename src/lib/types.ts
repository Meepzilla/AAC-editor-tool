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

export interface VocabButton {
  id: string;
  row: number;
  column: number;
  label: string;
  message: string;
  linkTargetPageName?: string;
  linkTargetPageId?: string;
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
