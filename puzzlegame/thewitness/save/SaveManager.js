// Keep the legacy save key so existing browser progress survives the rename
// from "Insight" to "The Vision".
const SAVE_KEY = 'insight-save-v3';
const LEGACY_CHATGPT_RENUMBER_RESET_KEY = 'chatgpt-renumber-reset-2026-08-01';
const CODEX_COLLECTION_RENAME_KEY = 'codex-collection-rename-2026-08-02';

function defaultSave() {
  return {
    completedPuzzles: [],
    currentLevelIndex: 0,
    currentLevelIndexByCollection: {},
    migrations: {},
  };
}

function applyMigrations(save) {
  const next = { ...defaultSave(), ...save };
  next.migrations = { ...(next.migrations || {}) };

  if (!next.migrations[LEGACY_CHATGPT_RENUMBER_RESET_KEY]) {
    next.completedPuzzles = (next.completedPuzzles || []).filter(
      (id) => !id.startsWith('chatgpt::') && !id.startsWith('chatgpt_level_')
    );
    next.currentLevelIndexByCollection = {
      ...(next.currentLevelIndexByCollection || {}),
      chatgpt: 0,
    };
    next.migrations[LEGACY_CHATGPT_RENUMBER_RESET_KEY] = true;
  }

  // Preserve completed progress and current index when migrating the collection
  // name from the old "chatgpt" key/id scheme to the new "codex" one.
  if (!next.migrations[CODEX_COLLECTION_RENAME_KEY]) {
    next.completedPuzzles = (next.completedPuzzles || []).map((id) => {
      if (id.startsWith('chatgpt::')) {
        return `codex::${id.slice('chatgpt::'.length).replace(/^chatgpt_level_/, 'codex_level_')}`;
      }
      if (id.startsWith('chatgpt_level_')) {
        return id.replace(/^chatgpt_level_/, 'codex_level_');
      }
      return id;
    });

    const byCollection = { ...(next.currentLevelIndexByCollection || {}) };
    if (Number.isInteger(byCollection.chatgpt) && !Number.isInteger(byCollection.codex)) {
      byCollection.codex = byCollection.chatgpt;
    }
    delete byCollection.chatgpt;
    next.currentLevelIndexByCollection = byCollection;

    next.migrations[CODEX_COLLECTION_RENAME_KEY] = true;
  }

  return next;
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const migrated = applyMigrations(JSON.parse(raw));
    localStorage.setItem(SAVE_KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    return defaultSave();
  }
}

export function writeSave(save) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}

export function markCompleted(save, puzzleId) {
  if (!save.completedPuzzles.includes(puzzleId)) {
    save.completedPuzzles.push(puzzleId);
  }
  writeSave(save);
  return save;
}

export function getCurrentLevelIndex(save, collectionKey = 'default') {
  const byCollection = save.currentLevelIndexByCollection || {};
  if (Number.isInteger(byCollection[collectionKey])) {
    return byCollection[collectionKey];
  }
  return save.currentLevelIndex || 0;
}

export function setCurrentLevelIndex(save, index, collectionKey = 'default') {
  save.currentLevelIndex = index;
  if (!save.currentLevelIndexByCollection || typeof save.currentLevelIndexByCollection !== 'object') {
    save.currentLevelIndexByCollection = {};
  }
  save.currentLevelIndexByCollection[collectionKey] = index;
  writeSave(save);
  return save;
}
