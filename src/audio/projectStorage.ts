import type {
  StudioRoutingConfig,
  TarekProject,
  TarekProjectSummary,
} from '../types/beatbox';
import {
  createDefaultBeatboxPianoRollState,
  createDefaultBeatboxState,
  makeKitTracks,
  normalizeBeatboxPianoRollState,
} from './beatboxPresets';
import { createDefaultDawState, normalizeDawState } from './dawPresets';
import { createDefaultProjectDeviceFx, normalizeProjectDeviceFx } from './fxCatalog';
import { createBasePatch, loadActivePatch } from './presets';
import { createDefaultPatterns, loadSequencerState } from './sequencerStorage';
import {
  createDefaultSubbassPatch,
  createDefaultSubbassSequencerState,
  normalizeSubbassPatch,
  normalizeSubbassSequencerState,
} from './subbassPresets';
import {
  createDefaultBassRemixProjectState,
  normalizeBassRemixProjectState,
} from './bassRemixPresets';
import {
  createCleanBassInit666,
  createDefaultTs666SequencerState,
  loadTs666ActivePatch,
  normalizeTs666Patch,
  normalizeTs666SequencerState,
} from './ts666/ts666Presets';
import { mirrorKeyToIndexedDb, removeKeyFromIndexedDb } from './tarekIndexedDb';

const TAREK_LEGACY_PROJECT_KEY = 'tarek_studio_project_v1';
const TAREK_PROJECTS_INDEX_KEY = 'tarek_projects_index_v2';
const TAREK_PROJECT_ITEM_PREFIX = 'tarek_project_item_v2_';
const TAREK_ACTIVE_PROJECT_ID_KEY = 'tarek_active_project_id_v2';

export const DEFAULT_ROUTING: StudioRoutingConfig = {
  masterVolume: 0.85,
  serumLevel: 1.0,
  beatboxLevel: 0.95,
  subbassLevel: 1.0,
  ts666Level: 1.0,
  bassremixLevel: 1.0,
  serumMuted: false,
  serumSolo: false,
  serumFxBypass: false,
  beatboxMuted: false,
  beatboxSolo: false,
  beatboxFxBypass: false,
  subbassMuted: false,
  subbassSolo: false,
  subbassFxBypass: false,
  ts666Muted: false,
  ts666Solo: false,
  ts666FxBypass: false,
  bassremixMuted: false,
  bassremixSolo: false,
  bassremixFxBypass: false,
  beatboxToSerumFx: false,
  sidechainAmount: 0.35,
  midiBeatboxToSerum: false,
  midiKeyboardToBeatbox: true,
};

export function generateProjectId(): string {
  return `proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function projectItemKey(id: string): string {
  return `${TAREK_PROJECT_ITEM_PREFIX}${id}`;
}

export function toProjectSummary(project: TarekProject): TarekProjectSummary {
  const now = Date.now();
  return {
    id: project.id,
    name: project.name,
    bpm: project.bpm,
    timeSignature: project.timeSignature,
    createdAt: project.createdAt ?? now,
    updatedAt: project.updatedAt ?? now,
  };
}

export function createFreshProject(
  customName = 'TAREK Studio Session',
  forcedId?: string
): TarekProject {
  const now = Date.now();
  const cleanName = customName.trim() || 'TAREK Studio Session';
  return {
    id: forcedId && forcedId.trim() ? forcedId.trim() : generateProjectId(),
    version: 1,
    name: cleanName,
    createdAt: now,
    updatedAt: now,
    bpm: 124,
    timeSignature: '4/4',
    metronomeEnabled: false,
    loop: true,
    routing: { ...DEFAULT_ROUTING },
    serumPatch: createBasePatch(),
    serumSequencer: {
      bpm: 124,
      activeBank: 'A',
      activeSlot: 1,
      loop: true,
      patterns: createDefaultPatterns(),
    },
    beatbox: createDefaultBeatboxState(),
    daw: createDefaultDawState(),
    subbass: createDefaultSubbassPatch(),
    subbassSequencer: createDefaultSubbassSequencerState(),
    ts666Patch: createCleanBassInit666(),
    ts666Sequencer: createDefaultTs666SequencerState(),
    bassRemix: createDefaultBassRemixProjectState(),
    deviceFx: createDefaultProjectDeviceFx(),
  };
}

export function createDefaultProject(): TarekProject {
  const initialSeq = loadSequencerState();
  const now = Date.now();
  return {
    id: generateProjectId(),
    version: 1,
    name: 'TAREK Studio Session',
    createdAt: now,
    updatedAt: now,
    bpm: initialSeq.bpm ?? 124,
    timeSignature: '4/4',
    metronomeEnabled: false,
    loop: initialSeq.loop ?? true,
    routing: { ...DEFAULT_ROUTING },
    serumPatch: loadActivePatch(),
    serumSequencer: initialSeq,
    beatbox: createDefaultBeatboxState(),
    daw: createDefaultDawState(),
    subbass: createDefaultSubbassPatch(),
    subbassSequencer: createDefaultSubbassSequencerState(),
    ts666Patch: loadTs666ActivePatch(),
    ts666Sequencer: createDefaultTs666SequencerState(),
    bassRemix: createDefaultBassRemixProjectState(),
    deviceFx: createDefaultProjectDeviceFx(),
  };
}

export function normalizeProject(
  raw: Partial<TarekProject>,
  options?: { freshDefaults?: boolean; forceNewId?: string }
): TarekProject {
  const defaults = options?.freshDefaults
    ? createFreshProject('TAREK Studio Session', options?.forceNewId)
    : createDefaultProject();
  const bpm =
    typeof raw.bpm === 'number'
      ? Math.max(40, Math.min(240, raw.bpm))
      : defaults.bpm;

  const serumSeq = raw.serumSequencer
    ? {
        ...defaults.serumSequencer,
        ...raw.serumSequencer,
        bpm,
        patterns: {
          ...createDefaultPatterns(),
          ...(raw.serumSequencer.patterns ?? {}),
        },
      }
    : { ...defaults.serumSequencer, bpm };

  const rawBb = raw.beatbox;
  const kitId = rawBb?.kitId ?? defaults.beatbox.kitId;
  const beatbox = {
    ...defaults.beatbox,
    ...rawBb,
    kitId,
    tracks: rawBb?.tracks
      ? { ...makeKitTracks(kitId), ...rawBb.tracks }
      : defaults.beatbox.tracks,
    patterns: rawBb?.patterns
      ? { ...defaults.beatbox.patterns, ...rawBb.patterns }
      : defaults.beatbox.patterns,
    pianoRoll: rawBb?.pianoRoll
      ? normalizeBeatboxPianoRollState(rawBb.pianoRoll)
      : createDefaultBeatboxPianoRollState(),
  };

  const now = Date.now();
  const resolvedId =
    options?.forceNewId && options.forceNewId.trim()
      ? options.forceNewId.trim()
      : typeof raw.id === 'string' && raw.id.trim()
      ? raw.id.trim()
      : defaults.id;

  return {
    id: resolvedId,
    version: 1,
    name:
      typeof raw.name === 'string' && raw.name.trim()
        ? raw.name.trim()
        : defaults.name,
    createdAt:
      typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt)
        ? raw.createdAt
        : now,
    updatedAt:
      typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt)
        ? raw.updatedAt
        : now,
    bpm,
    timeSignature: raw.timeSignature ?? '4/4',
    metronomeEnabled: Boolean(raw.metronomeEnabled),
    loop: typeof raw.loop === 'boolean' ? raw.loop : true,
    routing: { ...DEFAULT_ROUTING, ...(raw.routing ?? {}) },
    serumPatch: raw.serumPatch ? createBasePatch(raw.serumPatch) : defaults.serumPatch,
    serumSequencer: serumSeq,
    beatbox,
    daw: normalizeDawState(raw.daw),
    subbass: normalizeSubbassPatch(raw.subbass),
    subbassSequencer: normalizeSubbassSequencerState(raw.subbassSequencer),
    ts666Patch: raw.ts666Patch ? normalizeTs666Patch(raw.ts666Patch) : defaults.ts666Patch,
    ts666Sequencer: normalizeTs666SequencerState(raw.ts666Sequencer),
    bassRemix: normalizeBassRemixProjectState(raw.bassRemix),
    deviceFx: normalizeProjectDeviceFx(raw.deviceFx),
  };
}

function writeProjectsIndex(list: TarekProjectSummary[]): TarekProjectSummary[] {
  const sorted = [...list].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  const serialized = JSON.stringify(sorted);
  try {
    localStorage.setItem(TAREK_PROJECTS_INDEX_KEY, serialized);
  } catch {
    // ignore quota errors
  }
  void mirrorKeyToIndexedDb(TAREK_PROJECTS_INDEX_KEY, serialized);
  return sorted;
}

function readRawStoredProject(id: string): TarekProject | null {
  try {
    const raw = localStorage.getItem(projectItemKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TarekProject>;
    return normalizeProject(parsed, { freshDefaults: true, forceNewId: id });
  } catch {
    return null;
  }
}

export function listSavedProjects(): TarekProjectSummary[] {
  const byId = new Map<string, TarekProjectSummary>();

  try {
    const rawIndex = localStorage.getItem(TAREK_PROJECTS_INDEX_KEY);
    if (rawIndex) {
      const parsed = JSON.parse(rawIndex);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item.id === 'string' && item.id.trim()) {
            // Only list projects whose payload actually exists
            if (localStorage.getItem(projectItemKey(item.id)) !== null) {
              byId.set(item.id, {
                id: item.id,
                name:
                  typeof item.name === 'string' && item.name.trim()
                    ? item.name
                    : 'Untitled Project',
                bpm: typeof item.bpm === 'number' ? item.bpm : 124,
                timeSignature: item.timeSignature ?? '4/4',
                createdAt:
                  typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
                updatedAt:
                  typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
              });
            }
          }
        }
      }
    }

    // Reconcile any individual project keys present in localStorage that aren't in the index
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(TAREK_PROJECT_ITEM_PREFIX)) {
        const id = key.slice(TAREK_PROJECT_ITEM_PREFIX.length);
        if (id && !byId.has(id)) {
          const recovered = readRawStoredProject(id);
          if (recovered) {
            byId.set(id, toProjectSummary(recovered));
          }
        }
      }
    }
  } catch {
    // ignore storage errors
  }

  return Array.from(byId.values()).sort(
    (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
  );
}

export function generateUniqueProjectName(
  baseName: string,
  existing: TarekProjectSummary[]
): string {
  const cleanBase = baseName.trim() || 'TAREK Project';
  const taken = new Set(existing.map((p) => p.name.trim().toLowerCase()));
  if (!taken.has(cleanBase.toLowerCase())) {
    return cleanBase;
  }
  const stripped = cleanBase.replace(/\s+\d+$/, '').trim() || cleanBase;
  let n = 2;
  while (taken.has(`${stripped} ${n}`.toLowerCase())) {
    n++;
  }
  return `${stripped} ${n}`;
}

export function saveProjectSafe(
  project: TarekProject,
  options?: { setAsActive?: boolean; touchUpdatedAt?: boolean }
): TarekProjectSummary[] {
  const ensuredId =
    typeof project.id === 'string' && project.id.trim()
      ? project.id.trim()
      : generateProjectId();
  const stamp = options?.touchUpdatedAt === false ? project.updatedAt ?? Date.now() : Date.now();
  const record: TarekProject = {
    ...project,
    id: ensuredId,
    createdAt: project.createdAt ?? stamp,
    updatedAt: stamp,
  };

  const serialized = JSON.stringify(record);
  const itemKey = projectItemKey(ensuredId);
  try {
    // Write ONLY to this project's dedicated key — never overwrite any other project!
    localStorage.setItem(itemKey, serialized);
    if (options?.setAsActive !== false) {
      localStorage.setItem(TAREK_ACTIVE_PROJECT_ID_KEY, ensuredId);
    }
  } catch {
    // ignore storage quota errors
  }
  void mirrorKeyToIndexedDb(itemKey, serialized);
  if (options?.setAsActive !== false) {
    void mirrorKeyToIndexedDb(TAREK_ACTIVE_PROJECT_ID_KEY, ensuredId);
  }

  const existing = listSavedProjects().filter((p) => p.id !== ensuredId);
  return writeProjectsIndex([toProjectSummary(record), ...existing]);
}

export function loadProjectById(id: string): TarekProject | null {
  const loaded = readRawStoredProject(id);
  if (!loaded) return null;
  try {
    localStorage.setItem(TAREK_ACTIVE_PROJECT_ID_KEY, loaded.id);
  } catch {
    // ignore
  }
  void mirrorKeyToIndexedDb(TAREK_ACTIVE_PROJECT_ID_KEY, loaded.id);
  return loaded;
}

export function getSavedProjectSnapshot(id: string): TarekProject | null {
  return readRawStoredProject(id);
}

export function createAndSaveNewProject(customName?: string): {
  project: TarekProject;
  projects: TarekProjectSummary[];
} {
  const existing = listSavedProjects();
  const desiredBase =
    customName && customName.trim()
      ? customName.trim()
      : existing.length === 0
      ? 'TAREK Project 1'
      : `TAREK Project ${existing.length + 1}`;
  const uniqueName = generateUniqueProjectName(desiredBase, existing);
  const nextProject = createFreshProject(uniqueName);
  const projects = saveProjectSafe(nextProject, { setAsActive: true });
  return { project: nextProject, projects };
}

export function duplicateSavedProject(sourceId: string): {
  project: TarekProject;
  projects: TarekProjectSummary[];
} | null {
  const src = readRawStoredProject(sourceId);
  if (!src) return null;
  const existing = listSavedProjects();
  const copyName = generateUniqueProjectName(`${src.name} Copy`, existing);
  const now = Date.now();
  const cloned = normalizeProject(
    {
      ...src,
      name: copyName,
      createdAt: now,
      updatedAt: now,
    },
    { freshDefaults: true, forceNewId: generateProjectId() }
  );
  const projects = saveProjectSafe(cloned, { setAsActive: true });
  return { project: cloned, projects };
}

export function importProjectAsNew(raw: Partial<TarekProject>): {
  project: TarekProject;
  projects: TarekProjectSummary[];
} {
  const existing = listSavedProjects();
  const baseName =
    typeof raw.name === 'string' && raw.name.trim()
      ? raw.name.trim()
      : 'Imported Project';
  const uniqueName = generateUniqueProjectName(baseName, existing);
  const now = Date.now();
  const imported = normalizeProject(
    {
      ...raw,
      name: uniqueName,
      createdAt: now,
      updatedAt: now,
    },
    { freshDefaults: true, forceNewId: generateProjectId() }
  );
  const projects = saveProjectSafe(imported, { setAsActive: true });
  return { project: imported, projects };
}

export function renameSavedProject(
  id: string,
  newName: string
): { projects: TarekProjectSummary[]; cleanName: string } {
  const cleanName = newName.trim() || 'Untitled Project';
  const existing = readRawStoredProject(id);
  if (existing) {
    const updated: TarekProject = {
      ...existing,
      name: cleanName,
      updatedAt: Date.now(),
    };
    const updatedJson = JSON.stringify(updated);
    const updatedKey = projectItemKey(id);
    try {
      localStorage.setItem(updatedKey, updatedJson);
    } catch {
      // ignore
    }
    void mirrorKeyToIndexedDb(updatedKey, updatedJson);
    const index = listSavedProjects().map((s) =>
      s.id === id ? toProjectSummary(updated) : s
    );
    return { projects: writeProjectsIndex(index), cleanName };
  }
  const index = listSavedProjects().map((s) =>
    s.id === id ? { ...s, name: cleanName, updatedAt: Date.now() } : s
  );
  return { projects: writeProjectsIndex(index), cleanName };
}

export function deleteSavedProject(
  id: string,
  activeProjectId: string
): {
  projects: TarekProjectSummary[];
  nextActiveProject: TarekProject | null;
} {
  const removedKey = projectItemKey(id);
  try {
    localStorage.removeItem(removedKey);
  } catch {
    // ignore
  }
  void removeKeyFromIndexedDb(removedKey);

  const remaining = listSavedProjects().filter((p) => p.id !== id);
  const nextIndex = writeProjectsIndex(remaining);

  if (id !== activeProjectId) {
    return { projects: nextIndex, nextActiveProject: null };
  }

  if (nextIndex.length > 0) {
    const fallback = readRawStoredProject(nextIndex[0].id);
    if (fallback) {
      try {
        localStorage.setItem(TAREK_ACTIVE_PROJECT_ID_KEY, fallback.id);
      } catch {
        // ignore
      }
      void mirrorKeyToIndexedDb(TAREK_ACTIVE_PROJECT_ID_KEY, fallback.id);
      return { projects: nextIndex, nextActiveProject: fallback };
    }
  }

  // Last project deleted — create a clean starter project so workspace remains usable
  const starter = createFreshProject('TAREK Project 1');
  const updatedIndex = saveProjectSafe(starter, { setAsActive: true });
  return { projects: updatedIndex, nextActiveProject: starter };
}

export function loadInitialActiveProject(): {
  project: TarekProject;
  projects: TarekProjectSummary[];
} {
  const existing = listSavedProjects();

  if (existing.length === 0) {
    // Check one-time migration from legacy single-project storage key
    try {
      const legacyRaw = localStorage.getItem(TAREK_LEGACY_PROJECT_KEY);
      if (legacyRaw) {
        const parsed = JSON.parse(legacyRaw) as Partial<TarekProject>;
        const migrated = normalizeProject(parsed, {
          forceNewId: generateProjectId(),
        });
        const projects = saveProjectSafe(migrated, {
          setAsActive: true,
          touchUpdatedAt: false,
        });
        return { project: migrated, projects };
      }
    } catch {
      // ignore corrupted legacy entry
    }

    // Fresh first-time studio launch
    const initial = createDefaultProject();
    const projects = saveProjectSafe(initial, { setAsActive: true });
    return { project: initial, projects };
  }

  try {
    const activeId = localStorage.getItem(TAREK_ACTIVE_PROJECT_ID_KEY);
    if (activeId) {
      const loadedActive = readRawStoredProject(activeId);
      if (loadedActive) {
        return { project: loadedActive, projects: existing };
      }
    }
  } catch {
    // ignore
  }

  const first = readRawStoredProject(existing[0].id) ?? createFreshProject('TAREK Project 1');
  const projects = saveProjectSafe(first, { setAsActive: true, touchUpdatedAt: false });
  return { project: first, projects };
}

export function requestPersistentStorage(): void {
  try {
    const nav = navigator as Navigator & {
      storage?: { persist?: () => Promise<boolean> };
    };
    if (nav.storage && typeof nav.storage.persist === 'function') {
      void nav.storage.persist().catch(() => {});
    }
  } catch {
    // ignore
  }
}

export function loadTarekProject(): TarekProject {
  return loadInitialActiveProject().project;
}

export function saveTarekProject(project: TarekProject): void {
  saveProjectSafe(project, { setAsActive: true });
}
