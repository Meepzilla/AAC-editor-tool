import type {
  AacSystem,
  AccessMethod,
  CommunicativeFunction,
  Modality,
  StudentProfile,
} from './types';
import { generateId } from './utils';

export const CURRENT_SCHEMA_VERSION = 1;

export const AAC_SYSTEMS: readonly AacSystem[] = [
  'TouchChat',
  'LAMP Words for Life',
  'Proloquo2Go',
  'TD Snap',
  'Grid 3',
  'Other',
] as const;

export const ACCESS_METHODS: readonly AccessMethod[] = [
  'Direct touch',
  'Switch scanning',
  'Eye gaze',
  'Head tracking',
  'Partner assisted scanning',
  'Other',
] as const;

export const MODALITIES: readonly Modality[] = [
  'speech',
  'vocalizations',
  'gestures',
  'signs',
  'AAC device',
  'eye gaze',
  'body movement',
] as const;

export const COMMUNICATIVE_FUNCTIONS: readonly CommunicativeFunction[] = [
  'requesting',
  'protesting',
  'commenting',
  'asking',
  'answering',
  'social closeness',
  'directing attention',
  'other',
] as const;

export const INDEPENDENCE_LEVELS: readonly string[] = [
  'Emergent / Partner-supported',
  'Dependent with frequent prompting',
  'Context-dependent communicator',
  'Transitional / Growing independence',
  'Independent across familiar settings',
  'Independent across settings & partners',
] as const;

export function createEmptyProfile(overrides: Partial<StudentProfile> = {}): StudentProfile {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    displayName: '',
    fullName: '',
    showFullName: false,
    photoEnabled: false,
    photoDataUrl: undefined,
    school: '',
    classroom: '',
    teacher: '',
    aacSystem: 'TouchChat',
    vocabularyName: '',
    gridSize: '',
    accessMethod: 'Direct touch',
    accessNotes: '',
    motorNotes: '',
    visualNotes: '',
    modalities: ['AAC device'],
    communicativeFunctions: [],
    independenceLevel: '',
    navigationNotes: '',
    environmentalSupports: '',
    modelingNotes: '',
    modelingNotesLog: [],
    snapshots: [],
    reviewDate: '',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
