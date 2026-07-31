const SAVE_KEY = 'insight-save-v3';

function defaultSave() {
  return {
    completedPuzzles: [],
    currentLevelIndex: 0,
    currentLevelIndexByCollection: {},
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    return { ...defaultSave(), ...JSON.parse(raw) };
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
