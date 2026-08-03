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
const DEFAULT_COLLECTION = 'codex';
const COLLECTION_FILES = {
  claude: './src/puzzles/claude-levels.json',
  codex: './src/puzzles/codex-levels.json',
};
const COLLECTION_LABELS = {
  claude: 'Claude',
  codex: 'Codex',
};

const svg = document.getElementById('board');
const mobileScopeEl = document.getElementById('mobile-scope');
const mobileScopeSvg = document.getElementById('mobile-scope-board');
const scopeSettingsBtn = document.getElementById('scope-settings-btn');
const scopeSettingsPanel = document.getElementById('scope-settings-panel');
const scopeSideRightBtn = document.getElementById('scope-side-right');
const scopeSideLeftBtn = document.getElementById('scope-side-left');
const scopeViewOnBtn = document.getElementById('scope-view-on');
const scopeViewOffBtn = document.getElementById('scope-view-off');
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
const guideBtn = document.getElementById('guide-btn');
const solutionBtn = document.getElementById('solution-btn');
const nextBtn = document.getElementById('next-btn');
const statusEl = document.getElementById('status');
const debugGuideEl = document.getElementById('debug-guide');
const debugGuideBackdropEl = debugGuideEl?.querySelector('.debug-guide-backdrop');
const debugGuideSubtitleEl = document.getElementById('debug-guide-subtitle');
const debugGuideContentEl = document.getElementById('debug-guide-content');
const debugGuideCloseBtn = document.getElementById('debug-guide-close');
const FAIL_FLASH_MS = 1400;
const MOBILE_LAYOUT_BREAKPOINT = 500;
const DEBUG_GUIDE_OPEN_CLASS = 'debug-guide-open';
// Keep the legacy key names so existing players retain their saved scope settings
// after the project rename from "Insight" to "The Vision".
const SCOPE_DOCK_KEY = 'insight.scopeDock';
const SCOPE_FOLLOW_SPEED_KEY = 'insight.scopeFollowSpeed';
const SCOPE_VIEW_ENABLED_KEY = 'insight.scopeViewEnabled';
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
let debugGuideVisible = false;
let scopePointerActive = false;
let scopeLockedViewBox = '';
let scopeDock = localStorage.getItem(SCOPE_DOCK_KEY) === 'left' ? 'left' : 'right';
let scopeFollowSpeed = parseScopeFollowSpeed(localStorage.getItem(SCOPE_FOLLOW_SPEED_KEY));
let scopeViewEnabled = localStorage.getItem(SCOPE_VIEW_ENABLED_KEY) !== 'off';
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
const GUIDE_SVG_NS = 'http://www.w3.org/2000/svg';
const DEBUG_GUIDE_ITEMS = [
  {
    key: 'dots',
    title: 'Dots',
    symbol: 'Blue dots',
    description: 'The path must pass through every dot node on the board.',
  },
  {
    key: 'blockedEdges',
    title: 'Blocked Edges',
    symbol: 'Broken red lines',
    description: 'The path cannot cross these edges at all.',
  },
  {
    key: 'requiredEdges',
    title: 'Required Edges',
    symbol: 'Gold highlighted edges',
    description: 'The path must include every highlighted edge somewhere in the solution.',
  },
  {
    key: 'turnNodes',
    title: 'Turn Nodes',
    symbol: 'Gold corner nodes',
    description: 'The path must visit each marked node and change direction there rather than going straight through.',
  },
  {
    key: 'straightNodes',
    title: 'Straight Nodes',
    symbol: 'Blue cross nodes',
    description: 'The path must visit each marked node and continue straight through it rather than turning.',
  },
  {
    key: 'horizontalNodes',
    title: 'Horizontal Nodes',
    symbol: 'Blue horizontal rail nodes',
    description: 'The path must visit each marked node and pass through it horizontally, never vertically or as a turn.',
  },
  {
    key: 'verticalNodes',
    title: 'Vertical Nodes',
    symbol: 'Blue vertical rail nodes',
    description: 'The path must visit each marked node and pass through it vertically, never horizontally or as a turn.',
  },
  {
    key: 'cornerNodes',
    title: 'Corner Nodes',
    symbol: 'Gold oriented corner nodes',
    description: 'The path must turn through the marked node in the exact corner orientation shown by the symbol.',
  },
  {
    key: 'triangles',
    title: 'Triangles',
    symbol: 'Yellow triangle clusters',
    description: 'A cell must have exactly that many of its four edges traced by the path.',
  },
  {
    key: 'cellColors',
    title: 'Colored Regions',
    symbol: 'Black, white, or blue square chips',
    description: 'The path must divide the board so each region keeps colors separated rather than mixing them together.',
  },
  {
    key: 'stars',
    title: 'Stars',
    symbol: 'White, black, or blue stars',
    description: 'Each star must share a region with exactly one matching same-colored partner and no extra colors mixed into that region.',
  },
  {
    key: 'eliminators',
    title: 'Eliminators',
    symbol: 'Orange circle with an X',
    description: 'An eliminator cancels exactly one other symbol in its region so the remaining rules can still be satisfied.',
  },
  {
    key: 'polyominoes',
    title: 'Polyominoes',
    symbol: 'Straight and slanted yellow pieces',
    description: 'The region containing the pieces must be exactly tileable by those shapes with no gaps or overlaps. Straight pieces keep the shown orientation; slanted pieces may be rotated to any valid 90-degree turn.',
  },
  {
    key: 'regionSizes',
    title: 'Region Size Numbers',
    symbol: 'Ivory cream size numbers',
    description: 'Each numbered cell adds that many cells to its region\'s required size. If multiple numbers share one region, add them together; that region must contain exactly that many cells total.',
  },
  {
    key: 'symmetry',
    title: 'Symmetry',
    symbol: 'Mirror path / twin start-end markers',
    description: 'Your drawn path creates a second 180-degree mirrored path; both paths must be valid and cannot touch.',
  },
];

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
  return COLLECTION_LABELS[collectionKey] || collectionKey;
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

function setGuideButtonState({ hidden, disabled, text }) {
  if (hidden !== undefined) guideBtn.hidden = hidden;
  if (disabled !== undefined) guideBtn.disabled = disabled;
  if (text !== undefined) guideBtn.textContent = text;
  guideBtn.setAttribute('aria-expanded', String(!guideBtn.hidden && debugGuideVisible));
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

function scopeViewActive() {
  return mobileScopeEnabled && scopeViewEnabled;
}

function applyScopeDock() {
  const leftDocked = scopeDock === 'left';
  mobileScopeEl.classList.toggle('scope-left', leftDocked);
  scopeSideLeftBtn.classList.toggle('active', leftDocked);
  scopeSideRightBtn.classList.toggle('active', !leftDocked);
}

function applyScopeViewEnabled() {
  scopeViewOnBtn.classList.toggle('active', scopeViewEnabled);
  scopeViewOffBtn.classList.toggle('active', !scopeViewEnabled);
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

function guideSvgEl(tag, attrs = {}) {
  const el = document.createElementNS(GUIDE_SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  return el;
}

function guideStarPoints(cx, cy, outerR, innerR) {
  const points = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    points.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return points.join(' ');
}

function createGuidePreview(item) {
  const wrapper = document.createElement('div');
  wrapper.className = 'debug-guide-preview';
  wrapper.setAttribute('aria-hidden', 'true');

  const svg = guideSvgEl('svg', {
    viewBox: '0 0 72 44',
    class: 'debug-guide-preview-svg',
  });

  const addNode = (cx, cy, className = 'node', r = 4) => {
    svg.appendChild(guideSvgEl('circle', { cx, cy, r, class: className }));
  };

  const addLine = (x1, y1, x2, y2, className = 'grid-edge') => {
    svg.appendChild(guideSvgEl('line', { x1, y1, x2, y2, class: className }));
  };

  switch (item.key) {
    case 'dots':
      addLine(10, 22, 62, 22);
      addNode(10, 22);
      addNode(62, 22);
      svg.appendChild(guideSvgEl('circle', { cx: 28, cy: 22, r: 6, class: 'dot' }));
      svg.appendChild(guideSvgEl('circle', { cx: 44, cy: 22, r: 6, class: 'dot' }));
      break;
    case 'blockedEdges':
      addLine(10, 22, 62, 22, 'grid-edge blocked');
      addNode(10, 22);
      addNode(62, 22);
      svg.appendChild(guideSvgEl('circle', { cx: 36, cy: 22, r: 5, class: 'blocked-marker' }));
      break;
    case 'requiredEdges':
      addLine(10, 22, 62, 22, 'grid-edge required');
      addNode(10, 22);
      addNode(62, 22);
      break;
    case 'triangles': {
      const points = [
        '18,28 24,16 30,28',
        '31,28 37,16 43,28',
        '44,28 50,16 56,28',
      ];
      for (const trianglePoints of points) {
        svg.appendChild(guideSvgEl('polygon', { points: trianglePoints, class: 'triangle' }));
      }
      break;
    }
    case 'turnNodes':
      addNode(36, 22);
      for (const d of [
        'M 32 12 Q 32 20 24 20',
        'M 40 12 Q 40 20 48 20',
        'M 24 24 Q 32 24 32 32',
        'M 48 24 Q 40 24 40 32',
      ]) {
        svg.appendChild(guideSvgEl('path', { d, class: 'turn-node-mark' }));
      }
      svg.appendChild(guideSvgEl('polygon', {
        points: '36,17 41,22 36,27 31,22',
        class: 'turn-node-center',
      }));
      break;
    case 'straightNodes':
      addNode(36, 22);
      svg.appendChild(guideSvgEl('line', {
        x1: 23,
        y1: 22,
        x2: 49,
        y2: 22,
        class: 'straight-node-mark',
      }));
      svg.appendChild(guideSvgEl('line', {
        x1: 36,
        y1: 9,
        x2: 36,
        y2: 35,
        class: 'straight-node-mark',
      }));
      break;
    case 'horizontalNodes':
      addNode(36, 22);
      svg.appendChild(guideSvgEl('line', {
        x1: 20,
        y1: 18,
        x2: 52,
        y2: 18,
        class: 'axis-node-mark',
      }));
      svg.appendChild(guideSvgEl('line', {
        x1: 20,
        y1: 26,
        x2: 52,
        y2: 26,
        class: 'axis-node-mark',
      }));
      break;
    case 'verticalNodes':
      addNode(36, 22);
      svg.appendChild(guideSvgEl('line', {
        x1: 32,
        y1: 6,
        x2: 32,
        y2: 38,
        class: 'axis-node-mark',
      }));
      svg.appendChild(guideSvgEl('line', {
        x1: 40,
        y1: 6,
        x2: 40,
        y2: 38,
        class: 'axis-node-mark',
      }));
      break;
    case 'cornerNodes':
      addNode(36, 22);
      svg.appendChild(guideSvgEl('path', {
        d: 'M 27 36 L 27 13 L 50 13',
        class: 'corner-node-mark',
      }));
      svg.appendChild(guideSvgEl('path', {
        d: 'M 39 36 L 39 23 L 50 23',
        class: 'corner-node-mark',
      }));
      break;
    case 'cellColors':
      svg.appendChild(guideSvgEl('rect', {
        x: 10,
        y: 15,
        width: 14,
        height: 14,
        rx: 2,
        class: 'region-chip region-black',
      }));
      svg.appendChild(guideSvgEl('rect', {
        x: 29,
        y: 15,
        width: 14,
        height: 14,
        rx: 2,
        class: 'region-chip region-white',
      }));
      svg.appendChild(guideSvgEl('rect', {
        x: 48,
        y: 15,
        width: 14,
        height: 14,
        rx: 2,
        class: 'region-chip region-blue',
      }));
      break;
    case 'stars':
      svg.appendChild(guideSvgEl('polygon', {
        points: guideStarPoints(18, 22, 8, 3.4),
        class: 'star star-white',
      }));
      svg.appendChild(guideSvgEl('polygon', {
        points: guideStarPoints(36, 22, 8, 3.4),
        class: 'star star-black',
      }));
      svg.appendChild(guideSvgEl('polygon', {
        points: guideStarPoints(54, 22, 8, 3.4),
        class: 'star star-blue',
      }));
      break;
    case 'eliminators':
      svg.appendChild(guideSvgEl('circle', { cx: 36, cy: 22, r: 11, class: 'eliminator-ring' }));
      svg.appendChild(guideSvgEl('line', {
        x1: 29,
        y1: 15,
        x2: 43,
        y2: 29,
        class: 'eliminator-mark',
      }));
      svg.appendChild(guideSvgEl('line', {
        x1: 43,
        y1: 15,
        x2: 29,
        y2: 29,
        class: 'eliminator-mark',
      }));
      break;
    case 'polyominoes': {
      const drawGuidePolyomino = (tx, ty, rotateDeg = 0) => {
        const group = guideSvgEl('g', {
          transform: `translate(${tx} ${ty})`,
        });
        const piece = guideSvgEl('g', {
          transform: `rotate(${rotateDeg} 9 9)`,
        });
        const cells = [
          [0, 0],
          [0, 10],
          [10, 10],
        ];
        for (const [x, y] of cells) {
          piece.appendChild(guideSvgEl('rect', {
            x,
            y,
            width: 9,
            height: 9,
            rx: 1.5,
            class: 'polyomino-fill',
          }));
        }
        group.appendChild(piece);
        return group;
      };

      svg.appendChild(drawGuidePolyomino(9, 12, 0));
      svg.appendChild(drawGuidePolyomino(40, 12, -16));
      break;
    }
    case 'regionSizes':
      svg.appendChild(guideSvgEl('text', {
        x: 36,
        y: 24,
        class: 'region-size-value',
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        transform: 'rotate(-6 36 24)',
      })).textContent = '4';
      break;
    case 'symmetry':
      svg.appendChild(guideSvgEl('path', {
        d: 'M14 31 L14 13 L34 13',
        class: 'player-line',
      }));
      svg.appendChild(guideSvgEl('circle', { cx: 14, cy: 31, r: 7, class: 'start-node' }));
      svg.appendChild(guideSvgEl('path', {
        d: 'M58 13 L58 31 L38 31',
        class: 'mirror-line',
      }));
      svg.appendChild(guideSvgEl('circle', { cx: 58, cy: 13, r: 6, class: 'mirror-start-node' }));
      break;
    default:
      break;
  }

  wrapper.appendChild(svg);
  return wrapper;
}

function renderDebugGuide() {
  debugGuideSubtitleEl.textContent = 'Reference for every puzzle mechanic used in this game.';
  debugGuideContentEl.innerHTML = '';

  for (const item of DEBUG_GUIDE_ITEMS) {
    const article = document.createElement('article');
    article.className = 'debug-guide-item';

    const headingRow = document.createElement('div');
    headingRow.className = 'debug-guide-item-heading';

    const preview = createGuidePreview(item);

    const copy = document.createElement('div');
    copy.className = 'debug-guide-copy';

    const titleRow = document.createElement('div');
    titleRow.className = 'debug-guide-title-row';

    const title = document.createElement('h3');
    title.textContent = item.title;

    const symbol = document.createElement('span');
    symbol.className = 'debug-guide-symbol';
    symbol.textContent = item.symbol;

    const description = document.createElement('p');
    description.textContent = item.description;

    titleRow.append(title, symbol);
    copy.append(titleRow, description);
    headingRow.append(preview, copy);
    article.append(headingRow);
    debugGuideContentEl.appendChild(article);
  }
}

function showDebugGuide() {
  if (!debugMode || !levels[currentIndex] || !debugGuideEl) return;
  renderDebugGuide();
  debugGuideVisible = true;
  debugGuideEl.hidden = false;
  debugGuideEl.setAttribute('aria-hidden', 'false');
  guideBtn.setAttribute('aria-expanded', 'true');
  document.body.classList.add(DEBUG_GUIDE_OPEN_CLASS);
}

function hideDebugGuide() {
  if (!debugGuideEl) return;
  debugGuideVisible = false;
  debugGuideEl.hidden = true;
  debugGuideEl.setAttribute('aria-hidden', 'true');
  guideBtn.setAttribute('aria-expanded', 'false');
  document.body.classList.remove(DEBUG_GUIDE_OPEN_CLASS);
}

function toggleDebugGuide() {
  if (debugGuideVisible) {
    hideDebugGuide();
  } else {
    showDebugGuide();
  }
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

function setScopeViewEnabled(nextEnabled) {
  scopeViewEnabled = nextEnabled;
  localStorage.setItem(SCOPE_VIEW_ENABLED_KEY, scopeViewEnabled ? 'on' : 'off');
  applyScopeViewEnabled();
  hideMobileScope();
  syncMobileScope();
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

function fullBoardViewBox() {
  return `0 0 ${grid.svgSize} ${grid.svgSize}`;
}

function showScopeOverview() {
  if (!scopeViewActive() || !scopeRenderer) {
    hideMobileScope();
    return;
  }
  mobileScopeEl.hidden = false;
  mobileScopeEl.setAttribute('aria-hidden', 'false');
  setScopeViewBox(fullBoardViewBox(), { immediate: true });
  scopeRenderer.drawPath([], 'drawing');
  scopeRenderer.drawMirrorPath([], 'drawing');
}

function syncMobileScope(path = input?.getPath?.() || []) {
  if (!scopeViewActive() || !scopeRenderer || debugSolutionVisible) {
    hideMobileScope();
    return;
  }
  if (!input?.isTracing?.() || path.length === 0) {
    showScopeOverview();
    return;
  }

  const tip = path[path.length - 1];
  mobileScopeEl.hidden = false;
  mobileScopeEl.setAttribute('aria-hidden', 'false');
  const targetViewBox = scopeViewBoxFor(tip);
  setScopeViewBox(scopePointerActive && scopeLockedViewBox ? scopeLockedViewBox : targetViewBox, {
    immediate: !scopePointerActive,
  });
  scopeRenderer.drawPath(path, 'drawing');
  scopeRenderer.drawMirrorPath(path, 'drawing');
}

function handleScopeStep(evt) {
  if (!scopeViewActive() || !input || !grid) return;
  evt.preventDefault();
  const { node, dist } = nearestNodeFor(mobileScopeSvg, grid, evt);
  const grabRadius = grid.cellSize * 0.75;
  if (dist > grabRadius) return;
  const changed = input.isTracing() ? input.commitNode(node) : input.beginTraceAt(node);
  if (changed) {
    syncMobileScope(input.getPath());
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
  applyScopeViewEnabled();
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
  showScopeOverview();

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
  hideDebugGuide();
  puzzleTitle.textContent = `${getCollectionLabel(getCurrentCollectionKey())} Level ${currentIndex + 1} of ${levels.length}${
    debugMode ? ' (debug)' : ''
  }`;
  statusEl.textContent = alreadySolved ? 'Solved' : '';
  setGuideButtonState({ hidden: !debugMode, disabled: false, text: 'Guide' });
  setSolutionButtonState({ hidden: !debugMode, disabled: false, text: 'Show Sol.' });
  nextBtn.disabled = !alreadySolved || currentIndex >= levels.length - 1;

  setCurrentLevelIndex(save, currentIndex, getCurrentCollectionKey());
  renderPuzzleNav();
}

function handleRelease(puzzle, path) {
  const result = analyzeSolution(grid, puzzle, path);
  if (result.valid) {
    renderer.drawPath(path, 'success');
    renderer.drawMirrorPath(path, 'success');
    input.reset();
    syncMobileScope();
    markCompleted(save, puzzle.progressKey);
    statusEl.textContent = currentIndex === levels.length - 1 ? 'All levels complete!' : 'Solved!';
    nextBtn.disabled = currentIndex >= levels.length - 1;
    renderPuzzleNav();
  } else if (path.length > 1) {
    renderer.drawPath(path, 'fail');
    renderer.drawMirrorPath(path, 'fail');
    renderer.flashFailedSymbols(result.failures, FAIL_FLASH_MS);
    input.reset();
    syncMobileScope();
    setTimeout(() => {
      renderer.drawPath([]);
      renderer.drawMirrorPath([]);
    }, FAIL_FLASH_MS);
  } else {
    input.reset();
    syncMobileScope();
  }
}

function showEmptyCollectionState() {
  puzzleTitle.textContent = `${getCollectionLabel(getCurrentCollectionKey())} Levels`;
  statusEl.textContent = `No levels found in the ${getCollectionLabel(getCurrentCollectionKey())} collection.`;
  puzzleNav.innerHTML = '';
  pagerLabel.textContent = 'Page 0 of 0';
  pagerPrev.disabled = true;
  pagerNext.disabled = true;
  hideDebugGuide();
  setGuideButtonState({ hidden: true, disabled: true, text: 'Guide' });
  setSolutionButtonState({ hidden: true, disabled: true, text: 'Show Sol.' });
  nextBtn.disabled = true;
}

function hideDebugSolution({ clearStatus = false } = {}) {
  if (!renderer) return;
  debugSolutionVisible = false;
  setSolutionButtonState({ text: 'Show Sol.' });
  renderer.drawPath([]);
  renderer.drawMirrorPath([]);
  syncMobileScope();
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
  hideMobileScope();
  renderer.clearSymbolFailures();
  renderer.drawPath(solution, 'success');
  renderer.drawMirrorPath(solution, 'success');
  setSolutionButtonState({ text: 'Hide Sol.' });
  statusEl.textContent = 'Solution shown (debug)';
}

resetBtn.addEventListener('click', () => {
  if (input && renderer) {
    input.reset();
    if (debugSolutionVisible) {
      hideDebugSolution({ clearStatus: true });
    } else {
      renderer.drawPath([]);
      renderer.drawMirrorPath([]);
      syncMobileScope();
    }
    renderer.clearSymbolFailures();
  }
  if (!debugSolutionVisible) statusEl.textContent = '';
});

solutionBtn.addEventListener('click', () => {
  toggleDebugSolution();
});

guideBtn.addEventListener('click', () => {
  toggleDebugGuide();
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
  if (!scopeViewActive() || !input) return;
  beginScopePointer(evt);
  handleScopeStep(evt);
}, { passive: false });

scopeSettingsBtn.addEventListener('click', () => {
  toggleScopeSettings();
});

scopeSideRightBtn.addEventListener('click', () => {
  setScopeDock('right');
});

scopeSideLeftBtn.addEventListener('click', () => {
  setScopeDock('left');
});

scopeViewOnBtn.addEventListener('click', () => {
  setScopeViewEnabled(true);
});

scopeViewOffBtn.addEventListener('click', () => {
  setScopeViewEnabled(false);
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
});

debugGuideBackdropEl?.addEventListener('click', (evt) => {
  evt.preventDefault();
  evt.stopPropagation();
  hideDebugGuide();
});

debugGuideCloseBtn.addEventListener('click', () => {
  hideDebugGuide();
});

document.addEventListener('keydown', (evt) => {
  if (evt.key !== 'Escape') return;
  if (debugGuideVisible) {
    hideDebugGuide();
    return;
  }
  if (!scopeSettingsPanel.hidden) {
    hideScopeSettings();
  }
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
