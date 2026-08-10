import { Grid } from '../src/engine/Grid.js';
import { Renderer } from '../src/engine/Renderer.js';
import { InputController } from '../src/engine/Input.js';
import { analyzeSolution } from '../src/engine/Validator.js';
import { countSolutions } from '../src/engine/SolutionCounter.js';
import { findSolutionPaths } from '../src/engine/Solver.js';
import { POLYOMINO_SHAPES } from '../src/engine/Polyominoes.js';
import { loadPuzzles } from '../src/engine/PuzzleLoader.js';

const COLORS = ['black', 'white', 'blue'];
const CORNER_ORIENTATIONS = ['ur', 'ul', 'dr', 'dl'];
const POLYOMINO_SHAPE_NAMES = Object.keys(POLYOMINO_SHAPES);
const DIRECTIONAL_FIELDS = ['turnNodes', 'straightNodes', 'horizontalNodes', 'verticalNodes', 'cornerNodes'];
const CELL_FIELDS = ['triangles', 'cellColors', 'stars', 'eliminators', 'polyominoes', 'regionSizes'];
const EDGE_FIELDS = ['blockedEdges', 'requiredEdges'];
const NODE_LIST_FIELDS = ['dots', 'exits', ...DIRECTIONAL_FIELDS];
const SOLVER_CAP = 200;
const SOLVER_MAX_EXPANSIONS = 300000;
const SHOWN_SOLUTION_CAP_DEFAULT = 20;
const SHOWN_SOLUTION_CAP_MAX = 50;
const SOLVE_DEBOUNCE_MS = 150;
const FAIL_FLASH_MS = 1400;
const TOAST_MS = 1800;

const FIELD_LABELS = {
  start: 'Start',
  exits: 'Exit',
  dots: 'Dot',
  turnNodes: 'Turn Node',
  straightNodes: 'Straight Node',
  horizontalNodes: 'Horizontal Node',
  verticalNodes: 'Vertical Node',
  cornerNodes: 'Corner Node',
  blockedEdges: 'Blocked Edge',
  requiredEdges: 'Required Edge',
  triangles: 'Triangle',
  cellColors: 'Colored Region',
  stars: 'Star',
  eliminators: 'Eliminator',
  polyominoes: 'Polyomino',
  regionSizes: 'Region Size',
  erase: 'Erase',
};

const TOOLS = {
  start: { target: 'node' },
  exits: { target: 'node' },
  dots: { target: 'node' },
  turnNodes: { target: 'node' },
  straightNodes: { target: 'node' },
  horizontalNodes: { target: 'node' },
  verticalNodes: { target: 'node' },
  cornerNodes: { target: 'node', param: 'orientation' },
  blockedEdges: { target: 'edge' },
  requiredEdges: { target: 'edge' },
  triangles: { target: 'cell', param: 'count' },
  cellColors: { target: 'cell', param: 'color' },
  stars: { target: 'cell', param: 'color' },
  eliminators: { target: 'cell' },
  polyominoes: { target: 'cell', param: 'poly' },
  regionSizes: { target: 'cell', param: 'value' },
  erase: { target: 'any' },
};

const svg = document.getElementById('board');
const idInput = document.getElementById('puzzle-id');
const widthInput = document.getElementById('puzzle-width');
const heightInput = document.getElementById('puzzle-height');
const resizeBtn = document.getElementById('resize-btn');
const loadExistingSelect = document.getElementById('load-existing-select');
const newPuzzleBtn = document.getElementById('new-puzzle-btn');
const paletteButtons = [...document.querySelectorAll('.palette-btn')];
const toolOptionsEl = document.getElementById('tool-options');
const activeToolLabel = document.getElementById('active-tool-label');
const designerToastEl = document.getElementById('designer-toast');
const playtestToggleBtn = document.getElementById('playtest-toggle');
const resetPathBtn = document.getElementById('reset-path-btn');
const playtestStatusEl = document.getElementById('playtest-status');
const solverStatusEl = document.getElementById('solver-status');
const showSolutionBtn = document.getElementById('show-solution-btn');
const solutionLimitInput = document.getElementById('solution-limit');
const warningsListEl = document.getElementById('warnings-list');
const exportJsonEl = document.getElementById('export-json');
const copyJsonBtn = document.getElementById('copy-json-btn');
const downloadJsonBtn = document.getElementById('download-json-btn');
const importJsonEl = document.getElementById('import-json');
const loadJsonBtn = document.getElementById('load-json-btn');
const importErrorEl = document.getElementById('import-error');
const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');
const designerSidebarEl = document.getElementById('designer-sidebar');

function defaultPuzzle() {
  return {
    id: 'custom_level',
    width: 4,
    height: 4,
    start: [0, 0],
    exits: [[4, 4]],
  };
}

let puzzle = defaultPuzzle();
let grid = new Grid(puzzle.width, puzzle.height);
let renderer = new Renderer(svg, grid);
let activeTool = 'start';
let toolParams = {
  count: 2,
  color: 'black',
  orientation: 'ur',
  shape: POLYOMINO_SHAPE_NAMES[0],
  rotationSteps: 0,
  rotatable: true,
  value: 3,
};
let playtestActive = false;
let playtestInput = null;
let shownSolutions = [];
let shownSolutionIndex = 0;
let puzzleDirty = false;
let solveTimer = 0;
let toastTimer = 0;
let existingLevelsById = new Map();

function clampInt(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function nodeEq(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

function withinNodeBounds(node) {
  return node[0] >= 0 && node[0] <= grid.width && node[1] >= 0 && node[1] <= grid.height;
}

function withinCellBounds([col, row]) {
  return col >= 0 && col < grid.width && row >= 0 && row < grid.height;
}

function svgPointFromEvent(evt) {
  const rect = svg.getBoundingClientRect();
  const scaleX = grid.svgSize / rect.width;
  const scaleY = grid.svgSize / rect.height;
  return {
    x: (evt.clientX - rect.left) * scaleX,
    y: (evt.clientY - rect.top) * scaleY,
  };
}

function nearestNode(point) {
  let closest = null;
  let bestDist = Infinity;
  for (const node of grid.allNodes()) {
    const p = grid.nodeToPoint(node);
    const dist = Math.hypot(p.x - point.x, p.y - point.y);
    if (dist < bestDist) {
      bestDist = dist;
      closest = node;
    }
  }
  return { node: closest, dist: bestDist };
}

function allEdges() {
  const edges = [];
  for (const node of grid.allNodes()) {
    const [col, row] = node;
    if (col < grid.width) edges.push([node, [col + 1, row]]);
    if (row < grid.height) edges.push([node, [col, row + 1]]);
  }
  return edges;
}

function pointToSegmentDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  let t = lengthSq === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

function nearestEdge(point) {
  let closest = null;
  let bestDist = Infinity;
  for (const edge of allEdges()) {
    const a = grid.nodeToPoint(edge[0]);
    const b = grid.nodeToPoint(edge[1]);
    const dist = pointToSegmentDistance(point, a, b);
    if (dist < bestDist) {
      bestDist = dist;
      closest = edge;
    }
  }
  return { edge: closest, dist: bestDist };
}

function nearestCell(point) {
  const col = Math.floor((point.x - grid.padding) / grid.cellSize);
  const row = Math.floor((point.y - grid.padding) / grid.cellSize);
  if (col < 0 || col >= grid.width || row < 0 || row >= grid.height) return null;
  return [col, row];
}

function showToast(message) {
  designerToastEl.textContent = message;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    designerToastEl.textContent = '';
  }, TOAST_MS);
}

function toggleInNodeList(field, node) {
  puzzle[field] = puzzle[field] || [];
  const idx = puzzle[field].findIndex((n) => nodeEq(n, node));
  if (idx >= 0) puzzle[field].splice(idx, 1);
  else puzzle[field].push(node);
}

function removeDirectionalNode(node) {
  const key = grid.nodeKey(node);
  for (const field of DIRECTIONAL_FIELDS) {
    if (!puzzle[field]) continue;
    puzzle[field] = puzzle[field].filter((n) => grid.nodeKey(n) !== key);
  }
}

function directionalFieldAt(node) {
  const key = grid.nodeKey(node);
  return DIRECTIONAL_FIELDS.find((field) => (puzzle[field] || []).some((n) => grid.nodeKey(n) === key)) || null;
}

function applyDirectionalNode(field, node) {
  const existing = directionalFieldAt(node);

  if (field === 'cornerNodes') {
    const key = grid.nodeKey(node);
    const currentEntry = existing === 'cornerNodes' ? (puzzle.cornerNodes || []).find((n) => grid.nodeKey(n) === key) : null;
    removeDirectionalNode(node);
    if (currentEntry && currentEntry[2] === toolParams.orientation) return;
    puzzle.cornerNodes = puzzle.cornerNodes || [];
    puzzle.cornerNodes.push([node[0], node[1], toolParams.orientation]);
    return;
  }

  removeDirectionalNode(node);
  if (existing === field) return;
  puzzle[field] = puzzle[field] || [];
  puzzle[field].push(node);
}

function applyNodeTool(field, node) {
  puzzleDirty = true;
  if (field === 'exits' || field === 'dots') {
    toggleInNodeList(field, node);
    return;
  }
  applyDirectionalNode(field, node);
}

function applyEdgeTool(field, edge) {
  puzzleDirty = true;
  const key = grid.edgeKey(edge[0], edge[1]);
  const other = field === 'blockedEdges' ? 'requiredEdges' : 'blockedEdges';
  const hasSame = (puzzle[field] || []).some((e) => grid.edgeKey(e[0], e[1]) === key);
  puzzle[other] = (puzzle[other] || []).filter((e) => grid.edgeKey(e[0], e[1]) !== key);
  puzzle[field] = (puzzle[field] || []).filter((e) => grid.edgeKey(e[0], e[1]) !== key);
  if (!hasSame) puzzle[field].push(edge);
}

function cellValueFor(field, cell) {
  const [col, row] = cell;
  switch (field) {
    case 'triangles':
      return [col, row, toolParams.count];
    case 'cellColors':
      return [col, row, toolParams.color];
    case 'stars':
      return [col, row, toolParams.color];
    case 'eliminators':
      return [col, row];
    case 'polyominoes':
      return [col, row, toolParams.shape, toolParams.rotationSteps, toolParams.rotatable];
    case 'regionSizes':
      return [col, row, toolParams.value];
    default:
      return null;
  }
}

function cellFieldAt(cell) {
  for (const field of CELL_FIELDS) {
    const list = puzzle[field] || [];
    const idx = list.findIndex((entry) => entry[0] === cell[0] && entry[1] === cell[1]);
    if (idx >= 0) return { field, index: idx, entry: list[idx] };
  }
  return null;
}

function valuesEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function applyCellTool(field, cell) {
  puzzleDirty = true;
  const occupied = cellFieldAt(cell);
  const nextValue = cellValueFor(field, cell);

  if (occupied) {
    if (occupied.field !== field) {
      showToast(`That cell already has a ${FIELD_LABELS[occupied.field]} — erase it first.`);
      return;
    }
    if (valuesEqual(occupied.entry, nextValue)) {
      puzzle[field].splice(occupied.index, 1);
      return;
    }
    puzzle[field][occupied.index] = nextValue;
    return;
  }

  puzzle[field] = puzzle[field] || [];
  puzzle[field].push(nextValue);
}

function eraseNode(node) {
  const key = grid.nodeKey(node);
  puzzle.exits = (puzzle.exits || []).filter((n) => grid.nodeKey(n) !== key);
  puzzle.dots = (puzzle.dots || []).filter((n) => grid.nodeKey(n) !== key);
  removeDirectionalNode(node);
}

function eraseEdge(edge) {
  const key = grid.edgeKey(edge[0], edge[1]);
  for (const field of EDGE_FIELDS) {
    puzzle[field] = (puzzle[field] || []).filter((e) => grid.edgeKey(e[0], e[1]) !== key);
  }
}

function eraseCell(cell) {
  for (const field of CELL_FIELDS) {
    puzzle[field] = (puzzle[field] || []).filter((entry) => !(entry[0] === cell[0] && entry[1] === cell[1]));
  }
}

function eraseAt(point) {
  puzzleDirty = true;
  const { node, dist: nodeDist } = nearestNode(point);
  if (nodeDist <= grid.cellSize * 0.35) {
    eraseNode(node);
    return;
  }
  const { edge, dist: edgeDist } = nearestEdge(point);
  if (edgeDist <= grid.cellSize * 0.22) {
    eraseEdge(edge);
    return;
  }
  const cell = nearestCell(point);
  if (cell) eraseCell(cell);
}

function handleBoardClick(evt) {
  if (playtestActive) return;
  const point = svgPointFromEvent(evt);

  if (activeTool === 'start') {
    const { node, dist } = nearestNode(point);
    if (dist > grid.cellSize * 0.6) return;
    puzzle.start = node;
    puzzleDirty = true;
    afterEdit();
    return;
  }

  if (activeTool === 'erase') {
    eraseAt(point);
    afterEdit();
    return;
  }

  const meta = TOOLS[activeTool];
  if (!meta) return;

  if (meta.target === 'node') {
    const { node, dist } = nearestNode(point);
    if (dist > grid.cellSize * 0.6) return;
    applyNodeTool(activeTool, node);
  } else if (meta.target === 'edge') {
    const { edge, dist } = nearestEdge(point);
    if (dist > grid.cellSize * 0.32) return;
    applyEdgeTool(activeTool, edge);
  } else if (meta.target === 'cell') {
    const cell = nearestCell(point);
    if (!cell) return;
    applyCellTool(activeTool, cell);
  }

  afterEdit();
}

function pruneOutOfBounds() {
  for (const field of NODE_LIST_FIELDS) {
    if (field === 'cornerNodes' || !puzzle[field]) continue;
    puzzle[field] = puzzle[field].filter(withinNodeBounds);
  }
  if (puzzle.cornerNodes) {
    puzzle.cornerNodes = puzzle.cornerNodes.filter((n) => withinNodeBounds(n));
  }
  for (const field of EDGE_FIELDS) {
    if (!puzzle[field]) continue;
    puzzle[field] = puzzle[field].filter(([a, b]) => withinNodeBounds(a) && withinNodeBounds(b));
  }
  for (const field of CELL_FIELDS) {
    if (!puzzle[field]) continue;
    puzzle[field] = puzzle[field].filter((entry) => withinCellBounds([entry[0], entry[1]]));
  }
}

function resizePuzzle(newWidth, newHeight) {
  puzzleDirty = true;
  stopPlaytest();
  puzzle.width = newWidth;
  puzzle.height = newHeight;
  grid = new Grid(newWidth, newHeight);
  pruneOutOfBounds();
  if (!withinNodeBounds(puzzle.start)) puzzle.start = [0, 0];
  if (!(puzzle.exits || []).some(withinNodeBounds)) puzzle.exits = [[newWidth, newHeight]];
  renderer = new Renderer(svg, grid);
  afterEdit();
}

function puzzleForExport() {
  const cleaned = {
    id: puzzle.id || 'custom_level',
    width: puzzle.width,
    height: puzzle.height,
    start: puzzle.start,
    exits: puzzle.exits && puzzle.exits.length ? puzzle.exits : [],
  };
  for (const field of [...NODE_LIST_FIELDS, ...EDGE_FIELDS, ...CELL_FIELDS]) {
    if (field === 'exits') continue;
    if (puzzle[field] && puzzle[field].length > 0) cleaned[field] = puzzle[field];
  }
  return cleaned;
}

function refreshExportJson() {
  exportJsonEl.value = JSON.stringify(puzzleForExport(), null, 2);
}

function refreshWarnings() {
  const warnings = [];

  const hasTriangle4 = (puzzle.triangles || []).some(([, , count]) => count === 4);
  if (hasTriangle4 && (puzzle.eliminators || []).length === 0) {
    warnings.push('A triangle has count 4, but there are no eliminators anywhere — count 4 is unsatisfiable without one in the same region.');
  }

  if ((puzzle.regionSizes || []).length > 0 && (puzzle.eliminators || []).length > 0) {
    warnings.push('Region Sizes + Eliminators together: eliminators cannot cancel a region-size number, so combine with care.');
  }

  warningsListEl.innerHTML = '';
  for (const warning of warnings) {
    const li = document.createElement('li');
    li.textContent = warning;
    warningsListEl.appendChild(li);
  }
}

function scheduleSolve() {
  solverStatusEl.textContent = 'Solving…';
  solverStatusEl.classList.remove('solver-ok', 'solver-bad');
  if (solveTimer) clearTimeout(solveTimer);
  solveTimer = setTimeout(runSolve, SOLVE_DEBOUNCE_MS);
}

function runSolve() {
  const result = countSolutions(puzzle, SOLVER_CAP, SOLVER_MAX_EXPANSIONS);
  if (result.truncated) {
    solverStatusEl.textContent = `Truncated — search budget hit (≥${result.count} found so far). Simplify the board or raise the cap.`;
  } else if (result.count === 0) {
    solverStatusEl.textContent = 'Unsolvable — 0 valid solutions.';
    solverStatusEl.classList.add('solver-bad');
  } else if (result.hitCap) {
    solverStatusEl.textContent = `${SOLVER_CAP}+ solutions (capped).`;
  } else {
    solverStatusEl.textContent = `${result.count} solution${result.count === 1 ? '' : 's'}.`;
    solverStatusEl.classList.add('solver-ok');
  }
}

function sameSolutionPath(a, b) {
  return a.length === b.length && a.every(([col, row], i) => col === b[i][0] && row === b[i][1]);
}

function dedupeSolutions(paths, cap) {
  const solutions = [];
  for (const path of paths) {
    if (solutions.length >= cap) break;
    if (solutions.some((existing) => sameSolutionPath(existing, path))) continue;
    solutions.push(path);
  }
  return solutions;
}

// User-adjustable, but clamped to SHOWN_SOLUTION_CAP_MAX - an open/lightly-constrained board can
// have a combinatorially huge number of valid paths (see countSolutions' own "200+ (capped)"
// message), so an unbounded search here could hang the tab. Clamping (rather than rejecting) and
// writing the corrected value back means a stray typed value never silently gets ignored.
function getShownSolutionCap() {
  const parsed = parseInt(solutionLimitInput.value, 10);
  const cap = clampInt(parsed, 1, SHOWN_SOLUTION_CAP_MAX);
  solutionLimitInput.value = String(cap);
  return cap;
}

// Generator-produced levels carry their own already-computed solutionPaths (see
// scripts/level-generator.mjs) - reading that field means a freshly loaded level shows a solution
// instantly and reliably, even on the dense 101+ boards where a live budget-capped DFS can fail
// outright (see src/engine/Solver.js's sortTowardExits comment). Only trusted while the puzzle
// hasn't been edited since load - any designer mutation flips puzzleDirty and forces a live search.
function collectShownSolutions() {
  const cap = getShownSolutionCap();
  if (!puzzleDirty && puzzle.solutionPaths && puzzle.solutionPaths.length) {
    return dedupeSolutions(puzzle.solutionPaths, cap);
  }
  return dedupeSolutions(findSolutionPaths(puzzle, cap, SOLVER_MAX_EXPANSIONS), cap);
}

function hideSolution() {
  if (!shownSolutions.length) return;
  shownSolutions = [];
  shownSolutionIndex = 0;
  showSolutionBtn.textContent = 'Show Solution';
  renderer.drawPath([]);
  renderer.drawMirrorPath([]);
}

function renderShownSolution(index) {
  shownSolutionIndex = index;
  const solution = shownSolutions[index];
  renderer.drawPath(solution, 'success');
  renderer.drawMirrorPath(solution, 'success');
  showSolutionBtn.textContent = shownSolutions.length > 1
    ? `Sol. ${index + 1}/${shownSolutions.length}`
    : 'Hide Solution';
}

// Clicking while a solution is already shown cycles to the next distinct one (wrapping back
// around to hidden after the last), mirroring the game's own "Show Sol." debug control.
function toggleSolution() {
  if (playtestActive) return;

  if (shownSolutions.length) {
    const nextIndex = shownSolutionIndex + 1;
    if (nextIndex >= shownSolutions.length) {
      hideSolution();
      return;
    }
    renderShownSolution(nextIndex);
    return;
  }

  const solutions = collectShownSolutions();

  if (!solutions.length) {
    showToast('No solution found.');
    return;
  }

  shownSolutions = solutions;
  renderShownSolution(0);
}

function afterEdit() {
  hideSolution();
  renderer.setPuzzle(puzzle);
  refreshExportJson();
  refreshWarnings();
  scheduleSolve();
}

function disablePaletteInteraction(disabled) {
  paletteButtons.forEach((btn) => {
    btn.disabled = disabled;
  });
  resizeBtn.disabled = disabled;
  newPuzzleBtn.disabled = disabled;
  loadExistingSelect.disabled = disabled;
  loadJsonBtn.disabled = disabled;
  showSolutionBtn.disabled = disabled;
}

function startPlaytest() {
  hideSolution();
  playtestActive = true;
  playtestToggleBtn.textContent = 'Stop Play Test';
  resetPathBtn.hidden = false;
  playtestStatusEl.textContent = '';
  disablePaletteInteraction(true);

  playtestInput = new InputController(svg, grid, {
    onChange: (path) => {
      renderer.drawPath(path, 'drawing');
      renderer.drawMirrorPath(path, 'drawing');
    },
    onRelease: (path) => {
      const result = analyzeSolution(grid, puzzle, path);
      if (result.valid) {
        renderer.drawPath(path, 'success');
        renderer.drawMirrorPath(path, 'success');
        playtestStatusEl.textContent = 'Solved!';
        playtestInput.reset();
      } else if (path.length > 1) {
        renderer.drawPath(path, 'fail');
        renderer.drawMirrorPath(path, 'fail');
        renderer.flashFailedSymbols(result.failures, FAIL_FLASH_MS);
        playtestStatusEl.textContent = 'Not valid yet — see the highlighted symbols.';
        playtestInput.reset();
        setTimeout(() => {
          renderer.drawPath([]);
          renderer.drawMirrorPath([]);
        }, FAIL_FLASH_MS);
      } else {
        playtestInput.reset();
      }
    },
  });
  playtestInput.setPuzzle(puzzle);
}

function stopPlaytest() {
  if (!playtestActive) return;
  if (playtestInput) {
    playtestInput.destroy();
    playtestInput = null;
  }
  playtestActive = false;
  playtestToggleBtn.textContent = 'Play Test';
  resetPathBtn.hidden = true;
  playtestStatusEl.textContent = '';
  disablePaletteInteraction(false);
  renderer.drawPath([]);
  renderer.drawMirrorPath([]);
}

function buildLabel(text) {
  const p = document.createElement('p');
  p.className = 'tool-options-label';
  p.textContent = text;
  return p;
}

function buildNumberStepper(min, max, value, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'stepper';
  const input = document.createElement('input');
  input.type = 'number';
  input.min = String(min);
  input.max = String(max);
  input.value = String(value);
  input.addEventListener('input', () => {
    onChange(clampInt(parseInt(input.value, 10), min, max));
  });
  wrap.appendChild(input);
  return wrap;
}

function buildColorPicker(value, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'swatch-row';
  for (const color of COLORS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `swatch swatch-${color}${color === value ? ' active' : ''}`;
    btn.title = color;
    btn.addEventListener('click', () => {
      onChange(color);
      wrap.querySelectorAll('.swatch').forEach((el) => el.classList.remove('active'));
      btn.classList.add('active');
    });
    wrap.appendChild(btn);
  }
  return wrap;
}

function buildOrientationPicker(value, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'swatch-row';
  for (const orientation of CORNER_ORIENTATIONS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `orientation-btn${orientation === value ? ' active' : ''}`;
    btn.textContent = orientation;
    btn.addEventListener('click', () => {
      onChange(orientation);
      wrap.querySelectorAll('.orientation-btn').forEach((el) => el.classList.remove('active'));
      btn.classList.add('active');
    });
    wrap.appendChild(btn);
  }
  return wrap;
}

function buildPolyominoOptions() {
  const container = document.createElement('div');
  container.className = 'poly-options';

  container.appendChild(buildLabel('Shape'));
  const shapeSelect = document.createElement('select');
  for (const shape of POLYOMINO_SHAPE_NAMES) {
    const opt = document.createElement('option');
    opt.value = shape;
    opt.textContent = shape;
    if (shape === toolParams.shape) opt.selected = true;
    shapeSelect.appendChild(opt);
  }
  shapeSelect.addEventListener('change', () => {
    toolParams.shape = shapeSelect.value;
  });
  container.appendChild(shapeSelect);

  const rotatableLabel = document.createElement('label');
  rotatableLabel.className = 'toolbar-checkbox';
  const rotatableInput = document.createElement('input');
  rotatableInput.type = 'checkbox';
  rotatableInput.checked = toolParams.rotatable;
  rotatableLabel.appendChild(rotatableInput);
  rotatableLabel.appendChild(document.createTextNode('Rotatable (slanted)'));
  container.appendChild(rotatableLabel);

  const rotationStepWrap = document.createElement('div');
  rotationStepWrap.hidden = toolParams.rotatable;
  rotationStepWrap.appendChild(buildLabel('Rotation steps (0-3)'));
  rotationStepWrap.appendChild(buildNumberStepper(0, 3, toolParams.rotationSteps, (v) => {
    toolParams.rotationSteps = v;
  }));
  container.appendChild(rotationStepWrap);

  rotatableInput.addEventListener('change', () => {
    toolParams.rotatable = rotatableInput.checked;
    rotationStepWrap.hidden = rotatableInput.checked;
  });

  return container;
}

function renderToolOptions() {
  toolOptionsEl.innerHTML = '';
  const meta = TOOLS[activeTool];
  if (!meta || !meta.param) {
    toolOptionsEl.hidden = true;
    return;
  }
  toolOptionsEl.hidden = false;

  if (meta.param === 'count') {
    toolOptionsEl.appendChild(buildLabel('Triangle count (4 needs an eliminator)'));
    toolOptionsEl.appendChild(buildNumberStepper(1, 4, toolParams.count, (v) => {
      toolParams.count = v;
    }));
  } else if (meta.param === 'color') {
    toolOptionsEl.appendChild(buildLabel('Color'));
    toolOptionsEl.appendChild(buildColorPicker(toolParams.color, (c) => {
      toolParams.color = c;
    }));
  } else if (meta.param === 'orientation') {
    toolOptionsEl.appendChild(buildLabel('Orientation'));
    toolOptionsEl.appendChild(buildOrientationPicker(toolParams.orientation, (o) => {
      toolParams.orientation = o;
    }));
  } else if (meta.param === 'value') {
    toolOptionsEl.appendChild(buildLabel('Region size value (prefer 2-5)'));
    toolOptionsEl.appendChild(buildNumberStepper(1, 9, toolParams.value, (v) => {
      toolParams.value = v;
    }));
  } else if (meta.param === 'poly') {
    toolOptionsEl.appendChild(buildPolyominoOptions());
  }
}

function setActiveTool(tool) {
  activeTool = tool;
  paletteButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.tool === tool));
  activeToolLabel.textContent = `Tool: ${FIELD_LABELS[tool]}`;
  renderToolOptions();
}

function loadPuzzleIntoDesigner(data) {
  stopPlaytest();
  puzzleDirty = false;
  puzzle = structuredClone(data);
  puzzle.width = puzzle.width ?? 4;
  puzzle.height = puzzle.height ?? 4;
  puzzle.start = puzzle.start ?? [0, 0];
  puzzle.exits = puzzle.exits ?? [];
  grid = new Grid(puzzle.width, puzzle.height);
  renderer = new Renderer(svg, grid);
  idInput.value = puzzle.id || 'custom_level';
  widthInput.value = puzzle.width;
  heightInput.value = puzzle.height;
  afterEdit();
}

async function loadExistingLevelOptions() {
  try {
    const standard = await loadPuzzles('../src/puzzles/levels.json');
    populateLoadGroup('Levels', standard);
  } catch (err) {
    console.error('Failed to load existing levels for the designer picker:', err);
  }
}

function populateLoadGroup(label, levels) {
  const group = document.createElement('optgroup');
  group.label = label;
  for (const level of levels) {
    const key = `${label}::${level.id}`;
    existingLevelsById.set(key, level);
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = level.id;
    group.appendChild(opt);
  }
  loadExistingSelect.appendChild(group);
}

svg.addEventListener('pointerdown', (evt) => {
  if (playtestActive) return;
  evt.preventDefault();
  handleBoardClick(evt);
});

paletteButtons.forEach((btn) => {
  btn.addEventListener('click', () => setActiveTool(btn.dataset.tool));
});

resizeBtn.addEventListener('click', () => {
  const w = clampInt(parseInt(widthInput.value, 10), 1, 8);
  const h = clampInt(parseInt(heightInput.value, 10), 1, 8);
  widthInput.value = w;
  heightInput.value = h;
  resizePuzzle(w, h);
});

idInput.addEventListener('input', () => {
  puzzle.id = idInput.value;
  refreshExportJson();
});

newPuzzleBtn.addEventListener('click', () => {
  loadPuzzleIntoDesigner(defaultPuzzle());
});

loadExistingSelect.addEventListener('change', () => {
  const key = loadExistingSelect.value;
  if (!key) return;
  const level = existingLevelsById.get(key);
  if (level) loadPuzzleIntoDesigner(level);
  loadExistingSelect.value = '';
});

playtestToggleBtn.addEventListener('click', () => {
  if (playtestActive) stopPlaytest();
  else startPlaytest();
});

showSolutionBtn.addEventListener('click', toggleSolution);

solutionLimitInput.addEventListener('change', () => {
  getShownSolutionCap();
  hideSolution();
});

function openSidebarDrawer() {
  designerSidebarEl.classList.add('open');
  sidebarBackdrop.hidden = false;
  sidebarToggleBtn.setAttribute('aria-expanded', 'true');
}

function closeSidebarDrawer() {
  designerSidebarEl.classList.remove('open');
  sidebarBackdrop.hidden = true;
  sidebarToggleBtn.setAttribute('aria-expanded', 'false');
}

sidebarToggleBtn.addEventListener('click', () => {
  if (designerSidebarEl.classList.contains('open')) closeSidebarDrawer();
  else openSidebarDrawer();
});

sidebarBackdrop.addEventListener('click', closeSidebarDrawer);

resetPathBtn.addEventListener('click', () => {
  if (!playtestInput) return;
  playtestInput.reset();
  renderer.drawPath([]);
  renderer.drawMirrorPath([]);
  playtestStatusEl.textContent = '';
});

copyJsonBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(exportJsonEl.value);
    showToast('Copied JSON to clipboard.');
  } catch {
    exportJsonEl.select();
    showToast('Clipboard blocked — JSON selected, copy manually (Ctrl+C).');
  }
});

downloadJsonBtn.addEventListener('click', () => {
  const blob = new Blob([exportJsonEl.value], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${puzzle.id || 'puzzle'}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

loadJsonBtn.addEventListener('click', () => {
  try {
    const parsed = JSON.parse(importJsonEl.value);
    loadPuzzleIntoDesigner(parsed);
    importErrorEl.textContent = '';
  } catch (err) {
    importErrorEl.textContent = `Invalid JSON: ${err.message}`;
  }
});

solutionLimitInput.max = String(SHOWN_SOLUTION_CAP_MAX);
solutionLimitInput.value = String(SHOWN_SOLUTION_CAP_DEFAULT);

setActiveTool('start');
afterEdit();
loadExistingLevelOptions();
