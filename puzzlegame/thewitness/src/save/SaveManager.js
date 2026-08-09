// Keep the legacy save key so existing browser progress survives the rename
// from "Insight" to "The Vision".
const SAVE_KEY = 'insight-save-v3';
const LEGACY_CHATGPT_RENUMBER_RESET_KEY = 'chatgpt-renumber-reset-2026-08-01';
const CODEX_COLLECTION_RENAME_KEY = 'codex-collection-rename-2026-08-02';
const STANDARD_COLLECTION_PROMOTION_KEY = 'standard-collection-promotion-2026-08-08';
const CODEX_COLLECTION_REMOVED_KEY = 'codex-collection-removed-2026-08-08';

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

  // The "claude" collection (claude-levels.json / claude_level_XXX ids) was promoted to be the
  // one standard collection (levels.json / level_XXX ids, collection key "standard") - carry
  // forward progress from both the collection-scoped era ("claude::claude_level_XXX") and the
  // even older pre-split era (a bare "claude_level_XXX", previously matched via a legacyId
  // fallback that no longer exists). The "codex" collection's own progress is handled by a
  // separate migration below, since it was removed outright rather than promoted.
  if (!next.migrations[STANDARD_COLLECTION_PROMOTION_KEY]) {
    next.completedPuzzles = (next.completedPuzzles || []).map((id) => {
      if (id.startsWith('claude::claude_level_')) {
        return `standard::level_${id.slice('claude::claude_level_'.length)}`;
      }
      if (id.startsWith('claude_level_')) {
        return `standard::${id.replace(/^claude_level_/, 'level_')}`;
      }
      return id;
    });

    const byCollection = { ...(next.currentLevelIndexByCollection || {}) };
    if (Number.isInteger(byCollection.claude) && !Number.isInteger(byCollection.standard)) {
      byCollection.standard = byCollection.claude;
    }
    delete byCollection.claude;
    next.currentLevelIndexByCollection = byCollection;

    next.migrations[STANDARD_COLLECTION_PROMOTION_KEY] = true;
  }

  // The "codex" collection was removed outright (codex-levels.json deleted, no longer loadable
  // anywhere, including the designer) rather than renamed or promoted - purge its now-meaningless
  // progress instead of letting it accumulate forever as dead data, mirroring how the old
  // "chatgpt" collection's progress was reset above when it was cut over to "codex".
  if (!next.migrations[CODEX_COLLECTION_REMOVED_KEY]) {
    next.completedPuzzles = (next.completedPuzzles || []).filter(
      (id) => !id.startsWith('codex::') && !id.startsWith('codex_level_')
    );
    const byCollection = { ...(next.currentLevelIndexByCollection || {}) };
    delete byCollection.codex;
    next.currentLevelIndexByCollection = byCollection;

    next.migrations[CODEX_COLLECTION_REMOVED_KEY] = true;
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
