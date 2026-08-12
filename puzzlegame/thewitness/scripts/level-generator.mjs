// Shared, browser-safe puzzle generation logic for the standard level collection (levels 1-300).
// No Node-specific APIs here (no fs/process) so this can run both under Node (via
// scripts/generate-levels.mjs) and inside a browser page for environments without Node.
//
// Design brief (per project direction):
// - <=2 pure introduction levels per mechanic, all 15 mechanics (the 9 original core mechanics
//   plus the node-direction family and Region Size Numbers pulled forward instead of deferred to
//   a later block).
// - Every level after the intro phase must simultaneously have >=2 distinct Node-type mechanics,
//   >=1 Edge-type mechanic, and >=2 distinct Cell-type mechanics active at once - a hard floor,
//   not a target. Symmetry (Global) is layered in "whenever" - probabilistically, growing more
//   common in later bands, never mandatory.
// - Exponential difficulty: solution-count ceiling roughly halves band over band (a steeper curve
//   than a gradual linear/staged ramp), with board size and mechanic density growing in the later
//   bands to sustain that even as ceilings approach 1.
import { Grid } from '../src/engine/Grid.js';
import { validateSolution } from '../src/engine/Validator.js';
import { computeRegions, combinedTraveledEdges } from '../src/engine/Regions.js';
import { POLYOMINO_ROTATIONS } from '../src/engine/Polyominoes.js';
import { countSolutions } from '../src/engine/SolutionCounter.js';
import { findSolutionPaths } from '../src/engine/Solver.js';

const MAX_STORED_SOLUTIONS = 3;

function sameSolutionPath(a, b) {
  return a.length === b.length && a.every(([col, row], i) => col === b[i][0] && row === b[i][1]);
}

// Called once per level at generation time (not at debug-view time) so "Show Sol." never has to
// run any search of its own - every stored path is read straight off the puzzle. `path` is always
// entry 0: the one the generator itself already proved solvable via validateSolution above, so it
// never depends on this search succeeding. The search itself reuses the same budgeted
// findSolutionPaths the live debug control used to call on every view - running it once here,
// during generation, instead of on every player's first click is the entire point of this change.
// `cap` defaults to MAX_STORED_SOLUTIONS (every tier-0-3 level); the multi-solution phase (see
// finalizeMultiSolutionLevel) passes a higher cap since it needs to know roughly how many DISTINCT
// solutions actually exist, not just enough to fill a debug cycling button.
function collectStoredSolutions(puzzle, path, cap = MAX_STORED_SOLUTIONS) {
  const solutions = [path];
  const extra = findSolutionPaths(puzzle, cap, 400000);
  for (const candidate of extra) {
    if (solutions.length >= cap) break;
    if (solutions.some((existing) => sameSolutionPath(existing, candidate))) continue;
    solutions.push(candidate);
  }
  return solutions;
}

// The multi-solution phase's whole point is a different win condition (main.js requires the
// player to find requiredSolutions DISTINCT valid paths, not just one) - this is where that number
// gets set, from how many the generator itself can actually find. MAX_MULTI_SOLUTION_SEARCH (10)
// is deliberately far above REQUIRED_SOLUTIONS_CAP (3): searching wider gives a more honest signal
// of how open the board really is, even though the required count itself is capped low so the
// player is never asked to exhaustively find every last one - "prove there's more than one way",
// not "find all of them". Uses countSolutions from SolutionCounter.js? No - deliberately does NOT:
// that function has no goal-direction heuristic (unlike findSolutionPaths, see Solver.js's
// sortTowardExits) and empirically comes back truncated/undercounting on these same dense boards,
// even though a solution is guaranteed to exist (piloted before writing this - see project memory
// for the comparison). findSolutionPaths is the one already proven reliable across all 200 live
// levels, so it's what this reuses too, just with a taller cap.
const MAX_MULTI_SOLUTION_SEARCH = 10;
const REQUIRED_SOLUTIONS_CAP = 3;

function finalizeMultiSolutionLevel(puzzle) {
  const solutions = collectStoredSolutions(puzzle, puzzle.solutionPaths[0], MAX_MULTI_SOLUTION_SEARCH);
  puzzle.solutionPaths = solutions;
  puzzle.requiredSolutions = Math.max(1, Math.min(REQUIRED_SOLUTIONS_CAP, Math.ceil(solutions.length / 3)));
  return puzzle;
}

export const NODE_MECHANICS = ['dots', 'turnNodes', 'straightNodes', 'horizontalNodes', 'verticalNodes', 'cornerNodes'];
export const EDGE_MECHANICS = ['blockedEdges', 'requiredEdges'];
export const CELL_MECHANICS = ['triangles', 'cellColors', 'stars', 'eliminators', 'polyominoes', 'regionSizes'];
export const COLORS = ['gold', 'white', 'blue'];

const SHAPE_LOOKUP = buildShapeLookup();

function buildShapeLookup() {
  const lookup = [];
  for (const [name, rotations] of Object.entries(POLYOMINO_ROTATIONS)) {
    rotations.forEach((shape, rotationSteps) => {
      lookup.push({ name, rotationSteps, signature: cellSignature(shape) });
    });
  }
  return lookup;
}

export function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let rng = Math.random;
export function setRng(fn) {
  rng = fn;
}

function randInt(limit) {
  return Math.floor(rng() * limit);
}
function choice(items) {
  return items[randInt(items.length)];
}
function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function sample(items, count) {
  return shuffle(items).slice(0, Math.min(count, items.length));
}
function sameNode(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}
function nodeKey([col, row]) {
  return `${col},${row}`;
}
function cellKey([col, row]) {
  return `${col},${row}`;
}
function edgeKey(a, b) {
  return [a, b].map(([col, row]) => `${col},${row}`).sort().join('|');
}
function manhattan(a, b) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}
function normalizeCells(cells) {
  const minCol = Math.min(...cells.map(([col]) => col));
  const minRow = Math.min(...cells.map(([, row]) => row));
  return cells.map(([col, row]) => [col - minCol, row - minRow]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
function cellSignature(cells) {
  return normalizeCells(cells).map(([col, row]) => `${col},${row}`).join('|');
}
function pathEdgeList(path) {
  const edges = [];
  for (let i = 1; i < path.length; i++) edges.push([path[i - 1], path[i]]);
  return edges;
}
function pathEdgeSet(path) {
  return new Set(pathEdgeList(path).map(([a, b]) => edgeKey(a, b)));
}
function pickSpaced(items, count) {
  if (count <= 0 || items.length === 0) return [];
  if (count >= items.length) return [...items];
  const picks = [];
  const step = items.length / (count + 1);
  for (let i = 1; i <= count; i++) {
    picks.push(items[Math.min(items.length - 1, Math.floor(step * i))]);
  }
  return picks;
}
function dedupeEdges(edges) {
  const seen = new Set();
  const unique = [];
  for (const edge of edges) {
    const key = edgeKey(edge[0], edge[1]);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(edge);
  }
  return unique;
}

function directionBetween([fromCol, fromRow], [toCol, toRow]) {
  if (toCol > fromCol) return 'right';
  if (toCol < fromCol) return 'left';
  if (toRow > fromRow) return 'down';
  if (toRow < fromRow) return 'up';
  return null;
}
function cornerOrientation(prev, curr, next) {
  const dirs = new Set([directionBetween(curr, prev), directionBetween(curr, next)]);
  if (dirs.has('up') && dirs.has('right')) return 'ur';
  if (dirs.has('up') && dirs.has('left')) return 'ul';
  if (dirs.has('down') && dirs.has('right')) return 'dr';
  if (dirs.has('down') && dirs.has('left')) return 'dl';
  return null;
}

// Classifies every interior path node into exactly one behavior family, mirroring what the
// engine itself enforces (a node can't simultaneously be a "turn" and a "straight" node) -
// each node also gets its finer-grained tag (corner orientation, or horizontal/vertical).
export function classifyPath(path) {
  const info = { turnNodes: [], straightNodes: [], horizontalNodes: [], verticalNodes: [], cornerNodes: [] };
  for (let i = 1; i < path.length - 1; i++) {
    const prev = path[i - 1];
    const curr = path[i];
    const next = path[i + 1];
    if (prev[0] === next[0]) {
      info.straightNodes.push(curr);
      info.verticalNodes.push(curr);
    } else if (prev[1] === next[1]) {
      info.straightNodes.push(curr);
      info.horizontalNodes.push(curr);
    } else {
      info.turnNodes.push(curr);
      const orientation = cornerOrientation(prev, curr, next);
      if (orientation) info.cornerNodes.push([curr[0], curr[1], orientation]);
    }
  }
  return info;
}

function availableFullCuts(width, height, path) {
  const used = pathEdgeSet(path);
  const cuts = [];
  for (let boundary = 1; boundary < width; boundary++) {
    const all = [];
    const open = [];
    for (let row = 0; row < height; row++) {
      const edge = [[boundary, row], [boundary, row + 1]];
      all.push(edge);
      if (used.has(edgeKey(edge[0], edge[1]))) open.push(edge);
    }
    if (open.length === 1) {
      cuts.push({ axis: 'vertical', index: boundary, edges: all.filter((edge) => edgeKey(edge[0], edge[1]) !== edgeKey(open[0][0], open[0][1])) });
    }
  }
  for (let boundary = 1; boundary < height; boundary++) {
    const all = [];
    const open = [];
    for (let col = 0; col < width; col++) {
      const edge = [[col, boundary], [col + 1, boundary]];
      all.push(edge);
      if (used.has(edgeKey(edge[0], edge[1]))) open.push(edge);
    }
    if (open.length === 1) {
      cuts.push({ axis: 'horizontal', index: boundary, edges: all.filter((edge) => edgeKey(edge[0], edge[1]) !== edgeKey(open[0][0], open[0][1])) });
    }
  }
  return cuts;
}

function chooseCuts(width, height, path, count) {
  if (count <= 0) return [];
  // A cut's entry count is (perpendicular dimension - 1) - on a non-square board, a cut along the
  // axis matching the LARGER dimension can exceed the rulebook's 2-4 blockedEdges-entry
  // preference (e.g. a horizontal cut on a 6-wide board gives 5 entries). Filter those out rather
  // than risk picking one.
  const cuts = shuffle(availableFullCuts(width, height, path).filter((cut) => cut.edges.length <= 4));
  const chosen = [];
  const used = new Set();
  for (const cut of cuts) {
    const signature = `${cut.axis}:${cut.index}`;
    if (used.has(signature)) continue;
    used.add(signature);
    chosen.push(...cut.edges);
    if (used.size >= count) break;
  }
  return used.size >= count ? dedupeEdges(chosen) : null;
}

function randomSimplePath(width, height, start, exit, minEdges) {
  const grid = new Grid(width, height);
  const seen = new Set([grid.nodeKey(start)]);
  const path = [start];
  let found = null;

  function dfs(node) {
    if (found) return;
    if (sameNode(node, exit)) {
      if (path.length - 1 >= minEdges) found = path.map((point) => [...point]);
      return;
    }
    const nexts = shuffle([
      [node[0] + 1, node[1]], [node[0] - 1, node[1]], [node[0], node[1] + 1], [node[0], node[1] - 1],
    ])
      .filter(([col, row]) => col >= 0 && col <= width && row >= 0 && row <= height)
      .sort((a, b) => manhattan(a, exit) - manhattan(b, exit) + (rng() * 2 - 1));

    for (const next of nexts) {
      const key = grid.nodeKey(next);
      if (seen.has(key)) continue;
      seen.add(key);
      path.push(next);
      dfs(next);
      path.pop();
      seen.delete(key);
      if (found) return;
    }
  }
  dfs(start);
  return found;
}

function randomBorderNode(width, height) {
  const side = randInt(4);
  if (side === 0) return [randInt(width + 1), 0];
  if (side === 1) return [width, randInt(height + 1)];
  if (side === 2) return [randInt(width + 1), height];
  return [0, randInt(height + 1)];
}
function pickDots(path, count, occupiedNodes) {
  const candidates = path.slice(1, -1).filter((node) => !occupiedNodes.has(nodeKey(node)));
  const picked = pickSpaced(candidates, count);
  if (picked.length < count) return null;
  picked.forEach((node) => occupiedNodes.add(nodeKey(node)));
  return picked.map((node) => [...node]);
}

function pickRequiredEdges(path, count) {
  return dedupeEdges(pickSpaced(pathEdgeList(path), count));
}

function skeletonOf(puzzle) {
  const skeleton = { width: puzzle.width, height: puzzle.height, start: puzzle.start, exits: puzzle.exits };
  if (puzzle.blockedEdges?.length) skeleton.blockedEdges = puzzle.blockedEdges;
  if (puzzle.symmetry) skeleton.symmetry = puzzle.symmetry;
  return skeleton;
}

// Dots/requiredEdges are only ever meaningful if they actually rule out some alternative that
// the wall cuts alone don't already forbid - a node/edge that every path through the cut
// skeleton already has to use is dead weight regardless of what else gets layered on top.
// Rather than brute-force counting solutions per candidate (exponential, and the dominant cost
// once boards have any real branching left), this asks the much cheaper question directly: does
// *some* skeleton-valid path avoiding this node/edge still exist? A single BFS answers that in
// O(nodes+edges) - if no such path exists, every solution is already forced through it and a
// dot/requiredEdge there adds nothing.
function skeletonEdgeBlocked(grid, skeleton, a, b) {
  const key = grid.edgeKey(a, b);
  return (skeleton.blockedEdges || []).some((edge) => grid.edgeKey(edge[0], edge[1]) === key);
}

function skeletonHasPathAvoiding(skeleton, { avoidNode = null, avoidEdgeKey = null } = {}) {
  const grid = new Grid(skeleton.width, skeleton.height);
  const startKey = grid.nodeKey(skeleton.start);
  const avoidKey = avoidNode ? nodeKey(avoidNode) : null;
  const exitKeys = new Set((skeleton.exits || []).map((exit) => grid.nodeKey(exit)));
  if (avoidKey === startKey) return false;

  const visited = new Set([startKey]);
  const queue = [skeleton.start];
  while (queue.length) {
    const node = queue.shift();
    const key = grid.nodeKey(node);
    if (key !== startKey && exitKeys.has(key)) return true;
    for (const next of [[node[0] + 1, node[1]], [node[0] - 1, node[1]], [node[0], node[1] + 1], [node[0], node[1] - 1]]) {
      if (next[0] < 0 || next[0] > skeleton.width || next[1] < 0 || next[1] > skeleton.height) continue;
      const nk = nodeKey(next);
      if (nk === avoidKey) continue;
      if (visited.has(nk)) continue;
      if (skeletonEdgeBlocked(grid, skeleton, node, next)) continue;
      if (avoidEdgeKey && edgeKey(node, next) === avoidEdgeKey) continue;
      visited.add(nk);
      queue.push(next);
    }
  }
  return false;
}

function pickNonRedundantDots(skeleton, path, count, occupiedNodes) {
  const candidates = shuffle(path.slice(1, -1).filter((node) => !occupiedNodes.has(nodeKey(node))));
  const picked = [];
  for (const node of candidates) {
    if (picked.length >= count) break;
    if (!skeletonHasPathAvoiding(skeleton, { avoidNode: node })) continue;
    picked.push(node);
  }
  if (picked.length < count) return null;
  picked.forEach((node) => occupiedNodes.add(nodeKey(node)));
  return picked.map((node) => [...node]);
}

function pickNonRedundantRequiredEdges(skeleton, path, count) {
  const candidates = shuffle(pathEdgeList(path));
  const picked = [];
  for (const edge of candidates) {
    if (picked.length >= count) break;
    if (!skeletonHasPathAvoiding(skeleton, { avoidEdgeKey: edgeKey(edge[0], edge[1]) })) continue;
    picked.push(edge);
  }
  if (picked.length < count) return null;
  return dedupeEdges(picked);
}

function addNodeMechanic(pathInfo, occupiedNodes, mechanic, count) {
  const source = shuffle(pathInfo[mechanic] || []).filter((entry) => !occupiedNodes.has(nodeKey([entry[0], entry[1]])));
  const picked = pickSpaced(source, count);
  if (picked.length < count) return null;
  picked.forEach(([col, row]) => occupiedNodes.add(`${col},${row}`));
  if (mechanic === 'cornerNodes') return picked.map(([col, row, orientation]) => [col, row, orientation]);
  return picked.map((node) => [node[0], node[1]]);
}

function freeCellsInRegion(region, occupied) {
  return region.filter((cell) => !occupied.has(cellKey(cell)));
}

// Prefer cells that aren't directly adjacent (sharing a cell edge) to any symbol already placed
// elsewhere in this attempt - two icons touching lets a player pair them by eyeballing proximity
// alone instead of reasoning about the region. Falls back to the unfiltered candidate list when
// a region is too small/crowded to offer enough isolated options for the requested count.
function preferIsolated(candidates, occupiedCells, minCount = 1) {
  const occupied = [...occupiedCells].map((key) => key.split(',').map(Number));
  const isolated = candidates.filter((cell) => occupied.every((oc) => manhattan(cell, oc) !== 1));
  return isolated.length >= minCount ? isolated : candidates;
}

function triangleChoices(grid, traveled, width, height, occupiedCells) {
  const choices = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (occupiedCells.has(`${col},${row}`)) continue;
      const count = grid.cellEdges(col, row).filter(([a, b]) => traveled.has(grid.edgeKey(a, b))).length;
      if (count >= 1 && count <= 3) choices.push([col, row, count]);
    }
  }
  return shuffle(choices);
}

function addTriangles(grid, traveled, width, height, occupiedCells, count) {
  const choices = triangleChoices(grid, traveled, width, height, occupiedCells);
  const picked = pickSpaced(preferIsolated(choices, occupiedCells, count), count);
  if (picked.length < count) return null;
  picked.forEach(([col, row]) => occupiedCells.add(`${col},${row}`));
  return picked;
}

// Sorts region candidates so the LEAST-used-so-far region (per regionUsage, a running tally
// shared across every mechanic placed in the same attempt) comes first, breaking ties randomly.
// Without this, each mechanic independently shuffles and picks blind to what every other
// mechanic already did - on a board cut into a small region and a big one, pure-random picks
// can easily cluster everything into the small region by chance, leaving the big one empty.
function sortByLeastUsed(candidates, regionUsage) {
  return shuffle(candidates).sort((a, b) => (regionUsage.get(a) || 0) - (regionUsage.get(b) || 0));
}

// colorOffset lets a caller placing MULTIPLE color-consuming mechanics on the same level (e.g.
// cellColors + stars together) give each one a different starting slot into COLORS, so they
// don't independently default to the same first color and collide into a single-color puzzle.
//
// A region can hold MULTIPLE cellColors groups as long as they're all the SAME color (satisfiesRegions
// only bans 2+ DIFFERENT colors sharing a region) - with only 3 COLORS total, regionCount>=4 always
// reuses an earlier color via the modulo wrap, so forcing every group into its own distinct region
// (as an earlier version did) demanded more physical regions than the color count actually requires.
// Track which color each region has committed to and allow same-color reuse before claiming a fresh one.
function addCellColors(regions, occupiedCells, regionCount, cellsPerRegion, colorOffset = 0, regionUsage = new Map()) {
  const entries = [];
  const colorByRegion = new Map();
  for (let i = 0; i < regionCount; i++) {
    const color = COLORS[(colorOffset + i) % COLORS.length];
    const candidates = sortByLeastUsed(regions.filter((region) => {
      const claimed = colorByRegion.get(region);
      if (claimed !== undefined && claimed !== color) return false;
      return freeCellsInRegion(region, occupiedCells).length >= cellsPerRegion;
    }), regionUsage);
    if (candidates.length === 0) return null;
    const target = candidates[0];
    colorByRegion.set(target, color);
    const free = freeCellsInRegion(target, occupiedCells);
    const cells = pickSpaced(shuffle(preferIsolated(free, occupiedCells, cellsPerRegion)), cellsPerRegion);
    if (cells.length < cellsPerRegion) return null;
    cells.forEach(([col, row]) => {
      entries.push([col, row, color]);
      occupiedCells.add(`${col},${row}`);
    });
    regionUsage.set(target, (regionUsage.get(target) || 0) + cellsPerRegion);
  }
  return entries;
}

// Unlike cellColors, a star's region can host OTHER star colors (or unrelated squares) freely -
// each color just independently needs its own count to land on exactly 2. So pairs never need
// their own dedicated region; any region with 2 free cells works for any pair, regardless of
// what other colors already share it.
function addStars(regions, occupiedCells, pairCount = 1, colorOffset = 0, regionUsage = new Map()) {
  const entries = { stars: [], cellColors: [] };
  for (let i = 0; i < pairCount; i++) {
    const color = COLORS[(colorOffset + i) % COLORS.length];
    const usable = sortByLeastUsed(regions.filter((region) => freeCellsInRegion(region, occupiedCells).length >= 2), regionUsage);
    if (usable.length === 0) return null;
    const target = usable[0];
    const free = freeCellsInRegion(target, occupiedCells);
    const cells = pickSpaced(shuffle(preferIsolated(free, occupiedCells, 2)), 2);
    if (cells.length < 2) return null;
    cells.forEach(([col, row]) => {
      entries.stars.push([col, row, color]);
      occupiedCells.add(`${col},${row}`);
    });
    regionUsage.set(target, (regionUsage.get(target) || 0) + 2);
  }
  return entries;
}

// The official rule (per The Witness) is that an eraser can cancel ANY symbol type, not just
// triangles - the exempted symbol here varies across 2 mechanics an eliminator can appear
// alongside in this generator:
// - a lone unmatched star: unsatisfiable since it has no partner anywhere in its region.
// - a square whose color conflicts with one already committed to that same region: unsatisfiable
//   since satisfiesRegions bans 2+ different colors sharing a region (only available when the
//   region already carries a color from an earlier-placed mechanic - otherwise falls back to a
//   lone star instead).
// A count-4 triangle was the original 3rd variant (also unsatisfiable - forces all 4 of a cell's
// corners to degree-2 from just that cell's own edges, only possible on a closed loop) but a
// count-4 triangle can ONLY EVER appear via an eliminator in this generator (addTriangles is
// capped at 1-3) - so its mere presence, at ANY frequency, is an instant "eliminator nearby" tell
// regardless of how often it's used relative to the other variants. Dropped entirely rather than
// just de-emphasized.
function addEliminators(regions, occupiedCells, existingColorByCell, colorOffset = 0, regionUsage = new Map()) {
  const viable = sortByLeastUsed(regions.filter((region) => freeCellsInRegion(region, occupiedCells).length >= 2), regionUsage);
  for (const region of viable) {
    const free = freeCellsInRegion(region, occupiedCells);
    // Neither the eliminator nor its cancelled symbol should sit directly adjacent to an already-
    // placed cell from ANY mechanic (including each other) - two icons touching reads as "these
    // must be the pair" on sight, which lets a player skip reasoning about the whole region
    // instead of actually working out what's broken. Prefer a pair where both cells are isolated
    // from everything already placed and from each other; fall back to a plain random pair only
    // if the region is too small/crowded to offer one.
    const pool = shuffle(preferIsolated(free, occupiedCells, 2));
    let cells = null;
    for (let i = 0; i < pool.length && !cells; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        if (manhattan(pool[i], pool[j]) !== 1) { cells = [pool[i], pool[j]]; break; }
      }
    }
    if (!cells) cells = sample(free, 2);
    if (cells.length < 2) continue;
    occupiedCells.add(cellKey(cells[0]));
    occupiedCells.add(cellKey(cells[1]));
    regionUsage.set(region, (regionUsage.get(region) || 0) + 2);

    const existingColor = region.map((c) => existingColorByCell.get(cellKey(c))).find((c) => c !== undefined);
    if (existingColor && rng() < 0.5) {
      const conflictColor = COLORS.find((c) => c !== existingColor) || COLORS[0];
      return {
        cellColors: [[cells[0][0], cells[0][1], conflictColor]],
        eliminators: [[cells[1][0], cells[1][1]]],
      };
    }
    const color = COLORS[colorOffset % COLORS.length];
    return {
      stars: [[cells[0][0], cells[0][1], color]],
      eliminators: [[cells[1][0], cells[1][1]]],
    };
  }
  return null;
}

function choosePolyomino(regions, occupiedCells, regionUsage = new Map()) {
  const matches = [];
  for (const region of regions) {
    if (region.length < 2 || region.length > 4) continue;
    const free = freeCellsInRegion(region, occupiedCells);
    if (free.length !== region.length) continue;
    const signature = cellSignature(region);
    for (const shape of SHAPE_LOOKUP) {
      if (shape.signature === signature) {
        matches.push({ region, entry: [region[0][0], region[0][1], shape.name, shape.rotationSteps, false] });
      }
    }
  }
  if (!matches.length) return null;
  const byLeastUsed = sortByLeastUsed(matches.map((m) => m.region), regionUsage);
  const picked = matches.find((m) => m.region === byLeastUsed[0]);
  picked.region.forEach((cell) => occupiedCells.add(cellKey(cell)));
  regionUsage.set(picked.region, (regionUsage.get(picked.region) || 0) + picked.region.length);
  return [picked.entry];
}


// Builds ONE random composition of `total` from parts in {2,3,4,5} directly, rather than
// enumerating every possible composition and picking one at random - the enumerate-then-choose
// approach (a DFS over every ordering of every part combination) is exponential in `total`
// (roughly a tribonacci-like growth, millions of array allocations by total~30), which stayed
// invisible while every caller only ever passed small intro-phase board sizes (totals up to
// ~12), but became a multi-minute-per-attempt stall once the expanded combo phase's larger
// boards (up to 30 cells) could produce a region that large. Greedily draws a random value at
// each step (skipping any that would leave an unsplittable remainder of exactly 1), backtracking
// by restarting the whole composition from scratch on the rare occasion it gets stuck - O(total)
// per attempt instead of exponential.
function splitRegionSize(total, { requireMultiple = false } = {}) {
  if (total < 2) return null;
  for (let attempt = 0; attempt < 20; attempt++) {
    const parts = [];
    let remaining = total;
    let stuck = false;
    while (remaining > 0) {
      const options = shuffle([2, 3, 4, 5]).filter((value) => value <= remaining && remaining - value !== 1);
      if (options.length === 0) { stuck = true; break; }
      parts.push(options[0]);
      remaining -= options[0];
    }
    if (!stuck && (!requireMultiple || parts.length >= 2)) return parts;
  }
  return null;
}

function buildRegionSizeNumbers(total, mode) {
  if (total < 2) return null;
  switch (mode) {
    case 'single':
      return total >= 2 && total <= 5 ? [total] : null;
    case 'sum':
      return splitRegionSize(total, { requireMultiple: true });
    default:
      if (total >= 2 && total <= 5 && rng() < 0.4) return [total];
      return splitRegionSize(total);
  }
}

// regionUsage defaults to a fresh Map so the intro-phase's single-call-per-level usage (levels
// 105/107) behaves exactly as before; the expanded combo phase (9.1) passes the SAME shared
// regionUsage every other cell mechanic uses, so multiple regionSizes instances spread across
// regions the same way multiple cellColors/stars instances do, instead of risking every instance
// clustering into whichever region happens to shuffle first.
function addRegionSizes(regions, occupiedCells, mode, regionUsage = new Map()) {
  const candidates = sortByLeastUsed(
    regions.filter((region) => region.length >= 2 && freeCellsInRegion(region, occupiedCells).length >= 2),
    regionUsage,
  );
  for (const region of candidates) {
    const free = shuffle(freeCellsInRegion(region, occupiedCells));
    const numbers = buildRegionSizeNumbers(region.length, mode);
    if (!numbers || free.length < numbers.length) continue;
    const entries = [];
    for (let i = 0; i < numbers.length; i++) {
      const [col, row] = free[i];
      entries.push([col, row, numbers[i]]);
      occupiedCells.add(cellKey([col, row]));
    }
    regionUsage.set(region, (regionUsage.get(region) || 0) + entries.length);
    return entries;
  }
  return null;
}

function activeMechanics(puzzle) {
  const active = { node: [], edge: [], cell: [], global: [] };
  for (const key of NODE_MECHANICS) if (puzzle[key]?.length) active.node.push(key);
  for (const key of EDGE_MECHANICS) if (puzzle[key]?.length) active.edge.push(key);
  for (const key of CELL_MECHANICS) if (puzzle[key]?.length) active.cell.push(key);
  if (puzzle.symmetry) active.global.push('symmetry');
  return active;
}

function stripMechanicField(puzzle, field) {
  if (field === 'symmetry') {
    const { symmetry, ...rest } = puzzle;
    return rest;
  }
  const copy = { ...puzzle };
  delete copy[field];
  return copy;
}

// Every mechanic present must actually remove real candidate paths, per the rulebook's own
// redundancy-audit standard - strip each one (except blockedEdges, which is what keeps the
// solver's raw search space tractable in the first place and is audited separately, offline)
// and reject the whole attempt if any single one leaves the solution count unchanged.
function hasRedundantMechanic(puzzle, baselineCount, cap, maxExpansions) {
  const active = [
    ...activeMechanics(puzzle).node,
    ...activeMechanics(puzzle).edge.filter((f) => f !== 'blockedEdges'),
    ...activeMechanics(puzzle).cell,
    ...activeMechanics(puzzle).global,
  ];
  for (const field of active) {
    const stripped = stripMechanicField(puzzle, field);
    const result = countSolutions(stripped, cap, maxExpansions);
    if (result.truncated) continue;
    if (result.count === baselineCount) return field;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Intro phase: exactly 2 pure-teaching levels per mechanic, 15 mechanics, ids 1-30.
// ---------------------------------------------------------------------------

const INTRO_ORDER = [
  'dots', 'blockedEdges', 'requiredEdges', 'triangles', 'cellColors',
  'stars', 'eliminators', 'polyominoes', 'turnNodes', 'straightNodes',
  'horizontalNodes', 'verticalNodes', 'cornerNodes', 'regionSizes',
];

function buildIntroContext(sizes, minEdges) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const [width, height] = choice(sizes);
    let start = randomBorderNode(width, height);
    let exit = randomBorderNode(width, height);
    for (let tries = 0; tries < 40; tries++) {
      if (!sameNode(start, exit) && manhattan(start, exit) >= Math.max(width, height)) break;
      start = randomBorderNode(width, height);
      exit = randomBorderNode(width, height);
    }
    const path = randomSimplePath(width, height, start, exit, minEdges);
    if (!path) continue;
    return { width, height, start, exit, path };
  }
  return null;
}

// Hand-authored rather than random-generated: the tier-1 polyomino lesson needs two rotatable
// ("slanted") pieces whose region shapes actually differ in orientation from their drawn 0deg
// icon (tromino-I resolves horizontal, domino resolves vertical) to prove the rule that a
// slanted icon accepts any rotation - not just place two pieces that happen to already match.
// A single simple path with no cuts only ever splits an open board into exactly two regions, so
// demonstrating two DIFFERENT rotation stories at once needs a deliberately shaped tiny board;
// on the standard 3x3/3x4/4x3 tier-1 sizes, finding two same/cross-shape regions that qualify
// almost never happens (empirically failed 600/600 attempts even after growing the board and
// forcing an escalation retry), so this level is fixed rather than searched for every seed.
const SLANTED_POLYOMINO_INTRO_LEVEL = {
  width: 4,
  height: 2,
  start: [0, 0],
  exits: [[4, 2]],
  polyominoes: [
    [0, 0, 'tromino-I', 0, true],
    [3, 0, 'domino', 0, true],
  ],
};

function generateIntroLevel(levelNumber, mechanic, tier) {
  if (mechanic === 'polyominoes' && tier === 1) {
    return { ...SLANTED_POLYOMINO_INTRO_LEVEL, id: `level_${String(levelNumber).padStart(3, '0')}` };
  }
  const easy = tier === 0;
  const sizes = easy ? [[2, 2], [3, 2], [2, 3]] : [[3, 3], [3, 4], [4, 3]];
  const minEdges = easy ? 4 : 7;

  for (let attempt = 0; attempt < 600; attempt++) {
    const ctx = buildIntroContext(sizes, minEdges);
    if (!ctx) continue;
    const { width, height, start, exit, path } = ctx;
    const pathInfo = classifyPath(path);

    const puzzleBase = { id: '', width, height, start, exits: [exit] };

    // Every tier-1 mechanic needs an otherwise-open board's solution count bounded enough to hit
    // the tighter tier-1 cap - a light cut isn't the only way to do that, so mix in a light
    // required edge too rather than always leaning on blockedEdges as connective tissue.
    let cutCount = 0;
    let wantLightRequiredEdge = false;
    if (mechanic === 'blockedEdges') cutCount = easy ? 1 : 2;
    else if (!easy) {
      if (rng() < 0.5) cutCount = 1;
      else wantLightRequiredEdge = true;
    }
    const blockedEdges = chooseCuts(width, height, path, cutCount);
    if (cutCount > 0 && !blockedEdges) continue;
    if (blockedEdges?.length) puzzleBase.blockedEdges = blockedEdges;
    if (wantLightRequiredEdge && mechanic !== 'requiredEdges') {
      const lightRequiredEdges = pickRequiredEdges(path, 1);
      if (lightRequiredEdges.length) puzzleBase.requiredEdges = lightRequiredEdges;
    }

    const occupiedNodes = new Set([nodeKey(start), nodeKey(exit)]);
    const occupiedCells = new Set();
    let mechanicPayload = null;

    if (mechanic === 'dots') {
      mechanicPayload = { dots: pickDots(path, easy ? 1 : 2, occupiedNodes) };
      if (!mechanicPayload.dots) continue;
    } else if (mechanic === 'blockedEdges') {
      if (!blockedEdges) continue;
      mechanicPayload = {};
    } else if (mechanic === 'requiredEdges') {
      mechanicPayload = { requiredEdges: pickRequiredEdges(path, easy ? 1 : 2) };
    } else if (['turnNodes', 'straightNodes', 'horizontalNodes', 'verticalNodes'].includes(mechanic)) {
      const picked = addNodeMechanic(pathInfo, occupiedNodes, mechanic, easy ? 1 : 2);
      if (!picked) continue;
      mechanicPayload = { [mechanic]: picked };
    } else if (mechanic === 'cornerNodes') {
      const picked = addNodeMechanic(pathInfo, occupiedNodes, 'cornerNodes', easy ? 1 : 2);
      if (!picked) continue;
      mechanicPayload = { cornerNodes: picked };
    } else {
      // Cell-based mechanics need real region structure - build it after the path/cuts exist.
      mechanicPayload = null;
    }

    let puzzle = { ...puzzleBase, ...mechanicPayload };
    let dotsForCellMechanics = null;
    if (!['dots', 'requiredEdges'].includes(mechanic) && !puzzle.dots && easy === false) {
      dotsForCellMechanics = pickDots(path, 1, occupiedNodes);
      if (dotsForCellMechanics) puzzle.dots = dotsForCellMechanics;
    }

    if (['triangles', 'cellColors', 'stars', 'eliminators', 'polyominoes', 'regionSizes'].includes(mechanic)) {
      const grid = new Grid(width, height);
      const regions = computeRegions(grid, puzzle, path);
      const traveled = combinedTraveledEdges(grid, puzzle, path);

      if (mechanic === 'triangles') {
        const triangles = addTriangles(grid, traveled, width, height, occupiedCells, easy ? 1 : 2);
        if (!triangles) continue;
        puzzle.triangles = triangles;
      } else if (mechanic === 'cellColors') {
        const cellColors = addCellColors(regions, occupiedCells, 2, easy ? 1 : 2);
        if (!cellColors) continue;
        puzzle.cellColors = cellColors;
      } else if (mechanic === 'stars') {
        const setup = addStars(regions, occupiedCells, 1);
        if (!setup) continue;
        puzzle.stars = setup.stars;
        puzzle.cellColors = setup.cellColors;
      } else if (mechanic === 'eliminators') {
        const existingColorByCell = new Map((puzzle.cellColors || []).map(([c, r, color]) => [`${c},${r}`, color]));
        const setup = addEliminators(regions, occupiedCells, existingColorByCell);
        if (!setup) continue;
        if (setup.triangles) puzzle.triangles = setup.triangles;
        if (setup.stars) puzzle.stars = setup.stars;
        if (setup.cellColors) puzzle.cellColors = [...(puzzle.cellColors || []), ...setup.cellColors];
        puzzle.eliminators = setup.eliminators;
      } else if (mechanic === 'polyominoes') {
        const poly = choosePolyomino(regions, occupiedCells);
        if (!poly) continue;
        puzzle.polyominoes = poly;
      } else if (mechanic === 'regionSizes') {
        const regionSizes = addRegionSizes(regions, occupiedCells, easy ? 'single' : 'sum');
        if (!regionSizes) continue;
        puzzle.regionSizes = regionSizes;
      }
    }

    const grid = new Grid(width, height);
    if (!validateSolution(grid, puzzle, path)) continue;

    const maxCount = easy ? 30 : 22;
    const measured = countSolutions(puzzle, maxCount + 1, 300000);
    if (measured.truncated || measured.hitCap) continue;
    if (measured.count < 1 || measured.count > maxCount) continue;
    if (hasRedundantMechanic(puzzle, measured.count, measured.count + 1, 300000)) continue;

    puzzle.id = `level_${String(levelNumber).padStart(3, '0')}`;
    // Up to MAX_STORED_SOLUTIONS distinct solving paths, always led by the one this attempt
    // already proved solvable with validateSolution above - stored so the "Show Sol." debug
    // control (main.js) can display and cycle through them instantly, with zero search of its
    // own at view time (see collectStoredSolutions).
    puzzle.solutionPaths = collectStoredSolutions(puzzle, path);
    return puzzle;
  }
  return null;
}

// "At most 2" is a ceiling, not a floor - a couple of mechanics only earn one clean intro slot:
// - dots tier 1 leaked an unintroduced blockedEdges cut into what should be a pure dots lesson
//   (a side effect of the light-cut fix for keeping tier-1 solution counts bounded).
// - blockedEdges tier 1 exceeded the 2-4 entry preference in the very level meant to teach it.
// - cellColors tier 0 used one cell per color, which never demonstrates the actual rule (that
//   same-colored cells must end up together) since there's no same-color pair to test.
// The whole directional-node family (turnNodes/straightNodes/horizontalNodes/verticalNodes/
// cornerNodes) plus regionSizes are still held back from both this intro phase and the flexible
// combo phase below (levels 14-100 are restricted to only 8 mechanics per direct project
// instruction). They ARE reintroduced, but as their own later phase - see NODE_LESSON_TIERS and
// the node-lesson phase in generateAll() (levels 101+) - rather than mixed into this INTRO_TIERS
// map, specifically so their addition doesn't touch the RNG stream that produced levels 1-100
// (see the determinism discussion in the rulebook, Section 9.1).
//
// Symmetry (Global) is intentionally absent from this map entirely, not just set to `[]` - it was
// built, tested (100% generation success once the path builder was fixed to actively avoid its
// own mirror), and then deliberately removed after review: combining it with any other mechanic
// is disproportionately expensive (a bare lesson generated in ~9ms, the same lesson plus one
// triangle took ~470ms), and scattering it thinly would misrepresent how the source material
// actually uses it - concentrated in one contained area, not spread everywhere else.
// See level-creation-rulebook.md Section 8 for the full reasoning before reconsidering this. The
// engine (Validator.js/Regions.js/Symmetry.js/Solver.js/Renderer.js) still fully supports a
// `symmetry` field on any puzzle object - only the GENERATOR'S ability to produce one was removed.
const INTRO_TIERS = {
  dots: [0],
  blockedEdges: [0],
  requiredEdges: [0, 1],
  triangles: [0, 1],
  cellColors: [1],
  stars: [0, 1],
  eliminators: [0, 1],
  polyominoes: [0, 1],
  turnNodes: [],
  straightNodes: [],
  horizontalNodes: [],
  verticalNodes: [],
  cornerNodes: [],
  regionSizes: [],
};

export function buildIntroRecipes() {
  const recipes = [];
  for (const mechanic of INTRO_ORDER) {
    for (const tier of INTRO_TIERS[mechanic] ?? [0, 1]) {
      recipes.push({ mechanic, tier });
    }
  }
  return recipes;
}

// ---------------------------------------------------------------------------
// Node-lesson phase, ids 101+: the directional-node family plus Region Size Numbers were held
// back from the intro phase above and from the flexible combo phase (see the comment above
// INTRO_TIERS and the flexible-phase comment below) per direct project instruction to restrict
// the initial 100-level collection to 8 mechanics. This is their reintroduction, deliberately run
// as its OWN phase AFTER both the intro (1-13) and flexible (14-100) phases in generateAll()
// rather than merged into buildIntroRecipes()/INTRO_TIERS above - doing it as a separate later
// phase means it only ever consumes NEW rng() calls appended after everything levels 1-100
// already consumed, so those 100 levels stay byte-for-byte identical regardless of this addition
// (see the determinism discussion in the rulebook, Section 9.1).
//
// Per direct feedback, the 5 directional-node mechanics are taught as 2 COMBINED lessons rather
// than 5 separate single-mechanic ones - turnNodes+straightNodes together, then
// horizontalNodes+verticalNodes+cornerNodes together (the finer-grained variant). This is safe
// because classifyPath's buckets are mutually exclusive by construction: every interior path node
// is classified as EITHER turn-type (turnNodes, plus cornerNodes if an orientation resolves) OR
// straight-type (straightNodes, plus EITHER horizontalNodes OR verticalNodes depending on
// direction) - never both. So marking one mechanic's nodes can never collide with another's on
// the same path, and a real path always has both turn AND straight nodes anyway (isolating just
// one from the other, as the original single-mechanic lessons did, doesn't reflect how these
// mechanics actually show up together in play). Region Size Numbers stays its own lesson - it's
// a Cell-target mechanic, structurally unrelated to any Node-target one.
const NODE_LESSON_GROUPS = [
  { type: 'combo', mechanics: ['turnNodes', 'straightNodes'], tiers: [0, 1] },
  { type: 'combo', mechanics: ['horizontalNodes', 'verticalNodes', 'cornerNodes'], tiers: [0, 1] },
  { type: 'single', mechanics: ['regionSizes'], tiers: [0, 1] },
];

export function buildNodeLessonRecipes() {
  const recipes = [];
  for (const group of NODE_LESSON_GROUPS) {
    for (const tier of group.tiers) {
      recipes.push({ type: group.type, mechanics: group.mechanics, tier });
    }
  }
  return recipes;
}

// Builds a lesson combining 2+ directional-node mechanics on ONE path - each mechanic
// independently claims its own subset of that path's nodes (see the comment above
// NODE_LESSON_GROUPS for why they never collide), so this is really just `addNodeMechanic`
// called once per mechanic against a single shared path/occupiedNodes, followed by the same
// validate/count/redundancy checks generateIntroLevel uses.
function generateNodeComboLevel(levelNumber, mechanics, tier) {
  const easy = tier === 0;
  // More simultaneously-required distinct node types need more path complexity to naturally
  // occur together - the 3-mechanic horizontalNodes+verticalNodes+cornerNodes lesson needs one
  // size tier bigger than the 2-mechanic turnNodes+straightNodes one to reliably find a path
  // with all 3 represented (empirically, the tiniest tier-0 boards exhausted 600 attempts
  // without ever producing one).
  const extra = Math.max(0, mechanics.length - 2);
  const sizes = easy
    ? (extra ? [[3, 3], [3, 4], [4, 3]] : [[2, 2], [3, 2], [2, 3]])
    : (extra ? [[4, 4], [4, 5], [5, 4]] : [[3, 3], [3, 4], [4, 3]]);
  const minEdges = (easy ? 4 : 7) + extra * 2;

  for (let attempt = 0; attempt < 600; attempt++) {
    const ctx = buildIntroContext(sizes, minEdges, false);
    if (!ctx) continue;
    const { width, height, start, exit, path } = ctx;
    const pathInfo = classifyPath(path);

    const puzzle = { id: '', width, height, start, exits: [exit] };

    // Same light-cut-or-required-edge mixing as generateIntroLevel's tier-1 pass, to keep an
    // otherwise-open board's solution count bounded enough to hit the tier's target window.
    let cutCount = 0;
    let wantLightRequiredEdge = false;
    if (!easy) {
      if (rng() < 0.5) cutCount = 1;
      else wantLightRequiredEdge = true;
    }
    const blockedEdges = chooseCuts(width, height, path, cutCount);
    if (cutCount > 0 && !blockedEdges) continue;
    if (blockedEdges?.length) puzzle.blockedEdges = blockedEdges;
    if (wantLightRequiredEdge) {
      const lightRequiredEdges = pickRequiredEdges(path, 1);
      if (lightRequiredEdges.length) puzzle.requiredEdges = lightRequiredEdges;
    }

    const occupiedNodes = new Set([nodeKey(start), nodeKey(exit)]);
    let ok = true;
    for (const mechanic of mechanics) {
      const picked = addNodeMechanic(pathInfo, occupiedNodes, mechanic, easy ? 1 : 2);
      if (!picked) { ok = false; break; }
      puzzle[mechanic] = picked;
    }
    if (!ok) continue;

    const grid = new Grid(width, height);
    if (!validateSolution(grid, puzzle, path)) continue;

    const maxCount = easy ? 30 : 22;
    const measured = countSolutions(puzzle, maxCount + 1, 300000);
    if (measured.truncated || measured.hitCap) continue;
    if (measured.count < 1 || measured.count > maxCount) continue;
    if (hasRedundantMechanic(puzzle, measured.count, measured.count + 1, 300000)) continue;

    puzzle.id = `level_${String(levelNumber).padStart(3, '0')}`;
    // See generateIntroLevel's identical comment - stored so "Show Sol." can display and cycle
    // through solutions instantly, with zero search of its own at view time.
    puzzle.solutionPaths = collectStoredSolutions(puzzle, path);
    return puzzle;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Flexible combo phase, ids 14-100: per direct project instruction, restricted to only 8
// mechanics (dots, blockedEdges, requiredEdges, triangles, cellColors, stars, eliminators,
// polyominoes) - the directional-node family and regionSizes are deferred for later
// reintroduction. There is no fixed "N distinct node/edge/cell" floor here (that floor assumed
// access to multiple node mechanics, which no longer holds with only dots available): dots,
// blockedEdges and requiredEdges are each independently optional, while the 5 cell mechanics are
// the deductive backbone and can repeat freely (multiple instances of the same one is fine and
// intentional - "more of them increases deduction"). There is also no per-band solution-count
// target window - any solvable, non-truncated result is accepted, since hitting a narrow target
// was the dominant source of wasted generation attempts in the old design.
// ---------------------------------------------------------------------------

const FLEXIBLE_CELL_MECHANICS = ['triangles', 'cellColors', 'stars', 'eliminators', 'polyominoes'];

// Difficulty grows via mechanic density (how many distinct cell mechanics, how many instances of
// each) and board size, not via chasing a specific solution count. Edge/node inclusion chances
// also grow, but stay optional even in the hardest band - per direct instruction, none of the
// three are mandatory.
// distinctCell is capped at 3, even in the hardest bands - going to 4-5 meant demanding EVERY
// (or nearly every) cell mechanic active simultaneously, all independently competing for cells in
// the same 2-3 regions a small board actually has. That's what caused minutes-long stalls in the
// later bands even after every per-mechanic fix below; 3 simultaneous mechanics is the ceiling
// that stayed reliably fast. Per direct feedback (using level 33 - stars+cellColors only, 4
// instances each, on a compact 4x4 board - as the reference): distinctCell doesn't need to grow
// for difficulty to grow. A FEW mechanic types with MANY instances each is just as complex and
// more compact than spreading the same density across more distinct types, so flex1-4 favor
// instanceRange growth over distinctCell growth - board size tracks expected symbol-cell count
// (roughly instanceRange x however many cells each instance needs), not just band index, so a
// denser recipe still fits its board tightly instead of leaving it mostly empty.
// dnChance (directional-node mark probability) only appears on flex4 onward - flex1-3 sit before
// lessonA in generateAll()'s tier order and must never roll it at all (not just roll-and-discard),
// since buildOneComboRecipe short-circuits the rng() call entirely when a tier's directionalPool
// is empty. Adding the field to flex1-3 would be harmless AS DATA but is omitted anyway so it's
// obvious at a glance which bands are even eligible. Ramps 0.15->0.4 across flex4-10, landing
// flex10 at exactly expand1's own 0.4 so the two bands - already tuned to bridge into each other on
// every other axis - bridge on this one too.
const FLEXIBLE_BANDS = [
  { name: 'flex1', count: 9, sizes: [[3, 3], [3, 4], [4, 3]], minEdges: 6, distinctCell: 1, instanceRange: [1, 2], cutChance: 0.1, reqChance: 0.2, dotsChance: 0.3 },
  { name: 'flex2', count: 9, sizes: [[3, 4], [4, 3], [4, 4]], minEdges: 7, distinctCell: 1, instanceRange: [2, 4], cutChance: 0.15, reqChance: 0.25, dotsChance: 0.35 },
  { name: 'flex3', count: 9, sizes: [[4, 4], [4, 5], [5, 4]], minEdges: 8, distinctCell: 2, instanceRange: [1, 2], cutChance: 0.2, reqChance: 0.3, dotsChance: 0.4 },
  { name: 'flex4', count: 9, sizes: [[4, 4], [4, 5], [5, 4]], minEdges: 8, distinctCell: 2, instanceRange: [2, 4], cutChance: 0.3, reqChance: 0.35, dotsChance: 0.45, dnChance: 0.15 },
  { name: 'flex5', count: 9, sizes: [[4, 5], [5, 4], [5, 5]], minEdges: 9, distinctCell: 3, instanceRange: [1, 1], cutChance: 0.4, reqChance: 0.4, dotsChance: 0.5, dnChance: 0.2 },
  { name: 'flex6', count: 9, sizes: [[4, 5], [5, 4], [5, 5]], minEdges: 9, distinctCell: 3, instanceRange: [1, 2], cutChance: 0.5, reqChance: 0.45, dotsChance: 0.55, dnChance: 0.25 },
  // Board size is capped at 5x5/5x6/6x5 for every band, even the hardest - past that, an open
  // board (no cut) has a raw solution count expensive enough that even the "cheap" redundancy
  // baseline check (cap 50, 50000 expansions) can take many seconds per attempt, which multiplies
  // out badly across however many attempts a tight recipe needs. cutChance/distinctCell already
  // carry the difficulty ramp for these bands without needing bigger boards too.
  { name: 'flex7', count: 9, sizes: [[4, 5], [5, 4], [5, 5]], minEdges: 10, distinctCell: 3, instanceRange: [1, 1], cutChance: 0.6, reqChance: 0.5, dotsChance: 0.6, dnChance: 0.3 },
  { name: 'flex8', count: 9, sizes: [[5, 5], [5, 6], [6, 5]], minEdges: 10, distinctCell: 3, instanceRange: [1, 2], cutChance: 0.7, reqChance: 0.55, dotsChance: 0.65, dnChance: 0.35 },
  { name: 'flex9', count: 9, sizes: [[5, 5], [5, 6], [6, 5]], minEdges: 11, distinctCell: 3, instanceRange: [1, 1], cutChance: 0.8, reqChance: 0.6, dotsChance: 0.7, dnChance: 0.4 },
  { name: 'flex10', count: 6, sizes: [[5, 5], [5, 6], [6, 5]], minEdges: 11, distinctCell: 3, instanceRange: [1, 2], cutChance: 0.85, reqChance: 0.65, dotsChance: 0.75, dnChance: 0.4 },
];

export function buildFlexibleRecipes() {
  const recipes = [];
  for (const band of FLEXIBLE_BANDS) {
    for (let i = 0; i < band.count; i++) {
      // polyominoes claims an entire region outright (every cell, exact shape match) - combining
      // it with any region-color-sensitive mechanic (cellColors/stars/eliminators, which each
      // partially claim cells from the same limited region pool) means whichever one places
      // second can no longer find a wholly-free region to use. The original design only ever
      // paired polyominoes with triangles for exactly this reason. At distinctCell>=3 the mechanic
      // pool IS every mechanic (5 slice of 5), so polyominoes would be selected every single time
      // and then filtered right back down to just [polyominoes,triangles] below - collapsing every
      // high-density band's intended diversity. Simplest fix: polyominoes only ever competes for a
      // slot in the lower-density bands where it can safely pair with just triangles.
      const pool = band.distinctCell >= 3
        ? FLEXIBLE_CELL_MECHANICS.filter((m) => m !== 'polyominoes')
        : FLEXIBLE_CELL_MECHANICS;
      let cellMechanics = shuffle(pool).slice(0, band.distinctCell);
      if (cellMechanics.includes('polyominoes')) {
        cellMechanics = cellMechanics.filter((m) => m === 'polyominoes' || m === 'triangles');
        if (!cellMechanics.includes('triangles') && cellMechanics.length < band.distinctCell) {
          cellMechanics = [...cellMechanics, 'triangles'];
        }
      }
      const [minInstances, maxInstances] = band.instanceRange;
      const instanceCounts = cellMechanics.map((mechanic) => {
        const count = minInstances + randInt(maxInstances - minInstances + 1);
        // polyominoes needs an entire region to exactly match a canonical piece's size and shape -
        // far rarer than any other cell mechanic (which just needs free cells somewhere in some
        // region). Requesting 2+ simultaneously (2 separate exact-shape regions at once) stalled
        // generation for minutes on the very first band that could roll it, same lesson learned
        // the first time this collection was built - keep it capped at 1 regardless of band.
        if (mechanic === 'polyominoes') return 1;
        return count;
      });

      const colorsIdx = cellMechanics.indexOf('cellColors');
      const starsIdx = cellMechanics.indexOf('stars');
      // A single cellColors region is mathematically vacuous when it's the only color-bearing
      // mechanic on the level - with only one color anywhere on the board there's no second color
      // for a region to mix with, so the "no mixed colors" rule is trivially satisfied by every
      // path regardless of where it's drawn. Needs >=2 regions (>=2 colors) of its own UNLESS
      // stars is also selected, which already supplies an independent second color context.
      // (The old combined/individual instance caps that used to sit here were only needed because
      // of a since-fixed engine bug where a star's region couldn't tolerate ANY unrelated color -
      // now that different star colors and unrelated squares can freely share a region, as long as
      // each color's own count comes out to exactly 2, there's no structural ceiling left to
      // enforce here.)
      if (colorsIdx !== -1 && starsIdx === -1) {
        instanceCounts[colorsIdx] = Math.max(2, instanceCounts[colorsIdx]);
      }
      recipes.push({
        band: band.name,
        sizes: band.sizes,
        minEdges: band.minEdges,
        cellMechanics,
        instanceCounts,
        wantCut: rng() < band.cutChance,
        wantRequiredEdges: rng() < band.reqChance,
        wantDots: rng() < band.dotsChance,
      });
    }
  }
  return recipes;
}

function attemptFlexibleLevel(levelNumber, recipe, maxAttempts, debug = false) {
  const reasons = new Map();
  const fail = (reason) => {
    if (debug) reasons.set(reason, (reasons.get(reason) || 0) + 1);
    return null;
  };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const [width, height] = choice(recipe.sizes);
    let start = randomBorderNode(width, height);
    let exit = randomBorderNode(width, height);
    for (let tries = 0; tries < 40; tries++) {
      if (!sameNode(start, exit) && manhattan(start, exit) >= Math.max(width, height)) break;
      start = randomBorderNode(width, height);
      exit = randomBorderNode(width, height);
    }
    const path = randomSimplePath(width, height, start, exit, recipe.minEdges);
    if (!path) { fail('path'); continue; }

    const puzzle = { id: '', width, height, start, exits: [exit] };

    if (recipe.wantCut) {
      const blockedEdges = chooseCuts(width, height, path, 1);
      if (!blockedEdges) { fail('blockedEdges'); continue; }
      puzzle.blockedEdges = blockedEdges;
    }

    const skeleton = skeletonOf(puzzle);
    const occupiedNodes = new Set([nodeKey(start), nodeKey(exit)]);

    if (recipe.wantRequiredEdges) {
      const requiredEdges = pickNonRedundantRequiredEdges(skeleton, path, 1);
      if (!requiredEdges) { fail('requiredEdges'); continue; }
      puzzle.requiredEdges = requiredEdges;
    }

    if (recipe.wantDots) {
      const dots = pickNonRedundantDots(skeleton, path, 1, occupiedNodes);
      if (!dots) { fail('dots'); continue; }
      puzzle.dots = dots;
    }

    // One directional-node mechanic, one instance - treated exactly like wantDots/
    // wantRequiredEdges above (a light, independent, optional mark), not like the node-lesson
    // phase's 2-3-mechanic combined groups. This is deliberately simple: a combo level already
    // stacks up to 3 cell mechanics plus a cut/dot/required-edge, so adding a whole extra 2-3
    // node markers on top would be piling density on density rather than a light touch.
    if (recipe.wantDirectionalNode && recipe.directionalNodeMechanic) {
      const pathInfo = classifyPath(path);
      const picked = addNodeMechanic(pathInfo, occupiedNodes, recipe.directionalNodeMechanic, 1);
      if (!picked) { fail('directionalNode'); continue; }
      puzzle[recipe.directionalNodeMechanic] = picked;
    }

    const grid = new Grid(width, height);
    const regions = computeRegions(grid, puzzle, path);
    const traveled = combinedTraveledEdges(grid, puzzle, path);
    const occupiedCells = new Set();

    let cellOk = true;
    // cellColors and stars each independently default to COLORS[0] for their first instance - if
    // both are selected, give the SECOND one placed a fresh offset so it doesn't fall back to the
    // exact same color as the first (which would leave the puzzle with only one color in play
    // total, making a "no mixed colors per region" constraint vacuous either way).
    let colorSlot = 0;
    // Shared across every mechanic placed in this attempt so they collectively spread across
    // whatever regions the path/cuts produced, instead of each independently picking blind and
    // risking everything clustering into the same (possibly small) region while others sit empty.
    const regionUsage = new Map();
    for (let idx = 0; idx < recipe.cellMechanics.length && cellOk; idx++) {
      const mechanic = recipe.cellMechanics[idx];
      const count = recipe.instanceCounts[idx];
      if (mechanic === 'triangles') {
        const triangles = addTriangles(grid, traveled, width, height, occupiedCells, count);
        if (!triangles) { cellOk = false; break; }
        puzzle.triangles = [...(puzzle.triangles || []), ...triangles];
      } else if (mechanic === 'cellColors') {
        const cellColors = addCellColors(regions, occupiedCells, count, 2, colorSlot, regionUsage);
        if (!cellColors) { cellOk = false; break; }
        puzzle.cellColors = [...(puzzle.cellColors || []), ...cellColors];
        colorSlot += count;
      } else if (mechanic === 'stars') {
        const setup = addStars(regions, occupiedCells, count, colorSlot, regionUsage);
        if (!setup) { cellOk = false; break; }
        puzzle.stars = [...(puzzle.stars || []), ...setup.stars];
        puzzle.cellColors = [...(puzzle.cellColors || []), ...setup.cellColors];
        colorSlot += count;
      } else if (mechanic === 'eliminators') {
        for (let k = 0; k < count; k++) {
          const existingColorByCell = new Map((puzzle.cellColors || []).map(([c, r, color]) => [`${c},${r}`, color]));
          const setup = addEliminators(regions, occupiedCells, existingColorByCell, colorSlot, regionUsage);
          if (!setup) { cellOk = false; break; }
          if (setup.triangles) puzzle.triangles = [...(puzzle.triangles || []), ...setup.triangles];
          if (setup.stars) { puzzle.stars = [...(puzzle.stars || []), ...setup.stars]; colorSlot++; }
          if (setup.cellColors) puzzle.cellColors = [...(puzzle.cellColors || []), ...setup.cellColors];
          puzzle.eliminators = [...(puzzle.eliminators || []), ...setup.eliminators];
        }
      } else if (mechanic === 'polyominoes') {
        for (let k = 0; k < count; k++) {
          const poly = choosePolyomino(regions, occupiedCells, regionUsage);
          if (!poly) { cellOk = false; break; }
          puzzle.polyominoes = [...(puzzle.polyominoes || []), ...poly];
        }
      } else if (mechanic === 'regionSizes') {
        // Treated like cellColors/stars, not like polyominoes - scales with instanceRange and
        // shares the same regionUsage bias, so multiple regionSizes instances spread across
        // regions instead of clustering into whichever one shuffles first.
        for (let k = 0; k < count; k++) {
          const regionSizes = addRegionSizes(regions, occupiedCells, undefined, regionUsage);
          if (!regionSizes) { cellOk = false; break; }
          puzzle.regionSizes = [...(puzzle.regionSizes || []), ...regionSizes];
        }
      }
    }
    if (!cellOk) { fail('cell:no-fit'); continue; }

    // The per-mechanic isolation preference above (preferIsolated) falls back to an adjacent
    // placement when a small/crowded region has no isolated candidate left for the requested
    // count - which can quietly recreate the exact "eliminator right next to a symbol gives away
    // the pairing" problem it exists to prevent. Reject outright and retry with a fresh
    // path/placement rather than accept a fallback silently.
    const allSymbolCells = [
      ...(puzzle.triangles || []).map((t) => [t[0], t[1]]),
      ...(puzzle.stars || []).map((s) => [s[0], s[1]]),
      ...(puzzle.cellColors || []).map((c) => [c[0], c[1]]),
      ...(puzzle.eliminators || []).map((e) => [e[0], e[1]]),
    ];
    const eliminatorAdjacency = (puzzle.eliminators || []).some((e) => allSymbolCells.some(
      (cell) => !(cell[0] === e[0] && cell[1] === e[1]) && manhattan(cell, e) === 1,
    ));
    if (eliminatorAdjacency) { fail('eliminator-adjacent'); continue; }

    // The least-used-region bias in the placement functions above reduces imbalanced outcomes but
    // doesn't guarantee them - ties while regionUsage is still all-zero (the first mechanic or two
    // placed) are still a coin flip, and only ONE successful attempt gets accepted, not necessarily
    // the most balanced one that could have been found. Reject outright and retry with a fresh
    // random path if a sizable region (>=4 cells, big enough for "balance" to be a meaningful
    // concept) ended up dramatically denser than another - e.g. one region crammed with symbols
    // while another sits nearly empty.
    const qualifyingRegions = regions.filter((r) => r.length >= 4);
    if (qualifyingRegions.length >= 2) {
      const occupiedCounts = qualifyingRegions.map((r) => r.filter((cell) => occupiedCells.has(cellKey(cell))).length);
      const totalOccupied = occupiedCounts.reduce((sum, n) => sum + n, 0);
      if (totalOccupied >= 3) {
        const densities = qualifyingRegions.map((r, i) => occupiedCounts[i] / r.length);
        const maxDensity = Math.max(...densities);
        const minDensity = Math.min(...densities);
        if (maxDensity > minDensity * 3 + 0.2) { fail('imbalanced-regions'); continue; }
      }
    }

    if (!validateSolution(grid, puzzle, path)) { fail('validateSolution'); continue; }

    // validateSolution above already proves the puzzle is solvable (the drawn path itself is a
    // valid solution) - there's no target window to hit, so countSolutions is only needed as a
    // redundancy-check baseline. Kept deliberately cheap (low cap/expansions): an unconstrained
    // board can have hundreds of raw solutions, and requiring an exact, non-truncated count here
    // would reintroduce the slow, low-yield retry loop this design exists to avoid. If the
    // baseline itself can't be pinned down within that budget, hasRedundantMechanic already
    // treats an inconclusive comparison as "assume fine" rather than retrying.
    const baseline = countSolutions(puzzle, 50, 50000);
    const redundant = hasRedundantMechanic(puzzle, baseline.count, 50, 50000);
    if (redundant) { fail(`redundant:${redundant}`); continue; }

    puzzle.id = `level_${String(levelNumber).padStart(3, '0')}`;
    // See generateIntroLevel's identical comment - stored so "Show Sol." can display and cycle
    // through solutions instantly, with zero search of its own at view time.
    puzzle.solutionPaths = collectStoredSolutions(puzzle, path);
    return puzzle;
  }
  if (debug) {
    console.log(`DEBUG level ${levelNumber} (${recipe.band}) reasons:`, JSON.stringify(Object.fromEntries(reasons)));
  }
  return null;
}

const MAX_BOARD_DIMENSION = 7;

// A recipe that exhausts its attempt budget at its own board size is rare-but-not-impossible,
// not a sign the combination is unsatisfiable - the fix is more room, not infinite retries at
// the same size. Escalate one extra cell per dimension and try again with a fresh budget before
// giving up for real. maxBoardDimension defaults to 7 (flex1-10's own ceiling, rarely hit since
// those bands already succeed within budget most of the time) but the expanded combo phase
// (108-150) passes a lower ceiling explicitly - its bands already START at the documented safe
// maximum (5x5/5x6/6x5, see Section 9.3's board-size reasoning), so growing further would push
// straight past the size range where even the cheap redundancy-check baseline stays affordable,
// and with a denser mechanic pool, its recipes fail their first attempt often enough for that to
// matter in aggregate (confirmed empirically - escalating past 6x6 made individual attempts take
// tens of seconds instead of milliseconds).
function generateFlexibleLevel(levelNumber, recipe, maxAttempts, debug = false, maxBoardDimension = MAX_BOARD_DIMENSION) {
  const found = attemptFlexibleLevel(levelNumber, recipe, maxAttempts, debug);
  if (found) return found;

  const canGrow = recipe.sizes.some(([w, h]) => w < maxBoardDimension && h < maxBoardDimension);
  if (!canGrow) return null;

  const escalated = {
    ...recipe,
    sizes: recipe.sizes.map(([w, h]) => [
      Math.min(w + 1, maxBoardDimension),
      Math.min(h + 1, maxBoardDimension),
    ]),
  };
  return attemptFlexibleLevel(levelNumber, escalated, maxAttempts, debug);
}

// ---------------------------------------------------------------------------
// Expanded combo phase, ids 108-150: per direct follow-up request, mixes the newly-introduced
// mechanics (the directional-node family + Region Size Numbers) into the SAME flexible/
// density-driven design as levels 14-100, rather than leaving them in their own lane. Reuses
// attemptFlexibleLevel/generateFlexibleLevel entirely unchanged - the regionSizes and
// wantDirectionalNode handling added inside attemptFlexibleLevel above only ever activates for
// recipes that actually set those fields, which the ORIGINAL flex1-10 recipes never do, so levels
// 14-100 are unaffected by any of this (same determinism guarantee as the node-lesson phase
// before it). A SEPARATE band list/cell-mechanic pool/recipe builder is used here instead of
// extending FLEXIBLE_BANDS/FLEXIBLE_CELL_MECHANICS/buildFlexibleRecipes directly, for the same
// reason: touching those would shift the RNG stream for the already-locked levels 14-100.
//
// Per direct feedback, the two newly-introduced mechanic families get different treatment here,
// matching how they already behave elsewhere: directional nodes are folded in like
// wantDots/wantRequiredEdges (Section 1.2 already lists these as the safe, no-conflict way to
// hit an extra Node-type mechanic) - one light, independent, optional mark, not the node-lesson
// phase's 2-3-mechanic combined groups. Region Size Numbers is folded in like cellColors/stars -
// a proper cell mechanic that scales with instanceRange and shares the regionUsage bias, not
// capped at 1 like polyominoes.
const EXPANDED_CELL_MECHANICS = [...FLEXIBLE_CELL_MECHANICS, 'regionSizes'];
const DIRECTIONAL_NODE_MECHANICS = ['turnNodes', 'straightNodes', 'horizontalNodes', 'verticalNodes', 'cornerNodes'];

// Continues the difficulty ramp from where flex10 (levels 95-100) left off, rather than resetting
// back down to re-climb - an earlier draft started expand1 at roughly flex6/flex7's density
// (smaller boards, distinctCell 2, cutChance 0.5) specifically to ease the new mechanics in
// gently, but per direct feedback that read as the collection getting EASIER right after level
// 100, not harder. expand1 now starts at flex10's own settings (same board sizes, same
// distinctCell, same-or-higher chances) and all 5 bands ramp further from there - the extra
// headroom beyond flex10 comes from the two NEW density levers this phase adds (regionSizes in
// the cell-mechanic pool, dnChance for the optional directional-node touch), not from pushing
// board size or distinctCell past their already-established safe ceilings (5x5/5x6/6x5, 3 - see
// FLEXIBLE_BANDS' own comments for why those specific ceilings exist). Keeping cutChance high
// throughout (0.85+) is also the safer choice performance-wise, not just the harder-feeling one -
// an open board at this size is what made an earlier, lower-cutChance draft of this table slow
// (see the "expanded combo phase" note in 9.3).
// expand6-10 (levels 151-200) continue the ramp via dnChance (rising toward 0.92) and mechanic
// variety, not via instanceRange or cutChance. Two earlier drafts tried pushing those further:
// one to cutChance 0.96-0.99 + instanceRange [2,4] (a full regen ran past 28 minutes without
// finishing), the other keeping instanceRange at expand4/expand5's own [2,3] with cutChance
// staying in their already-validated 0.92-0.95 range (still produced several 1-3-MINUTE-per-level
// outliers once sampled across 50 levels instead of just 16). Isolating why via per-recipe timing:
// distinctCell 3 at instanceRange [2,3] means up to 9 simultaneous cell-mechanic instances (e.g.
// eliminators+cellColors+triangles at counts [3,3,3]) all needing to satisfy region-balance,
// eliminator-adjacency, and redundancy simultaneously - a combinatorially rare thing to land on
// requiring many attempts, and with FEWER other levels sharing the risk (only 16 levels used this
// density in expand4/5, this table originally asked 50 more to), the rare-but-real slow case
// surfaces more often in aggregate. Fixed by keeping instanceRange at expand1-3's PROVEN-reliable
// [1,2] for expand6-10 (still distinctCell 3 - already denser than flex10 ever was on mechanic
// VARIETY - just not pushing instance COUNT further), so the genuine difficulty increase over
// expand5 comes entirely from dnChance (which is a single independent node mark, untouched by any
// of the above) and cutChance continuing its very modest climb within the validated range.
const EXPANDED_BANDS = [
  { name: 'expand1', count: 9, sizes: [[5, 5], [5, 6], [6, 5]], minEdges: 11, distinctCell: 3, instanceRange: [1, 2], cutChance: 0.85, reqChance: 0.65, dotsChance: 0.75, dnChance: 0.4 },
  { name: 'expand2', count: 9, sizes: [[5, 5], [5, 6], [6, 5]], minEdges: 11, distinctCell: 3, instanceRange: [1, 2], cutChance: 0.88, reqChance: 0.68, dotsChance: 0.78, dnChance: 0.5 },
  { name: 'expand3', count: 9, sizes: [[5, 5], [5, 6], [6, 5]], minEdges: 12, distinctCell: 3, instanceRange: [1, 2], cutChance: 0.9, reqChance: 0.7, dotsChance: 0.8, dnChance: 0.6 },
  { name: 'expand4', count: 8, sizes: [[5, 5], [5, 6], [6, 5]], minEdges: 12, distinctCell: 3, instanceRange: [2, 3], cutChance: 0.92, reqChance: 0.72, dotsChance: 0.82, dnChance: 0.7 },
  { name: 'expand5', count: 8, sizes: [[5, 5], [5, 6], [6, 5]], minEdges: 12, distinctCell: 3, instanceRange: [2, 3], cutChance: 0.95, reqChance: 0.75, dotsChance: 0.85, dnChance: 0.8 },
  { name: 'expand6', count: 10, sizes: [[5, 5], [5, 6], [6, 5]], minEdges: 12, distinctCell: 3, instanceRange: [1, 2], cutChance: 0.92, reqChance: 0.73, dotsChance: 0.83, dnChance: 0.82 },
  { name: 'expand7', count: 10, sizes: [[5, 5], [5, 6], [6, 5]], minEdges: 12, distinctCell: 3, instanceRange: [1, 2], cutChance: 0.93, reqChance: 0.74, dotsChance: 0.84, dnChance: 0.85 },
  { name: 'expand8', count: 10, sizes: [[5, 5], [5, 6], [6, 5]], minEdges: 12, distinctCell: 3, instanceRange: [1, 2], cutChance: 0.94, reqChance: 0.75, dotsChance: 0.85, dnChance: 0.88 },
  { name: 'expand9', count: 10, sizes: [[5, 5], [5, 6], [6, 5]], minEdges: 12, distinctCell: 3, instanceRange: [1, 2], cutChance: 0.95, reqChance: 0.76, dotsChance: 0.86, dnChance: 0.9 },
  { name: 'expand10', count: 10, sizes: [[5, 5], [5, 6], [6, 5]], minEdges: 12, distinctCell: 3, instanceRange: [1, 2], cutChance: 0.95, reqChance: 0.78, dotsChance: 0.88, dnChance: 0.92 },
];

// Multi-solution phase, levels 201-300: per direct request, continues past 200 with the same
// 14-mechanic pool as tier 3 but a NEW win condition (main.js requires requiredSolutions DISTINCT
// valid paths, not just one - see finalizeMultiSolutionLevel above). This inverts the usual
// difficulty lever: every other band table in this file pushes cutChance/reqChance UP to narrow a
// board toward as few solutions as possible, because a single hard-to-find solution was always the
// goal. Here the goal is the opposite - a board needs to stay open enough for multiple genuinely
// different routes to coexist, or requiredSolutions always collapses to 1 and the new mechanic
// never shows up. Piloted before committing to these numbers: at expand10-style settings
// (cutChance 0.95, reqChance 0.78), 8 of 12 sampled levels found only 1 solution even after
// searching up to MAX_MULTI_SOLUTION_SEARCH; dropping to cutChance ~0.4-0.6 and reqChance ~0.2-0.4
// (this table) raised that to 7 of 12 getting a real 2-or-3 requirement. distinctCell/instanceRange
// are UNCHANGED from expand10 - this phase's difficulty is meant to come from "find several ways
// through", not from a diluted version of the density that drives tiers 0-3.
const MULTI_SOLUTION_BANDS = [
  { name: 'multi1', count: 10, sizes: [[5, 5], [5, 6], [6, 5]], minEdges: 12, distinctCell: 3, instanceRange: [1, 2], cutChance: 0.4, reqChance: 0.2, dotsChance: 0.8, dnChance: 0.5 },
  { name: 'multi2', count: 10, sizes: [[5, 5], [5, 6], [6, 5]], minEdges: 12, distinctCell: 3, instanceRange: [1, 2], cutChance: 0.45, reqChance: 0.25, dotsChance: 0.82, dnChance: 0.6 },
  { name: 'multi3', count: 9, sizes: [[5, 5], [5, 6], [6, 5]], minEdges: 12, distinctCell: 3, instanceRange: [1, 2], cutChance: 0.5, reqChance: 0.3, dotsChance: 0.84, dnChance: 0.65 },
  { name: 'multi4', count: 9, sizes: [[5, 5], [5, 6], [6, 5]], minEdges: 12, distinctCell: 3, instanceRange: [1, 2], cutChance: 0.5, reqChance: 0.3, dotsChance: 0.86, dnChance: 0.7 },
  { name: 'multi5', count: 9, sizes: [[5, 5], [5, 6], [6, 5]], minEdges: 12, distinctCell: 3, instanceRange: [1, 2], cutChance: 0.55, reqChance: 0.35, dotsChance: 0.86, dnChance: 0.75 },
  { name: 'multi6', count: 9, sizes: [[5, 5], [5, 6], [6, 5]], minEdges: 12, distinctCell: 3, instanceRange: [1, 2], cutChance: 0.55, reqChance: 0.35, dotsChance: 0.88, dnChance: 0.8 },
  { name: 'multi7', count: 9, sizes: [[5, 5], [5, 6], [6, 5]], minEdges: 12, distinctCell: 3, instanceRange: [1, 2], cutChance: 0.6, reqChance: 0.4, dotsChance: 0.88, dnChance: 0.85 },
  { name: 'multi8', count: 10, sizes: [[5, 5], [5, 6], [6, 5]], minEdges: 12, distinctCell: 3, instanceRange: [1, 2], cutChance: 0.6, reqChance: 0.4, dotsChance: 0.9, dnChance: 0.9 },
  // multi9-11 (levels 276-300): extends the phase the same way EXPANDED_BANDS was extended twice
  // before (append new bands, never touch existing ones) - appended here specifically so
  // runComboTier's per-level (not per-batch) recipe building leaves levels 201-275 untouched, the
  // same guarantee that already let EXPANDED_BANDS grow from 43 to 93 levels safely. cutChance/
  // reqChance deliberately held FLAT at multi7/multi8's own level rather than climbing further -
  // pushing them higher would narrow the board back toward one solution, directly undermining the
  // whole point of this phase (see the note above). dnChance continues the ramp instead, mirroring
  // exactly how expand6-10 handled the same problem for tier 3: it's a single independent node
  // mark that never touches cell-mechanic placement feasibility, so it's the safe lever to keep
  // escalating once cutChance/distinctCell are already sitting at their validated ceiling.
  { name: 'multi9', count: 9, sizes: [[5, 5], [5, 6], [6, 5]], minEdges: 12, distinctCell: 3, instanceRange: [1, 2], cutChance: 0.6, reqChance: 0.4, dotsChance: 0.9, dnChance: 0.92 },
  { name: 'multi10', count: 8, sizes: [[5, 5], [5, 6], [6, 5]], minEdges: 12, distinctCell: 3, instanceRange: [1, 2], cutChance: 0.6, reqChance: 0.4, dotsChance: 0.9, dnChance: 0.94 },
  { name: 'multi11', count: 8, sizes: [[5, 5], [5, 6], [6, 5]], minEdges: 12, distinctCell: 3, instanceRange: [1, 2], cutChance: 0.6, reqChance: 0.4, dotsChance: 0.92, dnChance: 0.95 },
];

// Builds exactly ONE recipe for the given band, drawing only from whichever mechanics are
// "unlocked" so far (cellPool/directionalPool) - this is what lets the SAME band table (and the
// same per-band settings, already validated safe) serve every combo tier in generateAll(), with
// each tier just widening the two pools once its lesson has run. Deliberately separate from a
// "build all recipes for this band/phase" function - see the comment on the combo-tier loop in
// generateAll() for why building recipes in one eager batch (even correctly positioned after the
// earlier phases) still isn't safe against future extension: it consumes rng() for every recipe in
// the batch before generating ANY of their levels, so appending new bands - even at the very end -
// shifts the stream position at which the FIRST level in that tier starts generating, silently
// reshuffling every level already locked in. Building one recipe immediately before generating its
// one level (as the loop in generateAll() does) keeps each already-generated level's rng()
// consumption fixed regardless of how many more bands get added later.
//
// When directionalPool is empty, `rng() < band.dnChance` is never evaluated at all (short-circuit,
// not skip-and-discard) - this is load-bearing, not a style choice: a tier before any node lesson
// has run must consume EXACTLY as many rng() calls as the original 8-mechanic-only design did, or
// its levels stop matching what a from-scratch regen with nothing after it would produce.
function buildOneComboRecipe(band, cellPool, directionalPool) {
  // Same polyominoes exclusivity throughout: it claims a whole region outright, so it can only
  // ever share a level with triangles (which doesn't compete for cells at all). One further
  // exclusion once regionSizes is unlocked: it can never share a level with eliminators (the
  // validator doesn't let an eliminator cancel a region-size number, see Section 1.1's caveat) -
  // resolved the same way, by dropping one (eliminators, since regionSizes is the newer addition)
  // and backfilling if the band still expects more distinct mechanics.
  const pool = band.distinctCell >= 3
    ? cellPool.filter((m) => m !== 'polyominoes')
    : cellPool;
  let cellMechanics = shuffle(pool).slice(0, band.distinctCell);
  if (cellMechanics.includes('polyominoes')) {
    cellMechanics = cellMechanics.filter((m) => m === 'polyominoes' || m === 'triangles');
    if (!cellMechanics.includes('triangles') && cellMechanics.length < band.distinctCell) {
      cellMechanics = [...cellMechanics, 'triangles'];
    }
  } else if (cellMechanics.includes('regionSizes') && cellMechanics.includes('eliminators')) {
    cellMechanics = cellMechanics.filter((m) => m !== 'eliminators');
    const backfillPool = pool.filter((m) => m !== 'eliminators' && !cellMechanics.includes(m));
    if (cellMechanics.length < band.distinctCell && backfillPool.length) {
      cellMechanics = [...cellMechanics, choice(backfillPool)];
    }
  }

  const [minInstances, maxInstances] = band.instanceRange;
  const instanceCounts = cellMechanics.map((mechanic) => {
    const count = minInstances + randInt(maxInstances - minInstances + 1);
    // polyominoes needs a whole exact-shape region (rare) - capped at 1 regardless of band,
    // same as the original flexible phase. regionSizes gets no special cap - it behaves like
    // cellColors/stars, scaling with instanceRange and sharing the same regionUsage bias
    // (see attemptFlexibleLevel's regionSizes branch and addRegionSizes).
    if (mechanic === 'polyominoes') return 1;
    return count;
  });

  const colorsIdx = cellMechanics.indexOf('cellColors');
  const starsIdx = cellMechanics.indexOf('stars');
  if (colorsIdx !== -1 && starsIdx === -1) {
    instanceCounts[colorsIdx] = Math.max(2, instanceCounts[colorsIdx]);
  }

  const wantDirectionalNode = directionalPool.length > 0 && rng() < band.dnChance;
  return {
    band: band.name,
    sizes: band.sizes,
    minEdges: band.minEdges,
    cellMechanics,
    instanceCounts,
    wantCut: rng() < band.cutChance,
    wantRequiredEdges: rng() < band.reqChance,
    wantDots: rng() < band.dotsChance,
    wantDirectionalNode,
    directionalNodeMechanic: wantDirectionalNode ? choice(directionalPool) : null,
  };
}

// Thin, pool-fixed wrapper kept for anything still calling the original name (e.g.
// buildExpandedFlexibleRecipes below) - generateAll() itself now calls buildOneComboRecipe
// directly with whichever pools the current tier has unlocked.
function buildOneExpandedRecipe(band) {
  return buildOneComboRecipe(band, EXPANDED_CELL_MECHANICS, DIRECTIONAL_NODE_MECHANICS);
}

// Convenience wrapper for introspection/debugging (e.g. inspecting what a band would produce) -
// NOT used by generateAll() itself, since building every recipe in one batch is exactly the eager
// pattern buildOneExpandedRecipe's own comment warns against. Calling this consumes rng() for
// every recipe across every band, so treat it as a read-only diagnostic, never mix it into an
// actual generation run.
export function buildExpandedFlexibleRecipes() {
  const recipes = [];
  for (const band of EXPANDED_BANDS) {
    for (let i = 0; i < band.count; i++) {
      recipes.push(buildOneExpandedRecipe(band));
    }
  }
  return recipes;
}

// A requiredEdges+regionSizes lesson supplied directly by the user as raw JSON, not searched for.
// Verified against the real engine before ever being installed (findSolutionPath/
// validateSolution/countSolutions via a temp harness - solvable, 4 total solutions, not
// truncated). Encoded here (rather than left as a live-JSON-only patch like levels 7/9/33)
// because inserting it shifts every id after it - hardcoding the insertion point directly in
// generateAll() keeps the generator's own numbering permanently in sync with the live file,
// instead of requiring a manual insert-and-shift patch on every future regeneration.
const HAND_AUTHORED_REGION_SIZE_LESSON = {
  width: 3,
  height: 2,
  start: [0, 0],
  exits: [[3, 2]],
  requiredEdges: [[[1, 0], [2, 0]]],
  regionSizes: [
    [2, 1, 1],
    [0, 1, 2],
    [1, 0, 2],
  ],
};

// Interleaved schedule (2026-08-08 restructure): the 6 mechanics originally held back for a single
// node-lesson block at 101+ are instead unlocked in 3 small steps spread across the SAME range
// that used to be one 87-level plateau on a fixed 8-mechanic toolset - so no stretch of the
// collection goes more than ~27 levels without something new becoming eligible. Per direct
// instruction the intro phase (1-13) is untouched; only what used to be the flexible/node-lesson/
// expanded phases gets reordered. FLEXIBLE_BANDS' 10 existing bands and EXPANDED_BANDS' 10 existing
// bands are reused wholesale, unmodified in count or per-band tuning (all of it already validated
// safe) - a tier only ever widens WHICH mechanics buildOneComboRecipe is allowed to draw from, via
// cellPool/directionalPool, never the underlying band settings themselves:
//   tier0 (flex1-3, 8 mechanics)         -> lessonA (turnNodes+straightNodes)
//   tier1 (flex4-6, +2 node mechanics)   -> lessonB (horizontalNodes+verticalNodes+cornerNodes)
//   tier2 (flex7-9, +3 more, 5 total)    -> lessonC (regionSizes, + the hand-authored insertion)
//   tier3 (flex10+expand1-10, all 14)    -> the collection's full-density finale, unchanged shape
// Because nothing before tier0 changes and tier0 draws from the exact same pool with the exact same
// bands as the original flexible phase's first 3, levels 1-40 come out byte-for-byte identical to
// before this restructure - verified after every regen, not just assumed. Levels 41-200 are new:
// lessonA/B/C generate fresh material inline (kept simple, cheap - lessons have never been the slow
// part of this generator), but the ACTUAL "reuse" bookmarked for this restructure fetches the old
// 101-107 content directly from the previously-live file at merge time rather than trusting the
// fresh in-line lesson output verbatim - reusing already-tested content over regenerated content
// that was never asked to change, per direct instruction to prefer reuse where it cuts real work.
// See the rulebook (Section 9.1) and project memory for the full before/after picture.
export function generateAll({ maxAttemptsIntro = 600, maxAttemptsFlexible = 4000, onProgress = () => {}, debugLevel = null } = {}) {
  const levels = [];
  const introRecipes = buildIntroRecipes();

  introRecipes.forEach((recipe, i) => {
    const levelNumber = i + 1;
    const level = generateIntroLevel(levelNumber, recipe.mechanic, recipe.tier);
    if (!level) throw new Error(`Failed to generate intro level ${levelNumber} (${recipe.mechanic} tier ${recipe.tier})`);
    levels.push(level);
    onProgress({ levelNumber, phase: 'intro', mechanic: recipe.mechanic, level });
  });

  let levelNumber = introRecipes.length;

  function runComboTier(phase, bands, cellPool, directionalPool, maxBoardDimension, postProcess = (level) => level) {
    for (const band of bands) {
      for (let i = 0; i < band.count; i++) {
        const recipe = buildOneComboRecipe(band, cellPool, directionalPool);
        levelNumber += 1;
        let level = generateFlexibleLevel(levelNumber, recipe, maxAttemptsFlexible, levelNumber === debugLevel, maxBoardDimension);
        if (!level) throw new Error(`Failed to generate ${phase} level ${levelNumber} (${recipe.band})`);
        level = postProcess(level);
        levels.push(level);
        onProgress({ levelNumber, phase, band: recipe.band, level });
      }
    }
  }

  function runLesson(group) {
    for (const tier of group.tiers) {
      levelNumber += 1;
      const level = group.type === 'single'
        ? generateIntroLevel(levelNumber, group.mechanics[0], tier)
        : generateNodeComboLevel(levelNumber, group.mechanics, tier);
      if (!level) throw new Error(`Failed to generate lesson level ${levelNumber} (${group.mechanics.join('+')} tier ${tier})`);
      levels.push(level);
      onProgress({ levelNumber, phase: 'lesson', mechanics: group.mechanics, level });

      // The hand-authored requiredEdges+regionSizes lesson is still an INSERTION (not a same-slot
      // override) right after regionSizes' own tier-0 lesson - same position relative to that
      // lesson as before this restructure, just relocated as a block along with it.
      if (group.type === 'single' && group.mechanics[0] === 'regionSizes' && tier === 0) {
        levelNumber += 1;
        const handLevel = { ...HAND_AUTHORED_REGION_SIZE_LESSON, id: `level_${String(levelNumber).padStart(3, '0')}` };
        levels.push(handLevel);
        onProgress({ levelNumber, phase: 'lesson', mechanics: ['requiredEdges', 'regionSizes'], level: handLevel });
      }
    }
  }

  // Tier 0: flex1-3, nothing beyond the original 8 mechanics unlocked yet.
  runComboTier('combo-tier0', FLEXIBLE_BANDS.slice(0, 3), FLEXIBLE_CELL_MECHANICS, [], MAX_BOARD_DIMENSION);

  runLesson(NODE_LESSON_GROUPS[0]); // turnNodes + straightNodes

  // Tier 1: flex4-6, turnNodes/straightNodes now eligible.
  runComboTier('combo-tier1', FLEXIBLE_BANDS.slice(3, 6), FLEXIBLE_CELL_MECHANICS, ['turnNodes', 'straightNodes'], MAX_BOARD_DIMENSION);

  runLesson(NODE_LESSON_GROUPS[1]); // horizontalNodes + verticalNodes + cornerNodes

  // Tier 2: flex7-9, all 5 directional-node mechanics now eligible.
  runComboTier('combo-tier2', FLEXIBLE_BANDS.slice(6, 9), FLEXIBLE_CELL_MECHANICS, DIRECTIONAL_NODE_MECHANICS, MAX_BOARD_DIMENSION);

  runLesson(NODE_LESSON_GROUPS[2]); // regionSizes (+ the hand-authored insertion)

  // Tier 3: flex10 + all of EXPANDED_BANDS, all 14 mechanics eligible - the collection's finale,
  // unchanged in shape from before this restructure (same bands, same counts, same settings).
  // maxBoardDimension capped at 6 (not the default 7) for this whole tier, matching what
  // expand1-10 already used - flex10's own sizes already sit at the documented safe ceiling
  // (5x5/5x6/6x5), so escalating all the way to 7 would push well past it.
  runComboTier('combo-tier3', [FLEXIBLE_BANDS[9], ...EXPANDED_BANDS], EXPANDED_CELL_MECHANICS, DIRECTIONAL_NODE_MECHANICS, 6);

  // Multi-solution phase: same 14-mechanic pool as tier 3, but MULTI_SOLUTION_BANDS trades
  // cutChance/reqChance for openness instead of narrowness (see that table's own comment), and
  // every level gets a requiredSolutions field via finalizeMultiSolutionLevel - main.js reads that
  // to require several distinct valid paths before the level counts as solved, instead of just
  // one. Purely appended after tier 3 - nothing about levels 1-200's own generation changes.
  runComboTier('multi-solution', MULTI_SOLUTION_BANDS, EXPANDED_CELL_MECHANICS, DIRECTIONAL_NODE_MECHANICS, 6, finalizeMultiSolutionLevel);

  return levels;
}

// Exposed for isolated debugging of a single troublesome recipe without re-running everything
// before it.
export { generateFlexibleLevel };
