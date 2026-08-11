import {
  PUZZLES,
  createCustomMemoryPuzzle,
  createCustomTogglePuzzle,
  createCustomRotationPuzzle,
  createCustomMirrorPuzzle,
  createCustomNumberTracePuzzle,
  createCustomChimpPuzzle,
} from './src/puzzles/manifest.js';
import { createPuzzleController } from './src/puzzles/registry.js';
import { loadSave, markCompleted, isCompleted } from './src/save/SaveManager.js';

const TYPE_META = {
  'memory-sequence': {
    label: 'Memory Sequence',
    blurb: 'Watch, remember, and replay growing signal patterns.',
  },
  'chimp-test': {
    label: 'Chimpanzee Test',
    blurb: 'Memorize visible numbers, then finish them in order after they disappear.',
  },
  'number-trace': {
    label: 'Number Trace',
    blurb: 'Study numbered positions, then trace them back in ascending order after they disappear.',
  },
  'rotation-path': {
    label: 'Rotation Path',
    blurb: 'Turn lock pieces until one clean route connects the entry and exit.',
  },
  'toggle-switches': {
    label: 'Toggle Switches',
    blurb: 'Flip a network of switches until the whole board settles into the winning state.',
  },
  'mirror-reflection': {
    label: 'Mirror Reflection',
    blurb: 'Rotate mirrors and bend a beam toward the target crystal.',
  },
};

const EXTERNAL_CABINETS = [
  {
    type: 'witness-standalone',
    label: 'The Witness',
    blurb: 'Open the standalone Witness puzzle app in its own project.',
    kicker: 'Standalone App',
    progressText: 'Launch separately',
    launchHref: 'file:///C:/Users/luata/Desktop/PuzzleGame/thewitness/index.html',
    external: true,
  },
];

const levelSubtitleEl = document.getElementById('level-subtitle');
const puzzleHintEl = document.getElementById('puzzle-hint');
const puzzleTypeEl = document.getElementById('puzzle-type');
const puzzleStatusEl = document.getElementById('puzzle-status');
const boardWrap = document.getElementById('board-wrap');
const boardContainer = document.getElementById('board-container');
const selectionScreen = document.getElementById('selection-screen');
const typeGridEl = document.getElementById('type-grid');
const typePagerEl = document.getElementById('type-pager');
const typePagerLabelEl = document.getElementById('type-pager-label');
const typePagerPrevBtn = document.getElementById('type-pager-prev');
const typePagerNextBtn = document.getElementById('type-pager-next');
const customPuzzleHeroBtn = document.getElementById('custom-puzzle-hero-btn');
const customToggleOverlay = document.getElementById('custom-toggle-overlay');
const customRotationOverlay = document.getElementById('custom-rotation-overlay');
const customMemoryOverlay = document.getElementById('custom-memory-overlay');
const customMirrorOverlay = document.getElementById('custom-mirror-overlay');
const customTraceOverlay = document.getElementById('custom-trace-overlay');
const customChimpOverlay = document.getElementById('custom-chimp-overlay');
const customToggleColsEl = document.getElementById('custom-toggle-cols');
const customToggleRowsEl = document.getElementById('custom-toggle-rows');
const customRotationColsEl = document.getElementById('custom-rotation-cols');
const customRotationRowsEl = document.getElementById('custom-rotation-rows');
const customMemoryColsEl = document.getElementById('custom-memory-cols');
const customMemoryRowsEl = document.getElementById('custom-memory-rows');
const customMemoryRoundsEl = document.getElementById('custom-memory-rounds');
const customMemoryRegenerateOnMissEl = document.getElementById('custom-memory-regenerate-on-miss');
const customMirrorColsEl = document.getElementById('custom-mirror-cols');
const customMirrorRowsEl = document.getElementById('custom-mirror-rows');
const customTraceColsEl = document.getElementById('custom-trace-cols');
const customTraceRowsEl = document.getElementById('custom-trace-rows');
const customTraceCountEl = document.getElementById('custom-trace-count');
const customTracePreviewEl = document.getElementById('custom-trace-preview');
const customTraceRoundsEl = document.getElementById('custom-trace-rounds');
const customTraceRegenerateOnMissEl = document.getElementById('custom-trace-regenerate-on-miss');
const customChimpColsEl = document.getElementById('custom-chimp-cols');
const customChimpRowsEl = document.getElementById('custom-chimp-rows');
const customChimpCountEl = document.getElementById('custom-chimp-count');
const customChimpRoundsEl = document.getElementById('custom-chimp-rounds');
const customChimpRegenerateOnMissEl = document.getElementById('custom-chimp-regenerate-on-miss');
const customToggleCancelBtn = document.getElementById('custom-toggle-cancel-btn');
const customToggleLaunchBtn = document.getElementById('custom-toggle-launch-btn');
const customRotationCancelBtn = document.getElementById('custom-rotation-cancel-btn');
const customRotationLaunchBtn = document.getElementById('custom-rotation-launch-btn');
const customMemoryCancelBtn = document.getElementById('custom-memory-cancel-btn');
const customMemoryLaunchBtn = document.getElementById('custom-memory-launch-btn');
const customMirrorCancelBtn = document.getElementById('custom-mirror-cancel-btn');
const customMirrorLaunchBtn = document.getElementById('custom-mirror-launch-btn');
const customTraceCancelBtn = document.getElementById('custom-trace-cancel-btn');
const customTraceLaunchBtn = document.getElementById('custom-trace-launch-btn');
const customChimpCancelBtn = document.getElementById('custom-chimp-cancel-btn');
const customChimpLaunchBtn = document.getElementById('custom-chimp-launch-btn');
const browseBtn = document.getElementById('browse-btn');
const lowerPanelEl = document.querySelector('.lower-panel');
const lowerRestartBtn = document.getElementById('lower-restart-btn');
const lowerNextBtn = document.getElementById('lower-next-btn');
const puzzleNavEl = document.getElementById('puzzle-nav');
const pagerLabelEl = document.getElementById('pager-label');
const pagerPrevBtn = document.getElementById('pager-prev');
const pagerNextBtn = document.getElementById('pager-next');
const NAV_PAGE_SIZE = 10;
const TYPE_PAGE_SIZE = 4;

const internalPuzzleTypes = Object.keys(TYPE_META).map((type) => {
  const entries = PUZZLES
    .map((puzzle, globalIndex) => ({ puzzle, globalIndex }))
    .filter((entry) => entry.puzzle.type === type)
    .map((entry, typeIndex) => ({ ...entry, type, typeIndex }));
  return {
    type,
    ...TYPE_META[type],
    puzzles: entries,
    external: false,
  };
});

const externalPuzzleTypes = EXTERNAL_CABINETS.map((entry) => ({
  ...entry,
  puzzles: [],
}));

const puzzleTypeByKey = new Map([
  ...internalPuzzleTypes.map((entry) => [entry.type, entry]),
  ...externalPuzzleTypes.map((entry) => [entry.type, entry]),
]);

const PUZZLE_TYPE_ORDER = [
  'memory-sequence',
  'chimp-test',
  'number-trace',
  'witness-standalone',
  'rotation-path',
  'toggle-switches',
  'mirror-reflection',
];

const puzzleTypes = PUZZLE_TYPE_ORDER
  .map((type) => puzzleTypeByKey.get(type))
  .filter(Boolean);

const puzzleByGlobalIndex = PUZZLES.map((puzzle, globalIndex) => {
  const typeEntry = puzzleTypes.find((entry) => entry.type === puzzle.type);
  const typePuzzle = typeEntry.puzzles.find((entry) => entry.globalIndex === globalIndex);
  return {
    puzzle,
    globalIndex,
    type: puzzle.type,
    typeIndex: typePuzzle.typeIndex,
    typeTotal: typeEntry.puzzles.length,
  };
});

let save = loadSave();
let controller = null;
let currentGlobalIndex = -1;
let currentType = null;
let debugMode = false;
let navPage = 0;
let typePage = 0;
let customPuzzle = null;

function puzzleLabel(type) {
  return TYPE_META[type]?.label ?? type;
}

function setStatus(message = '', tone = 'default') {
  puzzleStatusEl.textContent = message;
  puzzleStatusEl.title = message;
  puzzleStatusEl.setAttribute('aria-label', message);
  puzzleStatusEl.classList.toggle('is-success', tone === 'success');
}

function currentTypeEntry() {
  return puzzleTypes.find((entry) => entry.type === currentType) ?? null;
}

function currentPuzzleEntry() {
  return currentGlobalIndex >= 0 ? puzzleByGlobalIndex[currentGlobalIndex] : null;
}

function currentPuzzle() {
  return currentGlobalIndex >= 0 ? currentPuzzleEntry()?.puzzle ?? null : customPuzzle;
}

function nextPuzzleEntry() {
  const typeEntry = currentTypeEntry();
  const entry = currentPuzzleEntry();
  if (!typeEntry || !entry) return null;
  return typeEntry.puzzles.find((item) => item.typeIndex === entry.typeIndex + 1) ?? null;
}

function highestCompletedTypeIndex(type) {
  const typeEntry = puzzleTypes.find((entry) => entry.type === type);
  if (!typeEntry || typeEntry.external || typeEntry.puzzles.length === 0) return -1;

  let highestCompleted = -1;
  for (const entry of typeEntry.puzzles) {
    if (isCompleted(save, entry.puzzle.id)) {
      highestCompleted = Math.max(highestCompleted, entry.typeIndex);
    }
  }
  return highestCompleted;
}

function highestReachableTypeIndex(type) {
  const typeEntry = puzzleTypes.find((entry) => entry.type === type);
  if (!typeEntry || typeEntry.external || typeEntry.puzzles.length === 0) return -1;
  if (debugMode) return typeEntry.puzzles.length - 1;
  const savedUnlocked = save.unlockedByType?.[type] ?? 0;
  const highestReached = Math.max(savedUnlocked, highestCompletedTypeIndex(type) + 1, 0);
  return Math.min(highestReached, typeEntry.puzzles.length - 1);
}

function canAdvanceToNextPuzzle() {
  const entry = nextPuzzleEntry();
  return Boolean(entry && puzzleIsUnlocked(entry));
}

function customPuzzleHeroVisible() {
  const meta = TYPE_META[currentType];
  return selectionScreen.hidden && Boolean(meta) && meta.supportsCustom !== false;
}

function puzzleIsUnlocked(entry) {
  if (!entry) return false;
  const type = entry.type ?? entry.puzzle?.type;
  return debugMode || isCompleted(save, entry.puzzle.id) || entry.typeIndex <= highestReachableTypeIndex(type);
}

function launchExternalCabinet(entry) {
  if (!entry?.launchHref) return;
  window.location.href = entry.launchHref;
}

function updateHeaderForSelection() {
  levelSubtitleEl.textContent = 'Select a puzzle type';
  puzzleHintEl.textContent = 'Each puzzle type opens straight into its own level collection.';
  puzzleTypeEl.textContent = 'Selection Screen';
  setStatus('Choose a cabinet.');
}

function updateHeaderForPuzzle(entry) {
  levelSubtitleEl.textContent = `${puzzleLabel(entry.type)} - Level ${entry.typeIndex + 1}`;
  puzzleHintEl.textContent = entry.puzzle.instructions;
  puzzleTypeEl.textContent = entry.puzzle.title;
  setStatus(entry.puzzle.statusText ?? '');
}

function updateHeaderForCustomPuzzle(puzzle) {
  levelSubtitleEl.textContent = `${puzzleLabel(puzzle.type)} - Custom`;
  puzzleHintEl.textContent = puzzle.instructions;
  puzzleTypeEl.textContent = puzzle.title;
  setStatus(puzzle.statusText ?? '');
}

function syncPuzzleUi() {
  if (selectionScreen.hidden === false) {
    updateHeaderForSelection();
  } else if (currentGlobalIndex >= 0 && currentPuzzleEntry()) {
    updateHeaderForPuzzle(currentPuzzleEntry());
  } else if (customPuzzle) {
    updateHeaderForCustomPuzzle(customPuzzle);
  }
  renderPuzzleNav();
  renderCustomPuzzleHeroButton();
  updateLowerPanelActions();
}

function renderPuzzleNav() {
  const typeEntry = currentTypeEntry();
  if (!typeEntry || selectionScreen.hidden === false || currentGlobalIndex < 0) {
    puzzleNavEl.replaceChildren();
    pagerLabelEl.textContent = '';
    pagerPrevBtn.disabled = true;
    pagerNextBtn.disabled = true;
    return;
  }

  renderPuzzleNavPage(Math.floor((currentPuzzleEntry()?.typeIndex ?? 0) / NAV_PAGE_SIZE));
}

function renderPuzzleNavPage(page) {
  const typeEntry = currentTypeEntry();
  if (!typeEntry) return;

  const total = typeEntry.puzzles.length;
  const totalPages = Math.max(1, Math.ceil(total / NAV_PAGE_SIZE));
  navPage = Math.max(0, Math.min(page, totalPages - 1));
  const startIndex = navPage * NAV_PAGE_SIZE;
  const visibleEntries = typeEntry.puzzles.slice(startIndex, startIndex + NAV_PAGE_SIZE);

  puzzleNavEl.style.setProperty('--nav-columns', String(Math.min(visibleEntries.length, 5)));
  puzzleNavEl.replaceChildren();

  for (const entry of visibleEntries) {
    const unlocked = puzzleIsUnlocked(entry);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nav-dot';
    btn.textContent = String(entry.typeIndex + 1);
    btn.title = entry.puzzle.title;
    if (entry.globalIndex === currentGlobalIndex) btn.classList.add('current');
    if (isCompleted(save, entry.puzzle.id)) btn.classList.add('completed');
    if (!unlocked) {
      btn.disabled = true;
      btn.title = 'Solve the previous level in this collection to unlock it';
    } else {
      btn.addEventListener('click', () => openPuzzle(entry.globalIndex));
    }
    puzzleNavEl.appendChild(btn);
  }

  pagerLabelEl.textContent = `${typeEntry.label} ${startIndex + 1}-${startIndex + visibleEntries.length}`;
  pagerPrevBtn.disabled = navPage === 0;
  pagerNextBtn.disabled = navPage >= totalPages - 1;
}

function renderCustomPuzzleHeroButton() {
  const visible = customPuzzleHeroVisible();
  customPuzzleHeroBtn.hidden = !visible;
  if (visible) {
    customPuzzleHeroBtn.textContent = 'Custom';
  }
}

function updateLowerPanelActions() {
  const hasPuzzle = selectionScreen.hidden && Boolean(currentPuzzle());
  lowerRestartBtn.disabled = !hasPuzzle;
  lowerNextBtn.disabled = !canAdvanceToNextPuzzle();
}

function currentCustomOverlay() {
  switch (currentType) {
    case 'toggle-switches':
      return customToggleOverlay;
    case 'rotation-path':
      return customRotationOverlay;
    case 'memory-sequence':
      return customMemoryOverlay;
    case 'mirror-reflection':
      return customMirrorOverlay;
    case 'number-trace':
      return customTraceOverlay;
    case 'chimp-test':
      return customChimpOverlay;
    default:
      return null;
  }
}

function renderTypeGrid() {
  renderTypeGridPage(typePage);
}

function renderTypeGridPage(page) {
  const total = puzzleTypes.length;
  const totalPages = Math.max(1, Math.ceil(total / TYPE_PAGE_SIZE));
  typePage = Math.max(0, Math.min(page, totalPages - 1));
  const startIndex = typePage * TYPE_PAGE_SIZE;
  const visibleTypes = puzzleTypes.slice(startIndex, startIndex + TYPE_PAGE_SIZE);

  typeGridEl.replaceChildren();

  for (const entry of visibleTypes) {
    const completedCount = entry.external
      ? null
      : entry.puzzles.filter(({ puzzle }) => isCompleted(save, puzzle.id)).length;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'type-card';
    card.innerHTML = entry.external
      ? `
        <span class="type-card-kicker">${entry.kicker}</span>
        <strong class="type-card-title">${entry.label}</strong>
        <span class="type-card-copy">${entry.blurb}</span>
        <span class="type-card-progress">${entry.progressText}</span>
      `
      : `
        <span class="type-card-kicker">${entry.puzzles.length} level${entry.puzzles.length === 1 ? '' : 's'}</span>
        <strong class="type-card-title">${entry.label}</strong>
        <span class="type-card-copy">${entry.blurb}</span>
        <span class="type-card-progress">${completedCount}/${entry.puzzles.length} cleared</span>
      `;
    card.addEventListener('click', () => {
      if (entry.external) {
        launchExternalCabinet(entry);
        return;
      }
      openType(entry.type);
    });
    typeGridEl.appendChild(card);
  }

  const showPager = total > TYPE_PAGE_SIZE;
  typePagerEl.hidden = !showPager;
  typePagerLabelEl.textContent = `Cabinets ${startIndex + 1}-${startIndex + visibleTypes.length}`;
  typePagerPrevBtn.disabled = typePage === 0;
  typePagerNextBtn.disabled = typePage >= totalPages - 1;
}

function setSelectionVisible(visible) {
  selectionScreen.hidden = !visible;
  boardWrap.hidden = visible;
  lowerPanelEl.hidden = visible;
  browseBtn.textContent = visible ? 'Back to Puzzle' : 'Puzzle Select';
  syncPuzzleUi();
}

function openSelectionScreen() {
  hideOverlays();
  setSelectionVisible(true);
  typePage = 0;
  renderTypeGrid();
}

function openCustomPuzzleModal() {
  if (!customPuzzleHeroVisible()) return;
  hideOverlays();
  const overlay = currentCustomOverlay();
  if (!overlay) return;
  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');
}

function openType(type) {
  const typeEntry = puzzleTypes.find((entry) => entry.type === type);
  if (!typeEntry) return;
  if (typeEntry.external) {
    launchExternalCabinet(typeEntry);
    return;
  }
  if (typeEntry.puzzles.length === 0) return;
  currentType = type;
  const reachableIndex = highestReachableTypeIndex(type);
  const targetEntry = typeEntry.puzzles[reachableIndex] ?? typeEntry.puzzles[0];
  openPuzzle(targetEntry.globalIndex);
}

function mountPuzzle(entry) {
  if (controller?.destroy) controller.destroy();
  boardContainer.replaceChildren();
  controller = createPuzzleController(entry.puzzle.type, {
    onSolve: onSolved,
    onMiss: onPuzzleMiss,
    setStatus,
  });
  controller.mount(boardContainer, entry.puzzle);
}

function mountCustomPuzzle(puzzle) {
  if (controller?.destroy) controller.destroy();
  boardContainer.replaceChildren();
  controller = createPuzzleController(puzzle.type, {
    onSolve: onSolved,
    onMiss: onPuzzleMiss,
    setStatus,
  });
  controller.mount(boardContainer, puzzle);
}

function createCustomPuzzleFromConfig(type, settings) {
  switch (type) {
    case 'toggle-switches':
      return createCustomTogglePuzzle(settings);
    case 'rotation-path':
      return createCustomRotationPuzzle(settings);
    case 'memory-sequence':
      return createCustomMemoryPuzzle(settings);
    case 'mirror-reflection':
      return createCustomMirrorPuzzle(settings);
    case 'number-trace':
      return createCustomNumberTracePuzzle(settings);
    case 'chimp-test':
      return createCustomChimpPuzzle(settings);
    default:
      return null;
  }
}

function decorateCustomPuzzle(puzzle, type, settings, regenerateOnMiss = false) {
  if (!puzzle) return null;
  puzzle.customMeta = {
    type,
    settings: { ...settings },
    regenerateOnMiss,
  };
  return puzzle;
}

function regenerateCurrentCustomPuzzle() {
  const meta = customPuzzle?.customMeta;
  if (!meta) return false;
  const nextPuzzle = decorateCustomPuzzle(
    createCustomPuzzleFromConfig(meta.type, meta.settings),
    meta.type,
    meta.settings,
    meta.regenerateOnMiss,
  );
  if (!nextPuzzle) return false;
  customPuzzle = nextPuzzle;
  currentGlobalIndex = -1;
  currentType = nextPuzzle.type;
  mountCustomPuzzle(nextPuzzle);
  syncPuzzleUi();
  setStatus('Missed it. New custom board loaded.');
  return true;
}

function onPuzzleMiss() {
  if (!customPuzzle?.customMeta?.regenerateOnMiss) return false;
  return regenerateCurrentCustomPuzzle();
}

function openPuzzle(globalIndex) {
  customPuzzle = null;
  currentGlobalIndex = globalIndex;
  const entry = currentPuzzleEntry();
  currentType = entry.type;
  hideOverlays();
  setSelectionVisible(false);
  mountPuzzle(entry);
  syncPuzzleUi();
}

function buildCustomPuzzleForCurrentType() {
  switch (currentType) {
    case 'toggle-switches':
      return decorateCustomPuzzle(
        createCustomPuzzleFromConfig(currentType, {
          cols: parseInt(customToggleColsEl.value, 10),
          rows: parseInt(customToggleRowsEl.value, 10),
        }),
        currentType,
        {
          cols: parseInt(customToggleColsEl.value, 10),
          rows: parseInt(customToggleRowsEl.value, 10),
        },
      );
    case 'rotation-path':
      return decorateCustomPuzzle(
        createCustomPuzzleFromConfig(currentType, {
          cols: parseInt(customRotationColsEl.value, 10),
          rows: parseInt(customRotationRowsEl.value, 10),
        }),
        currentType,
        {
          cols: parseInt(customRotationColsEl.value, 10),
          rows: parseInt(customRotationRowsEl.value, 10),
        },
      );
    case 'memory-sequence':
      return decorateCustomPuzzle(
        createCustomPuzzleFromConfig(currentType, {
          cols: parseInt(customMemoryColsEl.value, 10),
          rows: parseInt(customMemoryRowsEl.value, 10),
          roundCount: parseInt(customMemoryRoundsEl.value, 10),
        }),
        currentType,
        {
          cols: parseInt(customMemoryColsEl.value, 10),
          rows: parseInt(customMemoryRowsEl.value, 10),
          roundCount: parseInt(customMemoryRoundsEl.value, 10),
        },
        customMemoryRegenerateOnMissEl.checked,
      );
    case 'mirror-reflection':
      return decorateCustomPuzzle(
        createCustomPuzzleFromConfig(currentType, {
          cols: parseInt(customMirrorColsEl.value, 10),
          rows: parseInt(customMirrorRowsEl.value, 10),
        }),
        currentType,
        {
          cols: parseInt(customMirrorColsEl.value, 10),
          rows: parseInt(customMirrorRowsEl.value, 10),
        },
      );
    case 'number-trace':
      return decorateCustomPuzzle(
        createCustomPuzzleFromConfig(currentType, {
          cols: parseInt(customTraceColsEl.value, 10),
          rows: parseInt(customTraceRowsEl.value, 10),
          targetCount: parseInt(customTraceCountEl.value, 10),
          previewMs: parseInt(customTracePreviewEl.value, 10),
          roundCount: parseInt(customTraceRoundsEl.value, 10),
        }),
        currentType,
        {
          cols: parseInt(customTraceColsEl.value, 10),
          rows: parseInt(customTraceRowsEl.value, 10),
          targetCount: parseInt(customTraceCountEl.value, 10),
          previewMs: parseInt(customTracePreviewEl.value, 10),
          roundCount: parseInt(customTraceRoundsEl.value, 10),
        },
        customTraceRegenerateOnMissEl.checked,
      );
    case 'chimp-test':
      return decorateCustomPuzzle(
        createCustomPuzzleFromConfig(currentType, {
          cols: parseInt(customChimpColsEl.value, 10),
          rows: parseInt(customChimpRowsEl.value, 10),
          targetCount: parseInt(customChimpCountEl.value, 10),
          roundCount: parseInt(customChimpRoundsEl.value, 10),
        }),
        currentType,
        {
          cols: parseInt(customChimpColsEl.value, 10),
          rows: parseInt(customChimpRowsEl.value, 10),
          targetCount: parseInt(customChimpCountEl.value, 10),
          roundCount: parseInt(customChimpRoundsEl.value, 10),
        },
        customChimpRegenerateOnMissEl.checked,
      );
    default:
      return null;
  }
}

function openCustomPuzzle() {
  customPuzzle = buildCustomPuzzleForCurrentType();
  if (!customPuzzle) return;
  currentGlobalIndex = -1;
  currentType = customPuzzle.type;
  hideOverlays();
  setSelectionVisible(false);
  mountCustomPuzzle(customPuzzle);
  syncPuzzleUi();
}

function onSolved() {
  const entry = currentPuzzleEntry();
  if (entry) {
    save = markCompleted(save, entry.puzzle.id, entry.type, entry.typeIndex, entry.typeTotal);
    renderPuzzleNav();
    renderTypeGrid();
  }
  setStatus('Puzzle solved.', 'success');
  updateLowerPanelActions();
}

function restartPuzzle() {
  if (!controller || selectionScreen.hidden === false) return;
  hideOverlays();
  controller.restart();
}

function hideOverlays() {
  customToggleOverlay.hidden = true;
  customToggleOverlay.setAttribute('aria-hidden', 'true');
  customRotationOverlay.hidden = true;
  customRotationOverlay.setAttribute('aria-hidden', 'true');
  customMemoryOverlay.hidden = true;
  customMemoryOverlay.setAttribute('aria-hidden', 'true');
  customMirrorOverlay.hidden = true;
  customMirrorOverlay.setAttribute('aria-hidden', 'true');
  customTraceOverlay.hidden = true;
  customTraceOverlay.setAttribute('aria-hidden', 'true');
  customChimpOverlay.hidden = true;
  customChimpOverlay.setAttribute('aria-hidden', 'true');
}

function goToNextPuzzle() {
  const entry = nextPuzzleEntry();
  if (!entry || !canAdvanceToNextPuzzle()) return;
  openPuzzle(entry.globalIndex);
  renderPuzzleNavPage(Math.floor(entry.typeIndex / NAV_PAGE_SIZE));
  updateLowerPanelActions();
}

lowerRestartBtn.addEventListener('click', restartPuzzle);
browseBtn.addEventListener('click', () => {
  if (selectionScreen.hidden) openSelectionScreen();
  else if (currentPuzzleEntry()) setSelectionVisible(false);
});
lowerNextBtn.addEventListener('click', goToNextPuzzle);

customPuzzleHeroBtn.addEventListener('click', openCustomPuzzleModal);
customToggleCancelBtn.addEventListener('click', hideOverlays);
customToggleLaunchBtn.addEventListener('click', openCustomPuzzle);
customRotationCancelBtn.addEventListener('click', hideOverlays);
customRotationLaunchBtn.addEventListener('click', openCustomPuzzle);
customMemoryCancelBtn.addEventListener('click', hideOverlays);
customMemoryLaunchBtn.addEventListener('click', openCustomPuzzle);
customMirrorCancelBtn.addEventListener('click', hideOverlays);
customMirrorLaunchBtn.addEventListener('click', openCustomPuzzle);
customTraceCancelBtn.addEventListener('click', hideOverlays);
customTraceLaunchBtn.addEventListener('click', openCustomPuzzle);
customChimpCancelBtn.addEventListener('click', hideOverlays);
customChimpLaunchBtn.addEventListener('click', openCustomPuzzle);

pagerPrevBtn.addEventListener('click', () => renderPuzzleNavPage(navPage - 1));
pagerNextBtn.addEventListener('click', () => renderPuzzleNavPage(navPage + 1));
typePagerPrevBtn.addEventListener('click', () => renderTypeGridPage(typePage - 1));
typePagerNextBtn.addEventListener('click', () => renderTypeGridPage(typePage + 1));

const params = new URLSearchParams(window.location.search);
const debugPuzzleParam = params.get('puzzle');
const debugTypeParam = params.get('type');
const debugFlagParam = params.get('debug');
const debugIndex = debugPuzzleParam !== null ? parseInt(debugPuzzleParam, 10) : null;
debugMode = debugFlagParam === '1';

renderTypeGrid();

if (Number.isInteger(debugIndex) && debugIndex >= 0 && debugIndex < PUZZLES.length) {
  openPuzzle(debugIndex);
} else if (debugTypeParam && TYPE_META[debugTypeParam]) {
  openType(debugTypeParam);
} else {
  currentType = puzzleTypes[0]?.type ?? null;
  openSelectionScreen();
}
