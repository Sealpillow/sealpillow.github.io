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

const LEVELS_FILE = './src/puzzles/levels.json';

const svg = document.getElementById('board');
const puzzleTitle = document.getElementById('puzzle-title');
const puzzleNav = document.getElementById('puzzle-nav');
const pagerPrev = document.getElementById('pager-prev');
const pagerNext = document.getElementById('pager-next');
const pagerLabel = document.getElementById('pager-label');
const resetBtn = document.getElementById('reset-btn');
const nextBtn = document.getElementById('next-btn');
const statusEl = document.getElementById('status');

const NAV_PAGE_SIZE = 24;
let navPage = 0;

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

async function init() {
  levels = await loadPuzzles(LEVELS_FILE);
  save = loadSave();
  currentIndex = debugMode
    ? Math.min(Math.max(debugLevel - 1, 0), levels.length - 1)
    : Math.min(Math.max(getCurrentLevelIndex(save), 0), levels.length - 1);
  loadLevel(currentIndex);
}

function isLevelUnlocked(index) {
  return debugMode || index === 0 || save.completedPuzzles.includes(levels[index - 1].id);
}

function loadLevel(index) {
  currentIndex = index;
  const puzzle = levels[index];

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

  const alreadySolved = save.completedPuzzles.includes(puzzle.id);
  puzzleTitle.textContent = `Level ${index + 1} of ${levels.length}${debugMode ? ' (debug)' : ''}`;
  statusEl.textContent = alreadySolved ? 'Solved' : '';
  nextBtn.disabled = !alreadySolved || currentIndex >= levels.length - 1;

  setCurrentLevelIndex(save, index);
  renderPuzzleNav();
}

function handleRelease(puzzle, path) {
  const solved = validateSolution(grid, puzzle, path);
  if (solved) {
    renderer.drawPath(path, 'success');
    renderer.drawMirrorPath(path, 'success');
    input.reset();
    markCompleted(save, puzzle.id);
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

resetBtn.addEventListener('click', () => {
  input.reset();
  renderer.drawPath([]);
  renderer.drawMirrorPath([]);
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
    if (save.completedPuzzles.includes(puzzle.id)) btn.classList.add('completed');
    if (!unlocked) {
      btn.disabled = true;
      btn.title = 'Complete the previous level to unlock';
    } else {
      btn.addEventListener('click', () => loadLevel(i));
    }
    puzzleNav.appendChild(btn);
  }

  pagerLabel.textContent = `Page ${navPage + 1} of ${pageCount}`;
  pagerPrev.disabled = navPage === 0;
  pagerNext.disabled = navPage >= pageCount - 1;
}

pagerPrev.addEventListener('click', () => renderPuzzleNavPage(navPage - 1));
pagerNext.addEventListener('click', () => renderPuzzleNavPage(navPage + 1));

init();
