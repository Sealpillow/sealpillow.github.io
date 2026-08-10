const SAVE_KEY = 'puzzle-cabinet-save-v1';

function defaultSave() {
  return {
    completedLevels: [],
    unlockedByType: {},
  };
}

function normalizeSave(rawSave) {
  const save = { ...defaultSave(), ...rawSave };
  save.completedLevels = Array.isArray(save.completedLevels) ? save.completedLevels : [];
  save.unlockedByType = save.unlockedByType && typeof save.unlockedByType === 'object'
    ? save.unlockedByType
    : {};
  return save;
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    return normalizeSave(JSON.parse(raw));
  } catch {
    return defaultSave();
  }
}

export function writeSave(save) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}

export function markCompleted(save, levelId, type, typeIndex, typeTotal) {
  if (!save.completedLevels.includes(levelId)) {
    save.completedLevels.push(levelId);
  }
  const currentUnlocked = save.unlockedByType[type] ?? 0;
  save.unlockedByType[type] = Math.min(Math.max(currentUnlocked, typeIndex + 1), typeTotal - 1);
  writeSave(save);
  return save;
}

export function isUnlocked(save, type, typeIndex) {
  const unlockedIndex = save.unlockedByType[type] ?? 0;
  return typeIndex <= unlockedIndex;
}

export function isCompleted(save, levelId) {
  return save.completedLevels.includes(levelId);
}
