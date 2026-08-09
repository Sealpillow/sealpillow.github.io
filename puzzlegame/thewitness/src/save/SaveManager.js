// Keep the legacy save key so existing browser progress survives the rename
// from "Insight" to "The Vision".
const SAVE_KEY = 'insight-save-v3';
const LEGACY_COLLECTIONS_RESET_KEY = 'legacy-collections-reset-2026-08-10';

function defaultSave() {
  return {
    completedPuzzles: [],
    currentLevelIndex: 0,
    currentLevelIndexByCollection: {},
    migrations: {},
    solutionProgress: {},
  };
}

function sameSolutionPath(a, b) {
  return a.length === b.length && a.every(([col, row], i) => col === b[i][0] && row === b[i][1]);
}

function applyMigrations(save) {
  const next = { ...defaultSave(), ...save };
  next.migrations = { ...(next.migrations || {}) };

  // "standard" (levels.json / level_XXX ids) is the only collection that still exists - every
  // other prefix is a leftover id scheme from a collection since renamed or removed (chatgpt ->
  // codex -> removed, claude -> standard). Rather than keep growing a chain of one-time rename
  // migrations for collections nothing loads anymore, just drop anything that isn't "standard".
  if (!next.migrations[LEGACY_COLLECTIONS_RESET_KEY]) {
    next.completedPuzzles = (next.completedPuzzles || []).filter((id) => id.startsWith('standard::'));

    const byCollection = {};
    if (Number.isInteger(next.currentLevelIndexByCollection?.standard)) {
      byCollection.standard = next.currentLevelIndexByCollection.standard;
    }
    next.currentLevelIndexByCollection = byCollection;

    next.migrations[LEGACY_COLLECTIONS_RESET_KEY] = true;
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

// Levels with requiredSolutions > 1 need the player to submit several DISTINCT valid paths before
// counting as solved - this is where that per-level progress is remembered, so it survives a
// reload instead of resetting the moment the page refreshes.
export function getFoundSolutions(save, puzzleId) {
  return (save.solutionProgress && save.solutionProgress[puzzleId]) || [];
}

// Returns { save, isNew } - isNew is false when this exact path was already recorded for this
// puzzle, so callers can tell a genuinely new solution from a re-submitted one without needing
// their own copy of the path-equality check.
export function addFoundSolution(save, puzzleId, path) {
  if (!save.solutionProgress || typeof save.solutionProgress !== 'object') {
    save.solutionProgress = {};
  }
  const existing = save.solutionProgress[puzzleId] || [];
  if (existing.some((found) => sameSolutionPath(found, path))) {
    return { save, isNew: false };
  }
  save.solutionProgress[puzzleId] = [...existing, path];
  writeSave(save);
  return { save, isNew: true };
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
