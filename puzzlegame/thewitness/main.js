import { Renderer } from './src/engine/Renderer.js';
import { InputController } from './src/engine/Input.js';
import { findSolutionPath } from './src/engine/Solver.js';
import { Grid } from './src/engine/Grid.js';
import { loadPuzzles } from './src/engine/PuzzleLoader.js';
import { analyzeSolution } from './src/engine/Validator.js';
import {
  loadSave,
  markCompleted,
  getCurrentLevelIndex,
  setCurrentLevelIndex,
} from './src/save/SaveManager.js';

const LAYOUT_CONFIGS = {
  desktop: {
    name: 'desktop',
    navColumns: 10,
    navRows: 2,
  },
  mobile: {
    name: 'mobile',
    navColumns: 5,
    navRows: 2,
  },
};
const DEFAULT_COLLECTION = 'claude';
const COLLECTION_FILES = {
  claude: './src/puzzles/claude-levels.json',
  chatgpt: './src/puzzles/chatgpt-levels.json',
};

const svg = document.getElementById('board');
const mobileScopeEl = document.getElementById('mobile-scope');
const mobileScopeSvg = document.getElementById('mobile-scope-board');
const mobileScopeReopenBtn = document.getElementById('mobile-scope-reopen');
const scopeSettingsBtn = document.getElementById('scope-settings-btn');
const scopeSettingsPanel = document.getElementById('scope-settings-panel');
const scopeSideRightBtn = document.getElementById('scope-side-right');
const scopeSideLeftBtn = document.getElementById('scope-side-left');
const scopeFollowSpeedInput = document.getElementById('scope-follow-speed');
const scopeFollowSpeedNumberInput = document.getElementById('scope-follow-speed-number');
const scopeFollowSpeedLabel = document.getElementById('scope-follow-speed-label');
const puzzleTitle = document.getElementById('puzzle-title');
const navPanelEl = document.querySelector('.nav-panel');
const puzzleNav = document.getElementById('puzzle-nav');
const levelSourceSelect = document.getElementById('level-source');
const pagerPrev = document.getElementById('pager-prev');
const pagerNext = document.getElementById('pager-next');
const pagerLabel = document.getElementById('pager-label');
const resetBtn = document.getElementById('reset-btn');
const solutionBtn = document.getElementById('solution-btn');
const nextBtn = document.getElementById('next-btn');
const statusEl = document.getElementById('status');
const FAIL_FLASH_MS = 1400;
const MOBILE_LAYOUT_BREAKPOINT = 500;
const SCOPE_DOCK_KEY = 'insight.scopeDock';
const SCOPE_FOLLOW_SPEED_KEY = 'insight.scopeFollowSpeed';
const SCOPE_INTERACTING_CLASS = 'scope-interacting';
const SCOPE_FOLLOW_SETTLE_THRESHOLD = 0.25;
const SCOPE_FOLLOW_SPEED_MIN = 0;
const SCOPE_FOLLOW_SPEED_MAX = 100;
const SCOPE_FOLLOW_SPEED_DEFAULT = 50;
const SCOPE_FOLLOW_EASE_MIN = 0.08;
const SCOPE_FOLLOW_EASE_MAX = 0.28;
const SCOPE_VIEWBOX_MIN_SPAN = 180;
const SCOPE_VIEWBOX_MAX_SPAN = 260;

let navPage = 0;
let collections = {};
let levels = [];
let save = loadSave();
let currentIndex = 0;
let grid;
let renderer;
let scopeRenderer;
let input;
const solutionCache = new Map();
let debugSolutionVisible = false;
let scopePointerActive = false;
let scopeLockedViewBox = '';
let scopeDismissed = false;
let scopeDock = localStorage.getItem(SCOPE_DOCK_KEY) === 'left' ? 'left' : 'right';
let scopeFollowSpeed = parseScopeFollowSpeed(localStorage.getItem(SCOPE_FOLLOW_SPEED_KEY));
let scopeViewBoxState = null;
let scopeTargetViewBox = null;
let scopeFollowFrame = 0;
const mobileScopeEnabled = window.matchMedia?.('(pointer: coarse)').matches ?? false;
const touchLayoutCapable =
  (navigator.maxTouchPoints ?? 0) > 0 || 'ontouchstart' in window;

// Testing backdoor: index.html?level=37 jumps straight to level 37 and unlocks
// free navigation between all levels for the session, without touching real save progress.
const debugLevelParam = new URLSearchParams(window.location.search).get('level');
const debugLevel = debugLevelParam !== null ? parseInt(debugLevelParam, 10) : null;
const debugMode = Number.isInteger(debugLevel);

syncLayoutMode();
window.addEventListener('resize', handleViewportChange);

function cloneLevel(level, collectionKey) {
  const cloned = structuredClone(level);
  cloned.collectionKey = collectionKey;
  cloned.progressKey = `${collectionKey}::${level.id}`;
  if (collectionKey === 'claude') cloned.legacyId = level.id;
  return cloned;
}

function useMobileLayout() {
  const shortestViewportSide = Math.min(window.innerWidth, window.innerHeight);
  return touchLayoutCapable && shortestViewportSide <= MOBILE_LAYOUT_BREAKPOINT;
}

function getLayoutConfig() {
  return useMobileLayout() ? LAYOUT_CONFIGS.mobile : LAYOUT_CONFIGS.desktop;
}

function navPanelWidth(columns) {
  return `calc(${columns} * 2rem + ${columns - 1} * 0.5rem)`;
}

function syncLayoutMode() {
  const layout = getLayoutConfig();
  document.body.dataset.layout = layout.name;
  navPanelEl?.style.setProperty('--nav-columns', String(layout.navColumns));
  navPanelEl?.style.setProperty('--nav-panel-width', navPanelWidth(layout.navColumns));
}

function handleViewportChange() {
  const previousLayout = document.body.dataset.layout;
  syncLayoutMode();
  if (levels.length > 0 && previousLayout !== document.body.dataset.layout) {
    renderPuzzleNav();
  }
}

function getNavPageSize() {
  const layout = getLayoutConfig();
  return layout.navRows * layout.navColumns;
}

async function loadCollections() {
  const entries = await Promise.all(
    Object.entries(COLLECTION_FILES).map(async ([collectionKey, file]) => {
      const collectionLevels = await loadPuzzles(file);
      return [collectionKey, collectionLevels.map((level) => cloneLevel(level, collectionKey))];
    })
  );
  return Object.fromEntries(entries);
}

function getCurrentCollectionKey() {
  return levelSourceSelect.value || DEFAULT_COLLECTION;
}

function getCollectionLabel(collectionKey) {
  return collectionKey === 'claude' ? 'Claude' : 'ChatGPT';
}

function setActiveCollection(collectionKey) {
  levels = collections[collectionKey] || [];
}

function isPuzzleCompleted(puzzle) {
  return (
    save.completedPuzzles.includes(puzzle.progressKey) ||
    (puzzle.legacyId && save.completedPuzzles.includes(puzzle.legacyId))
  );
}

function getDefaultStatusText(puzzle) {
  return isPuzzleCompleted(puzzle) ? 'Solved' : '';
}

function setSolutionButtonState({ hidden, disabled, text }) {
  if (hidden !== undefined) solutionBtn.hidden = hidden;
  if (disabled !== undefined) solutionBtn.disabled = disabled;
  if (text !== undefined) solutionBtn.textContent = text;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseScopeFollowSpeed(rawValue) {
  const parsed = Number.parseInt(rawValue ?? '', 10);
  if (Number.isNaN(parsed)) return SCOPE_FOLLOW_SPEED_DEFAULT;
  return clamp(parsed, SCOPE_FOLLOW_SPEED_MIN, SCOPE_FOLLOW_SPEED_MAX);
}

function scopeFollowEase() {
  const ratio =
    (scopeFollowSpeed - SCOPE_FOLLOW_SPEED_MIN) /
    (SCOPE_FOLLOW_SPEED_MAX - SCOPE_FOLLOW_SPEED_MIN);
  return SCOPE_FOLLOW_EASE_MIN + ratio * (SCOPE_FOLLOW_EASE_MAX - SCOPE_FOLLOW_EASE_MIN);
}

function scopeFollowSpeedText() {
  if (scopeFollowSpeed <= 33) return 'Steady';
  if (scopeFollowSpeed >= 67) return 'Fast';
  return 'Balanced';
}

function applyScopeDock() {
  const leftDocked = scopeDock === 'left';
  mobileScopeEl.classList.toggle('scope-left', leftDocked);
  mobileScopeReopenBtn.classList.toggle('scope-left', leftDocked);
  scopeSideLeftBtn.classList.toggle('active', leftDocked);
  scopeSideRightBtn.classList.toggle('active', !leftDocked);
}

function applyScopeFollowSpeed() {
  scopeFollowSpeedInput.value = String(scopeFollowSpeed);
  scopeFollowSpeedNumberInput.value = String(scopeFollowSpeed);
  scopeFollowSpeedLabel.textContent = scopeFollowSpeedText();
}

function hideScopeSettings() {
  scopeSettingsPanel.hidden = true;
  scopeSettingsPanel.setAttribute('aria-hidden', 'true');
  scopeSettingsBtn.setAttribute('aria-expanded', 'false');
}

function toggleScopeSettings() {
  const nextHidden = !scopeSettingsPanel.hidden;
  scopeSettingsPanel.hidden = nextHidden;
  scopeSettingsPanel.setAttribute('aria-hidden', String(nextHidden));
  scopeSettingsBtn.setAttribute('aria-expanded', String(!nextHidden));
}

function setScopeDock(nextDock) {
  scopeDock = nextDock === 'left' ? 'left' : 'right';
  localStorage.setItem(SCOPE_DOCK_KEY, scopeDock);
  applyScopeDock();
  hideScopeSettings();
}

function setScopeFollowSpeed(nextValue) {
  scopeFollowSpeed = parseScopeFollowSpeed(nextValue);
  localStorage.setItem(SCOPE_FOLLOW_SPEED_KEY, String(scopeFollowSpeed));
  applyScopeFollowSpeed();
}

function parseViewBox(viewBox) {
  if (!viewBox) return null;
  const [x, y, width, height] = viewBox.split(/\s+/).map(Number);
  if ([x, y, width, height].some((value) => Number.isNaN(value))) return null;
  return { x, y, width, height };
}

function formatViewBox({ x, y, width, height }) {
  return `${x} ${y} ${width} ${height}`;
}

function stopScopeViewBoxAnimation() {
  if (scopeFollowFrame) {
    cancelAnimationFrame(scopeFollowFrame);
    scopeFollowFrame = 0;
  }
  scopeViewBoxState = null;
  scopeTargetViewBox = null;
}

function renderScopeViewBox(viewBox) {
  scopeViewBoxState = { ...viewBox };
  mobileScopeSvg.setAttribute('viewBox', formatViewBox(viewBox));
}

function stepScopeViewBox() {
  if (!scopeViewBoxState || !scopeTargetViewBox) {
    scopeFollowFrame = 0;
    return;
  }

  const next = { ...scopeViewBoxState };
  let settled = true;
  for (const key of ['x', 'y', 'width', 'height']) {
    const delta = scopeTargetViewBox[key] - next[key];
    if (Math.abs(delta) > SCOPE_FOLLOW_SETTLE_THRESHOLD) {
      next[key] += delta * scopeFollowEase();
      settled = false;
    } else {
      next[key] = scopeTargetViewBox[key];
    }
  }

  renderScopeViewBox(next);
  if (settled) {
    scopeFollowFrame = 0;
    return;
  }
  scopeFollowFrame = requestAnimationFrame(stepScopeViewBox);
}

function setScopeViewBox(nextViewBox, { immediate = false } = {}) {
  const parsed = typeof nextViewBox === 'string' ? parseViewBox(nextViewBox) : nextViewBox;
  if (!parsed) return;
  scopeTargetViewBox = { ...parsed };
  if (immediate || !scopeViewBoxState) {
    stopScopeViewBoxAnimation();
    renderScopeViewBox(parsed);
    return;
  }
  if (!scopeFollowFrame) {
    scopeFollowFrame = requestAnimationFrame(stepScopeViewBox);
  }
}

function svgPointFor(svgEl, evt) {
  const rect = svgEl.getBoundingClientRect();
  const viewBox = svgEl.viewBox?.baseVal;
  const minX = viewBox?.x ?? 0;
  const minY = viewBox?.y ?? 0;
  const width = viewBox?.width || rect.width;
  const height = viewBox?.height || rect.height;
  return {
    x: minX + ((evt.clientX - rect.left) / rect.width) * width,
    y: minY + ((evt.clientY - rect.top) / rect.height) * height,
  };
}

function nearestNodeFor(svgEl, activeGrid, evt) {
  const point = svgPointFor(svgEl, evt);
  let closest = null;
  let bestDist = Infinity;
  for (const node of activeGrid.allNodes()) {
    const nextPoint = activeGrid.nodeToPoint(node);
    const dist = Math.hypot(nextPoint.x - point.x, nextPoint.y - point.y);
    if (dist < bestDist) {
      bestDist = dist;
      closest = node;
    }
  }
  return { node: closest, dist: bestDist };
}

function hideMobileScope() {
  mobileScopeEl.hidden = true;
  mobileScopeEl.setAttribute('aria-hidden', 'true');
  scopePointerActive = false;
  scopeLockedViewBox = '';
  stopScopeViewBoxAnimation();
  document.body.classList.remove(SCOPE_INTERACTING_CLASS);
  syncScopeReopenButton();
}

function syncScopeReopenButton(path = input?.getPath?.() || []) {
  const shouldShow =
    mobileScopeEnabled &&
    scopeDismissed &&
    input?.isTracing?.() &&
    path.length > 0 &&
    !debugSolutionVisible;
  mobileScopeReopenBtn.hidden = !shouldShow;
}

function dismissMobileScope() {
  scopeDismissed = true;
  hideMobileScope();
}

function reopenMobileScope() {
  if (!mobileScopeEnabled) return;
  scopeDismissed = false;
  syncMobileScope();
}

function scopeViewBoxFor(node) {
  const center = grid.nodeToPoint(node);
  const span = clamp(
    grid.cellSize * 2.75,
    SCOPE_VIEWBOX_MIN_SPAN,
    SCOPE_VIEWBOX_MAX_SPAN
  );
  const min = 0;
  const max = grid.svgSize - span;
  const x = Math.max(min, Math.min(center.x - span / 2, max));
  const y = Math.max(min, Math.min(center.y - span / 2, max));
  return `${x} ${y} ${span} ${span}`;
}

function syncMobileScope(path = input?.getPath?.() || []) {
  if (
    !mobileScopeEnabled ||
    !scopeRenderer ||
    !input?.isTracing?.() ||
    path.length === 0 ||
    debugSolutionVisible ||
    scopeDismissed
  ) {
    hideMobileScope();
    return;
  }

  const tip = path[path.length - 1];
  mobileScopeEl.hidden = false;
  mobileScopeEl.setAttribute('aria-hidden', 'false');
  mobileScopeReopenBtn.hidden = true;
  const targetViewBox = scopeViewBoxFor(tip);
  setScopeViewBox(scopePointerActive && scopeLockedViewBox ? scopeLockedViewBox : targetViewBox, {
    immediate: !scopePointerActive,
  });
  scopeRenderer.drawPath(path, 'drawing');
  scopeRenderer.drawMirrorPath(path, 'drawing');
}

function handleScopeStep(evt) {
  if (!mobileScopeEnabled || !input?.isTracing?.() || !grid) return;
  evt.preventDefault();
  const { node, dist } = nearestNodeFor(mobileScopeSvg, grid, evt);
  const grabRadius = grid.cellSize * 0.75;
  if (dist > grabRadius) return;
  const changed = input.commitNode(node);
  if (changed) {
    const nextPath = input.getPath();
    if (input.isTracing()) {
      syncMobileScope(nextPath);
    } else {
      hideMobileScope();
    }
  }
}

function beginScopePointer(evt) {
  scopePointerActive = true;
  scopeLockedViewBox = '';
  document.body.classList.add(SCOPE_INTERACTING_CLASS);
  if (evt.pointerId !== undefined && mobileScopeSvg.setPointerCapture) {
    mobileScopeSvg.setPointerCapture(evt.pointerId);
  }
}

function endScopePointer(evt) {
  if (evt?.pointerId !== undefined && mobileScopeSvg.hasPointerCapture?.(evt.pointerId)) {
    mobileScopeSvg.releasePointerCapture(evt.pointerId);
  }
  scopePointerActive = false;
  scopeLockedViewBox = '';
  document.body.classList.remove(SCOPE_INTERACTING_CLASS);
  syncMobileScope();
}

async function init() {
  collections = await loadCollections();
  save = loadSave();
  applyScopeDock();
  applyScopeFollowSpeed();
  hideScopeSettings();
  levelSourceSelect.value = DEFAULT_COLLECTION;
  setActiveCollection(DEFAULT_COLLECTION);
  currentIndex = debugMode
    ? Math.min(Math.max(debugLevel - 1, 0), levels.length - 1)
    : Math.min(Math.max(getCurrentLevelIndex(save, DEFAULT_COLLECTION), 0), levels.length - 1);
  loadLevel(currentIndex);
}

function isLevelUnlocked(index) {
  return debugMode || index === 0 || isPuzzleCompleted(levels[index - 1]);
}

function loadLevel(index) {
  currentIndex = Math.max(0, Math.min(index, levels.length - 1));
  const puzzle = levels[currentIndex];
  if (!puzzle) {
    showEmptyCollectionState();
    return;
  }

  grid = new Grid(puzzle.width, puzzle.height);
  renderer = new Renderer(svg, grid);
  renderer.setPuzzle(puzzle);
  scopeRenderer = new Renderer(mobileScopeSvg, grid);
  scopeRenderer.setPuzzle(puzzle);
  scopeDismissed = false;
  hideMobileScope();

  if (input) input.destroy();
  input = new InputController(svg, grid, {
    onChange: (path) => {
      renderer.drawPath(path, 'drawing');
      renderer.drawMirrorPath(path, 'drawing');
      syncMobileScope(path);
    },
    onRelease: (path) => handleRelease(puzzle, path),
  });
  input.setPuzzle(puzzle);
  input.setReleaseToSubmitEnabled(!mobileScopeEnabled);
  input.setAutoSubmitOnExit(mobileScopeEnabled);
  input.setRollbackToVisitedEnabled(mobileScopeEnabled);

  const alreadySolved = isPuzzleCompleted(puzzle);
  debugSolutionVisible = false;
  puzzleTitle.textContent = `${getCollectionLabel(getCurrentCollectionKey())} Level ${currentIndex + 1} of ${levels.length}${
    debugMode ? ' (debug)' : ''
  }`;
  statusEl.textContent = alreadySolved ? 'Solved' : '';
  setSolutionButtonState({ hidden: !debugMode, disabled: false, text: 'Show Solution' });
  nextBtn.disabled = !alreadySolved || currentIndex >= levels.length - 1;

  setCurrentLevelIndex(save, currentIndex, getCurrentCollectionKey());
  renderPuzzleNav();
}

function handleRelease(puzzle, path) {
  const result = analyzeSolution(grid, puzzle, path);
  if (result.valid) {
    hideMobileScope();
    renderer.drawPath(path, 'success');
    renderer.drawMirrorPath(path, 'success');
    input.reset();
    markCompleted(save, puzzle.progressKey);
    statusEl.textContent = currentIndex === levels.length - 1 ? 'All levels complete!' : 'Solved!';
    nextBtn.disabled = currentIndex >= levels.length - 1;
    renderPuzzleNav();
  } else if (path.length > 1) {
    hideMobileScope();
    renderer.drawPath(path, 'fail');
    renderer.drawMirrorPath(path, 'fail');
    renderer.flashFailedSymbols(result.failures, FAIL_FLASH_MS);
    input.reset();
    setTimeout(() => {
      renderer.drawPath([]);
      renderer.drawMirrorPath([]);
    }, FAIL_FLASH_MS);
  } else {
    hideMobileScope();
    input.reset();
  }
}

function showEmptyCollectionState() {
  puzzleTitle.textContent = `${getCollectionLabel(getCurrentCollectionKey())} Levels`;
  statusEl.textContent = `No levels found in the ${getCollectionLabel(getCurrentCollectionKey())} collection.`;
  puzzleNav.innerHTML = '';
  pagerLabel.textContent = 'Page 0 of 0';
  pagerPrev.disabled = true;
  pagerNext.disabled = true;
  setSolutionButtonState({ hidden: true, disabled: true, text: 'Show Solution' });
  nextBtn.disabled = true;
}

function hideDebugSolution({ clearStatus = false } = {}) {
  if (!renderer) return;
  debugSolutionVisible = false;
  setSolutionButtonState({ text: 'Show Solution' });
  renderer.drawPath([]);
  renderer.drawMirrorPath([]);
  syncMobileScope();
  syncScopeReopenButton();
  if (clearStatus) {
    statusEl.textContent = '';
  } else if (levels[currentIndex]) {
    statusEl.textContent = getDefaultStatusText(levels[currentIndex]);
  }
}

function toggleDebugSolution() {
  if (!debugMode || !levels[currentIndex] || !renderer || !input) return;
  if (debugSolutionVisible) {
    hideDebugSolution();
    return;
  }

  const puzzle = levels[currentIndex];
  const cacheKey = puzzle.progressKey || puzzle.id;
  let solution = solutionCache.get(cacheKey);
  if (!solution) {
    solution = findSolutionPath(puzzle);
    if (solution) solutionCache.set(cacheKey, solution);
  }

  if (!solution) {
    statusEl.textContent = 'No solution found (debug)';
    return;
  }

  debugSolutionVisible = true;
  input.reset();
  renderer.clearSymbolFailures();
  renderer.drawPath(solution, 'success');
  renderer.drawMirrorPath(solution, 'success');
  setSolutionButtonState({ text: 'Hide Solution' });
  statusEl.textContent = 'Solution shown (debug)';
}

resetBtn.addEventListener('click', () => {
  if (input && renderer) {
    input.reset();
    hideMobileScope();
    if (debugSolutionVisible) {
      hideDebugSolution({ clearStatus: true });
    } else {
      renderer.drawPath([]);
      renderer.drawMirrorPath([]);
    }
    renderer.clearSymbolFailures();
  }
  if (!debugSolutionVisible) statusEl.textContent = '';
});

solutionBtn.addEventListener('click', () => {
  toggleDebugSolution();
});

nextBtn.addEventListener('click', () => {
  if (currentIndex < levels.length - 1) {
    loadLevel(currentIndex + 1);
  }
});

function renderPuzzleNav() {
  renderPuzzleNavPage(Math.floor(currentIndex / getNavPageSize()));
}

function renderPuzzleNavPage(page) {
  if (levels.length === 0) {
    showEmptyCollectionState();
    return;
  }

  const pageSize = getNavPageSize();
  const pageCount = Math.ceil(levels.length / pageSize);
  navPage = Math.max(0, Math.min(page, pageCount - 1));
  const start = navPage * pageSize;
  const end = Math.min(start + pageSize, levels.length);

  puzzleNav.innerHTML = '';
  for (let i = start; i < end; i++) {
    const puzzle = levels[i];
    const unlocked = isLevelUnlocked(i);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = String(i + 1);
    btn.className = 'nav-dot';
    if (i === currentIndex) btn.classList.add('current');
    if (isPuzzleCompleted(puzzle)) btn.classList.add('completed');
    if (!unlocked) {
      btn.disabled = true;
      btn.title = 'Complete the previous level to unlock';
    } else {
      btn.addEventListener('click', () => loadLevel(i));
    }
    puzzleNav.appendChild(btn);
  }

  pagerLabel.textContent = `${getCollectionLabel(getCurrentCollectionKey())} • Page ${navPage + 1} of ${pageCount}`;
  pagerPrev.disabled = navPage === 0;
  pagerNext.disabled = navPage >= pageCount - 1;
}

pagerPrev.addEventListener('click', () => renderPuzzleNavPage(navPage - 1));
pagerNext.addEventListener('click', () => renderPuzzleNavPage(navPage + 1));
levelSourceSelect.addEventListener('change', () => {
  navPage = 0;
  setActiveCollection(getCurrentCollectionKey());
  currentIndex = debugMode
    ? Math.min(Math.max(debugLevel - 1, 0), levels.length - 1)
    : Math.min(Math.max(getCurrentLevelIndex(save, getCurrentCollectionKey()), 0), levels.length - 1);
  loadLevel(currentIndex);
});

mobileScopeSvg.addEventListener('pointerdown', (evt) => {
  if (!mobileScopeEnabled || !input?.isTracing?.()) return;
  beginScopePointer(evt);
  handleScopeStep(evt);
}, { passive: false });

mobileScopeReopenBtn.addEventListener('click', () => {
  reopenMobileScope();
});

scopeSettingsBtn.addEventListener('click', () => {
  toggleScopeSettings();
});

scopeSideRightBtn.addEventListener('click', () => {
  setScopeDock('right');
});

scopeSideLeftBtn.addEventListener('click', () => {
  setScopeDock('left');
});

scopeFollowSpeedInput.addEventListener('input', (evt) => {
  setScopeFollowSpeed(evt.target.value);
});

scopeFollowSpeedNumberInput.addEventListener('input', (evt) => {
  setScopeFollowSpeed(evt.target.value);
});

scopeFollowSpeedNumberInput.addEventListener('blur', () => {
  applyScopeFollowSpeed();
});

document.addEventListener('pointerdown', (evt) => {
  if (!scopeSettingsPanel.hidden && !scopeSettingsPanel.contains(evt.target) && evt.target !== scopeSettingsBtn) {
    hideScopeSettings();
  }
  if (!mobileScopeEnabled || mobileScopeEl.hidden) return;
  if (mobileScopeEl.contains(evt.target)) return;
  if (svg.contains(evt.target)) return;
  if (evt.target === mobileScopeReopenBtn) return;
  if (scopeSettingsPanel.contains(evt.target) || evt.target === scopeSettingsBtn) return;
  dismissMobileScope();
});

mobileScopeSvg.addEventListener('pointermove', (evt) => {
  if (!scopePointerActive) return;
  handleScopeStep(evt);
}, { passive: false });

window.addEventListener('pointerup', (evt) => {
  endScopePointer(evt);
});

window.addEventListener('pointercancel', (evt) => {
  endScopePointer(evt);
});

init();
