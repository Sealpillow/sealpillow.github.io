import { Grid } from './src/engine/Grid.js';
import { Renderer } from './src/engine/Renderer.js';
import { InputController } from './src/engine/Input.js';
import { loadPuzzles } from './src/engine/PuzzleLoader.js';
import { validateSolution } from './src/engine/Validator.js';
import {
  loadSave,
  markCompleted,
  getCurrentLevelIndex,
  setCurrentLevelIndex,
} from './src/save/SaveManager.js';

const NAV_PAGE_SIZE = 24;
const DEFAULT_COLLECTION = 'claude';
const COLLECTION_FILES = {
  claude: './src/puzzles/claude-levels.json',
  chatgpt: './src/puzzles/chatgpt-levels.json',
};

const svg = document.getElementById('board');
const puzzleTitle = document.getElementById('puzzle-title');
const puzzleNav = document.getElementById('puzzle-nav');
const levelSourceSelect = document.getElementById('level-source');
const pagerPrev = document.getElementById('pager-prev');
const pagerNext = document.getElementById('pager-next');
const pagerLabel = document.getElementById('pager-label');
const resetBtn = document.getElementById('reset-btn');
const nextBtn = document.getElementById('next-btn');
const statusEl = document.getElementById('status');

let navPage = 0;
let collections = {};
let levels = [];
let save = loadSave();
let currentIndex = 0;
let grid;
let renderer;
let input;

// Testing backdoor: index.html?level=37 jumps straight to level 37 and unlocks
// free navigation between all levels for the session, without touching real save progress.
const debugLevelParam = new URLSearchParams(window.location.search).get('level');
const debugLevel = debugLevelParam !== null ? parseInt(debugLevelParam, 10) : null;
const debugMode = Number.isInteger(debugLevel);

function cloneLevel(level, collectionKey) {
  const cloned = structuredClone(level);
  cloned.collectionKey = collectionKey;
  cloned.progressKey = `${collectionKey}::${level.id}`;
  if (collectionKey === 'claude') cloned.legacyId = level.id;
  return cloned;
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

async function init() {
  collections = await loadCollections();
  save = loadSave();
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

  if (input) input.destroy();
  input = new InputController(svg, grid, {
    onChange: (path) => {
      renderer.drawPath(path, 'drawing');
      renderer.drawMirrorPath(path, 'drawing');
    },
    onRelease: (path) => handleRelease(puzzle, path),
  });
  input.setPuzzle(puzzle);

  const alreadySolved = isPuzzleCompleted(puzzle);
  puzzleTitle.textContent = `${getCollectionLabel(getCurrentCollectionKey())} Level ${currentIndex + 1} of ${levels.length}${
    debugMode ? ' (debug)' : ''
  }`;
  statusEl.textContent = alreadySolved ? 'Solved' : '';
  nextBtn.disabled = !alreadySolved || currentIndex >= levels.length - 1;

  setCurrentLevelIndex(save, currentIndex, getCurrentCollectionKey());
  renderPuzzleNav();
}

function handleRelease(puzzle, path) {
  const solved = validateSolution(grid, puzzle, path);
  if (solved) {
    renderer.drawPath(path, 'success');
    renderer.drawMirrorPath(path, 'success');
    input.reset();
    markCompleted(save, puzzle.progressKey);
    statusEl.textContent = currentIndex === levels.length - 1 ? 'All levels complete!' : 'Solved!';
    nextBtn.disabled = currentIndex >= levels.length - 1;
    renderPuzzleNav();
  } else if (path.length > 1) {
    renderer.drawPath(path, 'fail');
    renderer.drawMirrorPath(path, 'fail');
    input.reset();
    setTimeout(() => {
      renderer.drawPath([]);
      renderer.drawMirrorPath([]);
    }, 300);
  } else {
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
  nextBtn.disabled = true;
}

resetBtn.addEventListener('click', () => {
  if (input && renderer) {
    input.reset();
    renderer.drawPath([]);
    renderer.drawMirrorPath([]);
  }
  statusEl.textContent = '';
});

nextBtn.addEventListener('click', () => {
  if (currentIndex < levels.length - 1) {
    loadLevel(currentIndex + 1);
  }
});

function renderPuzzleNav() {
  renderPuzzleNavPage(Math.floor(currentIndex / NAV_PAGE_SIZE));
}

function renderPuzzleNavPage(page) {
  if (levels.length === 0) {
    showEmptyCollectionState();
    return;
  }

  const pageCount = Math.ceil(levels.length / NAV_PAGE_SIZE);
  navPage = Math.max(0, Math.min(page, pageCount - 1));
  const start = navPage * NAV_PAGE_SIZE;
  const end = Math.min(start + NAV_PAGE_SIZE, levels.length);

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

init();
