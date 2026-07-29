const SAVE_KEY = 'insight-save-v3';

function defaultSave() {
  return {
    completedPuzzles: [],
    currentLevelIndex: 0,
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

export function getCurrentLevelIndex(save) {
  return save.currentLevelIndex || 0;
}

export function setCurrentLevelIndex(save, index) {
  save.currentLevelIndex = index;
  writeSave(save);
  return save;
}
