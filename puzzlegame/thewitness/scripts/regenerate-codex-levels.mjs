import fs from 'fs';
import { Grid } from '../src/engine/Grid.js';
import { validateSolution } from '../src/engine/Validator.js';
import { computeRegions, combinedTraveledEdges } from '../src/engine/Regions.js';
import { POLYOMINO_ROTATIONS } from '../src/engine/Polyominoes.js';

const INPUT_PATH = new URL('../src/puzzles/codex-levels.json', import.meta.url);
const OUTPUT_PATH = new URL('../src/puzzles/codex-levels.json', import.meta.url);
const CAP = 700;
const HEAVY_CAP = 1800;
const COLORS = ['black', 'white', 'blue'];
const TARGET_REBUILD_TO_LEVEL = 150;
const DEBUG_LEVEL = process.env.DEBUG_LEVEL ? Number(process.env.DEBUG_LEVEL) : null;
const ONLY_LEVEL = process.env.ONLY_LEVEL ? Number(process.env.ONLY_LEVEL) : null;
const FROM_LEVEL = process.env.FROM_LEVEL ? Number(process.env.FROM_LEVEL) : 1;
const MAX_ATTEMPTS = process.env.MAX_ATTEMPTS ? Number(process.env.MAX_ATTEMPTS) : 800;
const PERSIST_RANGE = process.env.PERSIST_RANGE === '1';

const ENDGAME_FAMILIES = [
  'grand', 'architect', 'heavy', 'dtre', 'grand',
  'architect', 'heavy', 'rsc', 'grand', 'architect',
  'heavy', 'dtre', 'grand', 'architect', 'heavy',
];

const BONUS_FAMILIES = [
  'grand', 'architect', 'heavy', 'grand', 'dtre',
  'architect', 'heavy', 'grand', 'architect', 'heavy',
  'grand', 'architect', 'heavy', 'grand', 'architect',
];

const FAMILY_ORDER = [...ENDGAME_FAMILIES, ...BONUS_FAMILIES];

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

function randInt(limit) {
  return Math.floor(Math.random() * limit);
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

function manhattan(a, b) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

function normalizeCells(cells) {
  const minCol = Math.min(...cells.map(([col]) => col));
  const minRow = Math.min(...cells.map(([, row]) => row));
  return cells
    .map(([col, row]) => [col - minCol, row - minRow])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

function cellSignature(cells) {
  return normalizeCells(cells)
    .map(([col, row]) => `${col},${row}`)
    .join('|');
}

function edgeKey(a, b) {
  return [a, b]
    .map(([col, row]) => `${col},${row}`)
    .sort()
    .join('|');
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

function dedupeCells(cells) {
  const seen = new Set();
  const unique = [];
  for (const cell of cells) {
    const key = `${cell[0]},${cell[1]},${cell[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(cell);
  }
  return unique;
}

function dedupeNodes(nodes) {
  const seen = new Set();
  const unique = [];
  for (const node of nodes) {
    const key = nodeKey(node);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(node);
  }
  return unique;
}

function cellCoordKey([col, row]) {
  return `${col},${row}`;
}

function occupiedCellSet(entries = []) {
  return new Set(entries.map((entry) => cellCoordKey(entry)));
}

function mergeOccupiedCells(...groups) {
  const merged = new Set();
  groups.forEach((group) => {
    group.forEach((key) => merged.add(key));
  });
  return merged;
}

function hasMechanicOverlap(puzzle) {
  const seen = new Map();
  for (const key of ['triangles', 'cellColors', 'stars', 'eliminators', 'polyominoes']) {
    for (const entry of puzzle[key] || []) {
      const coord = cellCoordKey(entry);
      if (!seen.has(coord)) seen.set(coord, new Set());
      seen.get(coord).add(key);
    }
  }
  for (const keys of seen.values()) {
    if (keys.size > 1) return true;
  }
  return false;
}

function randomBorderNode(width, height) {
  const side = randInt(4);
  if (side === 0) return [randInt(width + 1), 0];
  if (side === 1) return [width, randInt(height + 1)];
  if (side === 2) return [randInt(width + 1), height];
  return [0, randInt(height + 1)];
}

function reflectNode(width, height, [col, row]) {
  return [width - col, height - row];
}

function pathEdgeList(path) {
  const edges = [];
  for (let i = 1; i < path.length; i++) edges.push([path[i - 1], path[i]]);
  return edges;
}

function pathEdgeSet(path) {
  return new Set(pathEdgeList(path).map(([a, b]) => edgeKey(a, b)));
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
      cuts.push({
        axis: 'vertical',
        index: boundary,
        edges: all.filter((edge) => edgeKey(edge[0], edge[1]) !== edgeKey(open[0][0], open[0][1])),
      });
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
      cuts.push({
        axis: 'horizontal',
        index: boundary,
        edges: all.filter((edge) => edgeKey(edge[0], edge[1]) !== edgeKey(open[0][0], open[0][1])),
      });
    }
  }

  return cuts;
}

function chooseCuts(width, height, path, count) {
  if (count <= 0) return [];
  const cuts = shuffle(availableFullCuts(width, height, path));
  const chosen = [];
  const usedAxis = new Set();
  for (const cut of cuts) {
    const signature = `${cut.axis}:${cut.index}`;
    if (usedAxis.has(signature)) continue;
    usedAxis.add(signature);
    chosen.push(...cut.edges);
    if (usedAxis.size >= count) break;
  }
  if (usedAxis.size < count) return null;
  return dedupeEdges(chosen);
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
      [node[0] + 1, node[1]],
      [node[0] - 1, node[1]],
      [node[0], node[1] + 1],
      [node[0], node[1] - 1],
    ])
      .filter(([col, row]) => col >= 0 && col <= width && row >= 0 && row <= height)
      .sort((a, b) => manhattan(a, exit) - manhattan(b, exit) + (Math.random() * 2 - 1));

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

function isEdgeBlocked(grid, puzzle, a, b) {
  const key = grid.edgeKey(a, b);
  return (puzzle.blockedEdges || []).some((edge) => grid.edgeKey(edge[0], edge[1]) === key);
}

function countSolutions(puzzle, cap = CAP) {
  const grid = new Grid(puzzle.width, puzzle.height);
  const exits = new Set((puzzle.exits || []).map(([col, row]) => `${col},${row}`));
  const seen = new Set([grid.nodeKey(puzzle.start)]);
  let count = 0;

  function dfs(path, node) {
    if (count >= cap) return;
    if (path.length > 1 && exits.has(grid.nodeKey(node)) && validateSolution(grid, puzzle, path)) {
      count += 1;
    }
    for (const next of [
      [node[0] + 1, node[1]],
      [node[0] - 1, node[1]],
      [node[0], node[1] + 1],
      [node[0], node[1] - 1],
    ]) {
      if (next[0] < 0 || next[0] > puzzle.width || next[1] < 0 || next[1] > puzzle.height) continue;
      const key = grid.nodeKey(next);
      if (seen.has(key)) continue;
      if (isEdgeBlocked(grid, puzzle, node, next)) continue;
      seen.add(key);
      path.push(next);
      dfs(path, next);
      path.pop();
      seen.delete(key);
    }
  }

  dfs([puzzle.start], puzzle.start);
  return count;
}

function getNodeIndexMap(path) {
  const indices = new Map();
  for (let i = 1; i < path.length - 1; i++) {
    indices.set(nodeKey(path[i]), i);
  }
  return indices;
}

function getEdgeIndexMap(path) {
  const indices = new Map();
  for (let i = 1; i < path.length; i++) {
    indices.set(edgeKey(path[i - 1], path[i]), i);
  }
  return indices;
}

function directGuideProfile(puzzle, path) {
  const nodeIndices = getNodeIndexMap(path);
  const edgeIndices = getEdgeIndexMap(path);
  const totalEdges = Math.max(1, path.length - 1);
  const progressEntries = [];

  for (const node of puzzle.dots || []) {
    const index = nodeIndices.get(nodeKey(node));
    if (index !== undefined) progressEntries.push(index / totalEdges);
  }
  for (const edge of puzzle.requiredEdges || []) {
    const index = edgeIndices.get(edgeKey(edge[0], edge[1]));
    if (index !== undefined) progressEntries.push((index - 0.5) / totalEdges);
  }

  const guideCoverage = progressEntries.reduce((sum, progress) => {
    if (progress >= 0.22 && progress <= 0.78) return sum + 1;
    if (progress >= 0.12 && progress <= 0.88) return sum + 0.6;
    return sum + 0.25;
  }, 0) / totalEdges;

  const middleGuides = progressEntries.filter((progress) => progress >= 0.22 && progress <= 0.78).length;
  const deductiveFamilies = [
    puzzle.symmetry ? 'symmetry' : null,
    puzzle.triangles?.length ? 'triangles' : null,
    puzzle.cellColors?.length ? 'cellColors' : null,
    puzzle.stars?.length ? 'stars' : null,
    puzzle.eliminators?.length ? 'eliminators' : null,
    puzzle.polyominoes?.length ? 'polyominoes' : null,
  ].filter(Boolean).length;

  return {
    directGuideCount: progressEntries.length,
    guideCoverage,
    middleGuides,
    deductiveFamilies,
  };
}

function isOverGuidedPathPuzzle(puzzle, path, spec) {
  if (spec.stage === 'intro') return false;

  const profile = directGuideProfile(puzzle, path);
  if (spec.stage === 'bridge') {
    if (profile.guideCoverage > 0.58 && profile.deductiveFamilies <= 1) return true;
    if (profile.directGuideCount >= 5 && profile.middleGuides >= 4 && profile.deductiveFamilies <= 1) return true;
    return false;
  }

  if (profile.guideCoverage > 0.48 && profile.deductiveFamilies <= 1) return true;
  if (profile.guideCoverage > 0.42 && profile.middleGuides >= 4 && profile.deductiveFamilies <= 2) return true;
  if (profile.directGuideCount >= 6 && profile.deductiveFamilies <= 2) return true;
  return false;
}

function activeMechanics(puzzle) {
  return [
    ...(puzzle.dots?.length ? ['dots'] : []),
    ...(puzzle.blockedEdges?.length ? ['blockedEdges'] : []),
    ...(puzzle.requiredEdges?.length ? ['requiredEdges'] : []),
    ...(puzzle.symmetry ? ['symmetry'] : []),
    ...(puzzle.triangles?.length ? ['triangles'] : []),
    ...(puzzle.cellColors?.length ? ['cellColors'] : []),
    ...(puzzle.stars?.length ? ['stars'] : []),
    ...(puzzle.eliminators?.length ? ['eliminators'] : []),
    ...(puzzle.polyominoes?.length ? ['polyominoes'] : []),
  ];
}

function stripMechanic(puzzle, key) {
  if (key === 'symmetry') {
    const { symmetry, ...rest } = puzzle;
    return rest;
  }
  const copy = structuredClone(puzzle);
  delete copy[key];
  return copy;
}

function measurePuzzle(puzzle, spec) {
  if (hasMechanicOverlap(puzzle)) return null;
  if (activeMechanics(puzzle).length < spec.minMechanics) return null;

  const count = countSolutions(puzzle, CAP);
  if (count < spec.minCount || count > spec.maxCount || count >= CAP) return null;

  if ((puzzle.blockedEdges || []).length > 0 && !(spec.stage === 'intro' && spec.family === 'blocked')) {
    const rawPuzzle = {
      width: puzzle.width,
      height: puzzle.height,
      start: puzzle.start,
      exits: puzzle.exits,
      blockedEdges: puzzle.blockedEdges,
    };
    const rawCount = countSolutions(rawPuzzle, HEAVY_CAP);
    if (rawCount <= count) return null;
  }

  return count;
}

function buildRecipes() {
  const recipes = [];
  const push = (recipe) => recipes.push(recipe);

  for (let i = 0; i < 6; i++) {
    push({
      stage: 'intro',
      family: 'dots',
      sizes: i < 2 ? [[2, 2], [3, 2], [2, 3]] : i < 4 ? [[3, 2], [2, 3], [3, 3]] : [[3, 3], [3, 4], [4, 3]],
      minPathEdges: i < 2 ? 3 : i < 4 ? 4 : 6,
      cutCount: i >= 4 ? 1 : 0,
      dotCount: i < 2 ? 1 : i < 4 ? 2 : 3,
      minCount: 1,
      maxCount: i < 2 ? 40 : i < 4 ? 28 : 20,
      minMechanics: 1,
    });
  }

  for (let i = 0; i < 6; i++) {
    push({
      stage: 'intro',
      family: 'blocked',
      sizes: i < 2 ? [[2, 2], [3, 2], [2, 3]] : [[3, 3], [3, 4], [4, 3]],
      minPathEdges: i < 2 ? 4 : 6 + Math.floor(i / 2),
      cutCount: i < 4 ? 1 : 2,
      dotCount: i < 2 ? 0 : 1,
      requiredCount: i >= 4 ? 1 : 0,
      minCount: 1,
      maxCount: i < 2 ? 40 : i < 4 ? 18 : 12,
      minMechanics: i < 2 ? 1 : 2,
    });
  }

  for (let i = 0; i < 6; i++) {
    push({
      stage: 'intro',
      family: 'required',
      sizes: i < 2 ? [[2, 2], [3, 2], [2, 3]] : [[3, 3], [3, 4], [4, 3]],
      minPathEdges: i < 2 ? 4 : 6 + Math.floor(i / 2),
      cutCount: i >= 4 ? 1 : 0,
      dotCount: i < 3 ? 0 : 1,
      requiredCount: i < 2 ? 1 : 2,
      minCount: 1,
      maxCount: i < 2 ? 40 : i < 4 ? 18 : 12,
      minMechanics: i < 3 ? 1 : 2,
    });
  }

  for (let i = 0; i < 4; i++) {
    push({
      stage: 'intro',
      family: 'symmetry',
      symmetry: true,
      sizes: [[3, 3], [3, 4], [4, 3]],
      minPathEdges: 5 + i,
      dotCount: i < 2 ? 1 : 2,
      triangleCount: i >= 2 ? 1 : 0,
      minCount: 1,
      maxCount: i < 2 ? 18 : 12,
      minMechanics: 1,
    });
  }

  for (let i = 0; i < 6; i++) {
    push({
      stage: 'intro',
      family: 'triangles',
      sizes: [[3, 3], [3, 4], [4, 3]],
      minPathEdges: 6 + Math.floor(i / 2),
      cutCount: i >= 4 ? 1 : 0,
      dotCount: i < 2 ? 0 : 1,
      triangleCount: i < 2 ? 1 : 2,
      minCount: 1,
      maxCount: i < 2 ? 16 : i < 4 ? 12 : 8,
      minMechanics: i < 2 ? 1 : 2,
    });
  }

  for (let i = 0; i < 6; i++) {
    push({
      stage: 'intro',
      family: 'colors',
      sizes: i < 2 ? [[2, 2], [3, 2], [2, 3]] : [[3, 3], [3, 4], [4, 3]],
      minPathEdges: i < 2 ? 4 : 6 + Math.floor(i / 2),
      cutCount: i >= 4 ? 1 : 0,
      dotCount: i < 3 ? 0 : 1,
      colorRegionCount: 2,
      colorCellsPerRegion: i < 2 ? 1 : 2,
      minCount: 1,
      maxCount: i < 2 ? 40 : i < 4 ? 18 : 12,
      minMechanics: i < 3 ? 1 : 2,
    });
  }

  for (let i = 0; i < 6; i++) {
    push({
      stage: 'intro',
      family: 'stars',
      sizes: [[3, 3], [3, 4], [4, 3]],
      minPathEdges: 7 + Math.floor(i / 2),
      cutCount: i >= 4 ? 1 : 0,
      dotCount: i < 2 ? 0 : 1,
      requiredCount: i >= 3 ? 1 : 0,
      minCount: 1,
      maxCount: i < 2 ? 14 : i < 4 ? 10 : 8,
      minMechanics: 2,
    });
  }

  for (let i = 0; i < 6; i++) {
    push({
      stage: 'intro',
      family: 'eliminators',
      sizes: [[3, 3], [3, 4], [4, 3]],
      minPathEdges: 7 + Math.floor(i / 2),
      cutCount: i >= 4 ? 1 : 0,
      dotCount: i < 2 ? 0 : 1,
      requiredCount: i >= 3 ? 1 : 0,
      minCount: 1,
      maxCount: i < 2 ? 12 : i < 4 ? 10 : 7,
      minMechanics: 2,
    });
  }

  for (let i = 0; i < 6; i++) {
    push({
      stage: 'intro',
      family: 'poly',
      sizes: [[3, 3], [3, 4], [4, 3], [4, 4]],
      minPathEdges: 7 + Math.floor(i / 2),
      cutCount: i >= 4 ? 1 : 0,
      dotCount: i < 2 ? 0 : 1,
      requiredCount: i >= 3 ? 1 : 0,
      colorRegionCount: i >= 4 ? 2 : 0,
      colorCellsPerRegion: 2,
      minCount: 1,
      maxCount: i < 2 ? 12 : i < 4 ? 9 : 7,
      minMechanics: i >= 4 ? 2 : 1,
    });
  }

  const bridgeFamilies = ['dbc', 'drt', 'rsc', 'dst', 'dbrc', 'dtre', 'dbp'];
  for (let i = 0; i < 34; i++) {
    push({
      stage: 'bridge',
      family: bridgeFamilies[i % bridgeFamilies.length],
    });
  }

  const comboFamilies = ['heavy', 'grand', 'architect', 'drt', 'rsc', 'dbp'];
  for (let i = 0; i < 30; i++) {
    push({
      stage: 'combo',
      family: comboFamilies[i % comboFamilies.length],
    });
  }

  const hardFamilies = ['heavy', 'grand', 'architect', 'dtre', 'dbp'];
  for (let i = 0; i < 30; i++) {
    push({
      stage: 'hard',
      family: hardFamilies[i % hardFamilies.length],
    });
  }

  return recipes;
}

function buildSpec(recipe) {
  const byStage = {
    intro: {
      sizes: [[3, 3], [3, 4], [4, 3]],
      minCount: 1,
      maxCount: 12,
      minPathEdges: 6,
      cutCount: 0,
      dotCount: 1,
      requiredCount: 0,
      triangleCount: 1,
      colorRegionCount: 2,
      colorCellsPerRegion: 2,
      minMechanics: 1,
      symmetry: false,
    },
    bridge: {
      sizes: [[3, 4], [4, 3], [4, 4]],
      minCount: 1,
      maxCount: 14,
      minPathEdges: 8,
      cutCount: 1,
      dotCount: 1,
      requiredCount: 1,
      triangleCount: 1,
      colorRegionCount: 2,
      colorCellsPerRegion: 2,
      minMechanics: 2,
      symmetry: false,
    },
    combo: {
      sizes: [[4, 4], [4, 5], [5, 4]],
      minCount: 1,
      maxCount: 10,
      minPathEdges: 10,
      cutCount: 1,
      dotCount: 1,
      requiredCount: 1,
      triangleCount: 2,
      colorRegionCount: 2,
      colorCellsPerRegion: 2,
      minMechanics: 3,
      symmetry: false,
    },
    hard: {
      sizes: [[4, 4], [4, 5], [5, 4]],
      minCount: 1,
      maxCount: 8,
      minPathEdges: 12,
      cutCount: 1,
      dotCount: 2,
      requiredCount: 1,
      triangleCount: 2,
      colorRegionCount: 3,
      colorCellsPerRegion: 2,
      minMechanics: 3,
      symmetry: false,
    },
  };

  const base = { ...byStage[recipe.stage], ...recipe };

  const familyOverrides = {
    dots: { cutCount: recipe.cutCount ?? 0, requiredCount: recipe.requiredCount ?? 0 },
    blocked: {},
    required: {},
    symmetry: { symmetry: true, cutCount: 0, sizes: recipe.sizes || [[3, 3], [3, 4], [4, 3]] },
    triangles: {},
    colors: {},
    stars: { colorRegionCount: 2, colorCellsPerRegion: 2, requiredCount: recipe.requiredCount ?? 0 },
    eliminators: { triangleCount: 1, requiredCount: recipe.requiredCount ?? 0 },
    poly: { colorRegionCount: recipe.colorRegionCount ?? 0, requiredCount: recipe.requiredCount ?? 0 },
    dbc: { minMechanics: 3, cutCount: recipe.stage === 'bridge' ? 1 : 1 },
    drt: { minMechanics: 3, cutCount: recipe.stage === 'bridge' ? 0 : 1, dotCount: recipe.stage === 'hard' ? 2 : 1, requiredCount: recipe.stage === 'hard' ? 2 : 1 },
    rsc: {
      minMechanics: 3,
      cutCount: 0,
      dotCount: recipe.stage === 'bridge' ? 0 : 1,
      requiredCount: recipe.stage === 'hard' ? 2 : 1,
      sizes: recipe.stage === 'bridge' ? [[3, 4], [4, 3], [4, 4]] : recipe.stage === 'combo' ? [[3, 4], [4, 3], [4, 4]] : [[4, 4], [4, 5]],
      minPathEdges: recipe.stage === 'bridge' ? 8 : recipe.stage === 'combo' ? 9 : 11,
      maxCount: recipe.stage === 'hard' ? 10 : 12,
    },
    dst: { minMechanics: 3, symmetry: true, cutCount: 0, sizes: [[3, 4], [4, 3], [4, 4]], requiredCount: recipe.stage === 'bridge' ? 0 : 1 },
    dbrc: { minMechanics: 4, cutCount: recipe.stage === 'bridge' ? 1 : 2, triangleCount: recipe.stage === 'bridge' ? 1 : 2 },
    dtre: { minMechanics: 4, cutCount: recipe.stage === 'hard' ? 1 : 0, dotCount: recipe.stage === 'hard' ? 2 : 1, requiredCount: recipe.stage === 'hard' ? 2 : 1 },
    dbp: {
      minMechanics: 3,
      cutCount: 0,
      dotCount: recipe.stage === 'hard' ? 2 : 1,
      requiredCount: 1,
      colorRegionCount: recipe.stage === 'bridge' ? 0 : recipe.stage === 'hard' ? 3 : 2,
      sizes: recipe.stage === 'hard' ? [[4, 4], [4, 5]] : [[4, 4], [4, 5], [5, 4]],
    },
    heavy: { minMechanics: 4, cutCount: recipe.stage === 'hard' ? 1 : 0, dotCount: recipe.stage === 'hard' ? 2 : 1, requiredCount: recipe.stage === 'hard' ? 2 : 1, triangleCount: recipe.stage === 'hard' ? 3 : 2 },
    grand: { minMechanics: 5, cutCount: recipe.stage === 'hard' ? 1 : 0, dotCount: recipe.stage === 'hard' ? 2 : 1, requiredCount: recipe.stage === 'hard' ? 2 : 1, triangleCount: recipe.stage === 'hard' ? 2 : 2 },
    architect: { minMechanics: 4, cutCount: recipe.stage === 'hard' ? 1 : 0, dotCount: recipe.stage === 'hard' ? 2 : 1, requiredCount: recipe.stage === 'hard' ? 2 : 1, colorRegionCount: recipe.stage === 'hard' ? 2 : 2 },
  };

  return { ...base, ...(familyOverrides[recipe.family] || {}) };
}

function buildContext(spec) {
  for (let attempt = 0; attempt < 500; attempt++) {
    const [width, height] = choice(spec.sizes);
    let start = randomBorderNode(width, height);
    let exit = randomBorderNode(width, height);

    for (let tries = 0; tries < 50; tries++) {
      const reflectedStart = reflectNode(width, height, start);
      const reflectedExit = reflectNode(width, height, exit);
      const okaySymmetry =
        !spec.symmetry || (!sameNode(start, reflectedStart) && !sameNode(exit, reflectedExit));
      if (!sameNode(start, exit) && manhattan(start, exit) >= Math.max(width, height) && okaySymmetry) break;
      start = randomBorderNode(width, height);
      exit = randomBorderNode(width, height);
    }

    const path = randomSimplePath(width, height, start, exit, spec.minPathEdges);
    if (!path) continue;

    const blockedEdges = chooseCuts(width, height, path, spec.cutCount);
    if (blockedEdges === null) continue;
    const puzzleBase = {
      width,
      height,
      start,
      exits: [exit],
      ...(blockedEdges.length ? { blockedEdges } : {}),
      ...(spec.symmetry ? { symmetry: 'rotational' } : {}),
    };
    const grid = new Grid(width, height);
    if (!validateSolution(grid, puzzleBase, path)) continue;

    const regions = computeRegions(grid, puzzleBase, path);
    const traveled = combinedTraveledEdges(grid, puzzleBase, path);

    return { width, height, start, exit, path, puzzleBase, grid, regions, traveled };
  }
  return null;
}

function triangleChoices(context) {
  const choices = [];
  for (let row = 0; row < context.height; row++) {
    for (let col = 0; col < context.width; col++) {
      const count = context.grid
        .cellEdges(col, row)
        .filter(([a, b]) => context.traveled.has(context.grid.edgeKey(a, b))).length;
      if (count >= 1 && count <= 3) choices.push([col, row, count]);
    }
  }
  return shuffle(choices).sort((a, b) => b[2] - a[2]);
}

function chooseColorRegions(context, regionCount, cellsPerRegion, forbidden = new Set()) {
  const candidates = shuffle(context.regions.filter((region) => region.length > 0)).slice(0, regionCount);
  if (candidates.length < 2) return null;
  const cellColors = [];
  candidates.forEach((region, index) => {
    const available = region.filter((cell) => !forbidden.has(cellCoordKey(cell)));
    if (available.length === 0) return;
    sample(available, Math.min(cellsPerRegion, available.length)).forEach(([col, row]) => {
      cellColors.push([col, row, COLORS[index]]);
    });
  });
  if (cellColors.length < 2) return null;
  return dedupeCells(cellColors);
}

function chooseStarSetup(context, forbidden = new Set()) {
  const viable = context.regions.filter((region) => region.length >= 2);
  if (viable.length < 2) return null;
  const [starRegion, colorRegion] = shuffle(viable);
  const starCandidates = starRegion.filter((cell) => !forbidden.has(cellCoordKey(cell)));
  const colorCandidates = colorRegion.filter((cell) => !forbidden.has(cellCoordKey(cell)));
  if (starCandidates.length < 2 || colorCandidates.length < 1) return null;
  const stars = sample(starCandidates, 2).map(([col, row]) => [col, row, 'black']);
  const cellColors = sample(colorCandidates, Math.min(2, colorCandidates.length)).map(([col, row]) => [col, row, 'white']);
  return { stars, cellColors };
}

function choosePolyomino(context, forbidden = new Set()) {
  const matches = [];
  for (const region of context.regions) {
    if (region.length < 2 || region.length > 4) continue;
    const signature = cellSignature(region);
    for (const shape of SHAPE_LOOKUP) {
      if (shape.signature === signature) {
        if (forbidden.has(cellCoordKey(region[0]))) continue;
        matches.push({
          region,
          entry: [region[0][0], region[0][1], shape.name, shape.rotationSteps, false],
        });
      }
    }
  }
  return matches.length ? choice(matches) : null;
}

function pickDots(path, count) {
  return dedupeNodes(pickSpaced(path.slice(1, -1), count));
}

function pickRequiredEdges(path, count) {
  return dedupeEdges(pickSpaced(pathEdgeList(path), count));
}

function generateFamily(spec) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const context = buildContext(spec);
    if (!context) continue;

    let puzzle = null;

    if (spec.family === 'dots') {
      puzzle = {
        ...context.puzzleBase,
        ...(spec.dotCount ? { dots: pickDots(context.path, spec.dotCount) } : {}),
        ...(spec.requiredCount ? { requiredEdges: pickRequiredEdges(context.path, spec.requiredCount) } : {}),
      };
    }

    if (spec.family === 'blocked') {
      puzzle = {
        ...context.puzzleBase,
        ...(spec.dotCount ? { dots: pickDots(context.path, spec.dotCount) } : {}),
        ...(spec.requiredCount ? { requiredEdges: pickRequiredEdges(context.path, spec.requiredCount) } : {}),
      };
    }

    if (spec.family === 'required') {
      puzzle = {
        ...context.puzzleBase,
        ...(spec.dotCount ? { dots: pickDots(context.path, spec.dotCount) } : {}),
        requiredEdges: pickRequiredEdges(context.path, spec.requiredCount),
      };
    }

    if (spec.family === 'symmetry') {
      const triangles = spec.triangleCount > 0 ? triangleChoices(context).slice(0, spec.triangleCount) : [];
      if (spec.triangleCount > 0 && triangles.length < spec.triangleCount) continue;
      puzzle = {
        ...context.puzzleBase,
        ...(spec.dotCount ? { dots: pickDots(context.path, spec.dotCount) } : {}),
        ...(triangles.length ? { triangles } : {}),
      };
    }

    if (spec.family === 'triangles') {
      const triangles = triangleChoices(context).slice(0, spec.triangleCount);
      if (triangles.length < spec.triangleCount) continue;
      puzzle = {
        ...context.puzzleBase,
        ...(spec.dotCount ? { dots: pickDots(context.path, spec.dotCount) } : {}),
        triangles,
      };
    }

    if (spec.family === 'colors') {
      const cellColors = chooseColorRegions(context, spec.colorRegionCount, spec.colorCellsPerRegion);
      if (!cellColors) continue;
      puzzle = {
        ...context.puzzleBase,
        ...(spec.dotCount ? { dots: pickDots(context.path, spec.dotCount) } : {}),
        cellColors,
      };
    }

    if (spec.family === 'stars') {
      const setup = chooseStarSetup(context);
      if (!setup) continue;
      puzzle = {
        ...context.puzzleBase,
        ...(spec.dotCount ? { dots: pickDots(context.path, spec.dotCount) } : {}),
        ...(spec.requiredCount ? { requiredEdges: pickRequiredEdges(context.path, spec.requiredCount) } : {}),
        stars: setup.stars,
        cellColors: setup.cellColors,
      };
    }

    if (spec.family === 'eliminators') {
      const elimRegion = choice(context.regions.filter((region) => region.length >= 2));
      if (!elimRegion) continue;
      const cells = sample(elimRegion, 2);
      const triangles = triangleChoices(context).filter(
        ([col, row]) => !cells.some(([cellCol, cellRow]) => cellCol === col && cellRow === row)
      );
      if (!triangles.length) continue;
      puzzle = {
        ...context.puzzleBase,
        ...(spec.dotCount ? { dots: pickDots(context.path, spec.dotCount) } : {}),
        ...(spec.requiredCount ? { requiredEdges: pickRequiredEdges(context.path, spec.requiredCount) } : {}),
        triangles: [[cells[0][0], cells[0][1], 4], triangles[0]],
        eliminators: [[cells[1][0], cells[1][1]]],
      };
    }

    if (spec.family === 'poly') {
      const poly = choosePolyomino(context);
      if (!poly) continue;
      const forbidden = occupiedCellSet([poly.entry]);
      const cellColors =
        spec.colorRegionCount > 0
          ? chooseColorRegions(context, spec.colorRegionCount, spec.colorCellsPerRegion, forbidden)
          : null;
      if (spec.colorRegionCount > 0 && !cellColors) continue;
      puzzle = {
        ...context.puzzleBase,
        ...(spec.dotCount ? { dots: pickDots(context.path, spec.dotCount) } : {}),
        ...(spec.requiredCount ? { requiredEdges: pickRequiredEdges(context.path, spec.requiredCount) } : {}),
        polyominoes: [poly.entry],
        ...(cellColors ? { cellColors } : {}),
      };
    }

    if (spec.family === 'dbc') {
      const cellColors = chooseColorRegions(context, spec.colorRegionCount, spec.colorCellsPerRegion);
      if (!cellColors) continue;
      puzzle = {
        ...context.puzzleBase,
        dots: pickDots(context.path, spec.dotCount),
        cellColors,
      };
    }

    if (spec.family === 'drt') {
      const triangles = triangleChoices(context).slice(0, spec.triangleCount);
      if (triangles.length < spec.triangleCount) continue;
      puzzle = {
        ...context.puzzleBase,
        dots: pickDots(context.path, spec.dotCount),
        requiredEdges: pickRequiredEdges(context.path, spec.requiredCount),
        triangles,
      };
    }

    if (spec.family === 'rsc') {
      const setup = chooseStarSetup(context);
      if (!setup) continue;
      puzzle = {
        ...context.puzzleBase,
        ...(spec.dotCount ? { dots: pickDots(context.path, 1) } : {}),
        requiredEdges: pickRequiredEdges(context.path, spec.requiredCount),
        stars: setup.stars,
        cellColors: setup.cellColors,
      };
    }

    if (spec.family === 'dst') {
      const triangles = triangleChoices(context).slice(0, spec.triangleCount);
      if (triangles.length < spec.triangleCount) continue;
      puzzle = {
        ...context.puzzleBase,
        dots: pickDots(context.path, spec.dotCount),
        triangles,
        ...(spec.requiredCount ? { requiredEdges: pickRequiredEdges(context.path, 1) } : {}),
      };
    }

    if (spec.family === 'dbrc') {
      const triangles = spec.triangleCount > 0 ? triangleChoices(context).slice(0, spec.triangleCount) : [];
      const triangleCells = occupiedCellSet(triangles);
      const cellColors = chooseColorRegions(
        context,
        spec.colorRegionCount,
        spec.colorCellsPerRegion,
        triangleCells
      );
      if (!cellColors || triangles.length < spec.triangleCount) continue;
      puzzle = {
        ...context.puzzleBase,
        dots: pickDots(context.path, spec.dotCount),
        requiredEdges: pickRequiredEdges(context.path, spec.requiredCount),
        cellColors,
        ...(triangles.length ? { triangles } : {}),
      };
    }

    if (spec.family === 'dtre') {
      const elimRegion = choice(context.regions.filter((region) => region.length >= 2));
      if (!elimRegion) continue;
      const cells = sample(elimRegion, 2);
      const triangles = triangleChoices(context).filter(
        ([col, row]) => !cells.some(([cellCol, cellRow]) => cellCol === col && cellRow === row)
      );
      if (!triangles.length) continue;
      puzzle = {
        ...context.puzzleBase,
        dots: pickDots(context.path, spec.dotCount),
        requiredEdges: pickRequiredEdges(context.path, spec.requiredCount),
        triangles: [[cells[0][0], cells[0][1], 4], triangles[0]],
        eliminators: [[cells[1][0], cells[1][1]]],
      };
    }

    if (spec.family === 'dbp') {
      const poly = choosePolyomino(context);
      if (!poly) continue;
      const forbidden = occupiedCellSet([poly.entry]);
      const cellColors =
        spec.colorRegionCount > 0
          ? chooseColorRegions(context, spec.colorRegionCount, spec.colorCellsPerRegion, forbidden)
          : null;
      if (spec.colorRegionCount > 0 && !cellColors) continue;
      puzzle = {
        ...context.puzzleBase,
        dots: pickDots(context.path, spec.dotCount),
        requiredEdges: pickRequiredEdges(context.path, spec.requiredCount),
        polyominoes: [poly.entry],
        ...(cellColors ? { cellColors } : {}),
      };
    }

    if (spec.family === 'heavy') {
      const triangles = triangleChoices(context).slice(0, spec.triangleCount);
      const triangleCells = occupiedCellSet(triangles);
      const cellColors = chooseColorRegions(
        context,
        spec.colorRegionCount,
        spec.colorCellsPerRegion,
        triangleCells
      );
      if (triangles.length < spec.triangleCount || !cellColors) continue;
      puzzle = {
        ...context.puzzleBase,
        dots: pickDots(context.path, spec.dotCount),
        requiredEdges: pickRequiredEdges(context.path, spec.requiredCount),
        triangles,
        cellColors,
      };
    }

    if (spec.family === 'grand') {
      const setup = chooseStarSetup(context);
      if (!setup) continue;
      const occupied = mergeOccupiedCells(occupiedCellSet(setup.stars), occupiedCellSet(setup.cellColors));
      const triangles = triangleChoices(context).filter(([col, row]) => !occupied.has(cellCoordKey([col, row]))).slice(0, spec.triangleCount);
      if (triangles.length < spec.triangleCount) continue;
      puzzle = {
        ...context.puzzleBase,
        dots: pickDots(context.path, spec.dotCount),
        requiredEdges: pickRequiredEdges(context.path, spec.requiredCount),
        triangles,
        stars: setup.stars,
        cellColors: setup.cellColors,
      };
    }

    if (spec.family === 'architect') {
      const poly = choosePolyomino(context);
      if (!poly) continue;
      const forbidden = occupiedCellSet([poly.entry]);
      const cellColors = chooseColorRegions(context, spec.colorRegionCount, spec.colorCellsPerRegion, forbidden);
      if (!cellColors) continue;
      puzzle = {
        ...context.puzzleBase,
        dots: pickDots(context.path, spec.dotCount),
        requiredEdges: pickRequiredEdges(context.path, spec.requiredCount),
        polyominoes: [poly.entry],
        cellColors,
      };
    }

    if (!puzzle) continue;
    if (isOverGuidedPathPuzzle(puzzle, context.path, spec)) continue;

    const count = measurePuzzle(puzzle, spec);
    if (count === null) continue;

    return { puzzle, count };
  }

  return null;
}

function difficultyScore(puzzle) {
  const mechanics = activeMechanics(puzzle).length;
  const area = puzzle.width * puzzle.height;
  const symbolCount = [
    puzzle.dots?.length || 0,
    puzzle.blockedEdges?.length || 0,
    puzzle.requiredEdges?.length || 0,
    puzzle.triangles?.length || 0,
    puzzle.cellColors?.length || 0,
    puzzle.stars?.length || 0,
    puzzle.eliminators?.length || 0,
    puzzle.polyominoes?.length || 0,
  ].reduce((sum, count) => sum + count, 0);
  const solutionCount = countSolutions(puzzle, CAP);

  return (
    mechanics * 100 +
    area * 6 +
    symbolCount * 3 +
    (puzzle.symmetry ? 10 : 0) -
    solutionCount * 12
  );
}

function rotateDimensions(width, height, turns) {
  return turns % 2 === 0 ? [width, height] : [height, width];
}

function rotateNode(width, height, node, turns) {
  let [col, row] = node;
  let currentWidth = width;
  let currentHeight = height;

  for (let step = 0; step < turns; step++) {
    [col, row] = [currentHeight - row, col];
    [currentWidth, currentHeight] = [currentHeight, currentWidth];
  }

  return [col, row];
}

function rotateCell(width, height, cell, turns) {
  let [col, row] = cell;
  let currentWidth = width;
  let currentHeight = height;

  for (let step = 0; step < turns; step++) {
    [col, row] = [currentHeight - 1 - row, col];
    [currentWidth, currentHeight] = [currentHeight, currentWidth];
  }

  return [col, row];
}

function rotateEdge(width, height, edge, turns) {
  return [
    rotateNode(width, height, edge[0], turns),
    rotateNode(width, height, edge[1], turns),
  ];
}

function rotatePuzzle(puzzle, turns) {
  const normalizedTurns = ((turns % 4) + 4) % 4;
  if (normalizedTurns === 0) return structuredClone(puzzle);

  const [width, height] = rotateDimensions(puzzle.width, puzzle.height, normalizedTurns);
  return {
    ...structuredClone(puzzle),
    width,
    height,
    start: rotateNode(puzzle.width, puzzle.height, puzzle.start, normalizedTurns),
    exits: (puzzle.exits || []).map((exit) => rotateNode(puzzle.width, puzzle.height, exit, normalizedTurns)),
    ...(puzzle.dots ? { dots: puzzle.dots.map((dot) => rotateNode(puzzle.width, puzzle.height, dot, normalizedTurns)) } : {}),
    ...(puzzle.blockedEdges
      ? { blockedEdges: puzzle.blockedEdges.map((edge) => rotateEdge(puzzle.width, puzzle.height, edge, normalizedTurns)) }
      : {}),
    ...(puzzle.requiredEdges
      ? { requiredEdges: puzzle.requiredEdges.map((edge) => rotateEdge(puzzle.width, puzzle.height, edge, normalizedTurns)) }
      : {}),
    ...(puzzle.triangles
      ? {
          triangles: puzzle.triangles.map(([col, row, count]) => {
            const [nextCol, nextRow] = rotateCell(puzzle.width, puzzle.height, [col, row], normalizedTurns);
            return [nextCol, nextRow, count];
          }),
        }
      : {}),
    ...(puzzle.cellColors
      ? {
          cellColors: puzzle.cellColors.map(([col, row, color]) => {
            const [nextCol, nextRow] = rotateCell(puzzle.width, puzzle.height, [col, row], normalizedTurns);
            return [nextCol, nextRow, color];
          }),
        }
      : {}),
    ...(puzzle.stars
      ? {
          stars: puzzle.stars.map(([col, row, color]) => {
            const [nextCol, nextRow] = rotateCell(puzzle.width, puzzle.height, [col, row], normalizedTurns);
            return [nextCol, nextRow, color];
          }),
        }
      : {}),
    ...(puzzle.eliminators
      ? {
          eliminators: puzzle.eliminators.map(([col, row]) => rotateCell(puzzle.width, puzzle.height, [col, row], normalizedTurns)),
        }
      : {}),
    ...(puzzle.polyominoes
      ? {
          polyominoes: puzzle.polyominoes.map(([col, row, name, rotationSteps, isNegative]) => {
            const [nextCol, nextRow] = rotateCell(puzzle.width, puzzle.height, [col, row], normalizedTurns);
            return [nextCol, nextRow, name, (rotationSteps + normalizedTurns) % 4, isNegative];
          }),
        }
      : {}),
  };
}

function buildVariantLevels(sourceLevels, count, signatures) {
  const ranked = sourceLevels
    .map((puzzle) => ({
      sourceId: puzzle.id,
      score: difficultyScore(puzzle),
      puzzle,
    }))
    .sort((a, b) => a.score - b.score || a.sourceId.localeCompare(b.sourceId));
  const hardest = ranked.slice(-Math.min(15, ranked.length));
  const variants = [];

  for (const turns of [1, 3, 2]) {
    for (const entry of hardest) {
      const puzzle = rotatePuzzle(entry.puzzle, turns);
      const signature = canonicalSignature(puzzle);
      if (signatures.has(signature)) continue;
      signatures.add(signature);
      variants.push({
        sourceId: entry.sourceId,
        turns,
        score: entry.score,
        puzzle,
      });
      if (variants.length >= count) return variants;
    }
  }

  return variants;
}

function writeLevels(levels) {
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(levels, null, 2)}\n`, 'utf8');
}

function canonicalSignature(puzzle) {
  const clone = structuredClone(puzzle);
  delete clone.id;
  return JSON.stringify(clone);
}

function buildHandcraftedLevels() {
  return [
    {
      id: 'codex_level_001',
      width: 2,
      height: 2,
      start: [0, 0],
      exits: [[2, 2]],
    },
    {
      id: 'codex_level_002',
      width: 2,
      height: 2,
      start: [0, 2],
      exits: [[2, 0]],
    },
    {
      id: 'codex_level_003',
      width: 2,
      height: 2,
      start: [0, 0],
      exits: [[2, 2]],
      dots: [[1, 1]],
    },
    {
      id: 'codex_level_004',
      width: 3,
      height: 3,
      start: [0, 3],
      exits: [[3, 0]],
      dots: [[1, 2], [2, 1]],
    },
  ];
}

function main() {
  const levels = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
  const combined = levels.slice();
  const handcrafted = buildHandcraftedLevels();
  const recipes = buildRecipes();
  if (recipes.length !== TARGET_REBUILD_TO_LEVEL - handcrafted.length) {
    throw new Error(`Expected ${TARGET_REBUILD_TO_LEVEL - handcrafted.length} recipes, got ${recipes.length}`);
  }

  const startLevel = Math.max(1, FROM_LEVEL);
  const endLevel = ONLY_LEVEL ? ONLY_LEVEL : TARGET_REBUILD_TO_LEVEL;
  if (startLevel > endLevel || endLevel > TARGET_REBUILD_TO_LEVEL) {
    throw new Error(`Invalid generation range: from=${FROM_LEVEL}, only=${ONLY_LEVEL ?? 'all'}`);
  }

  for (let levelNumber = startLevel; levelNumber <= endLevel; levelNumber++) {
    let level;
    if (levelNumber <= handcrafted.length) {
      level = structuredClone(handcrafted[levelNumber - 1]);
    } else {
      const recipe = recipes[levelNumber - handcrafted.length - 1];
      level = generateFamily(buildSpec(recipe))?.puzzle;
      if (!level) {
        throw new Error(`Failed to generate level ${levelNumber} (${recipe.family})`);
      }
      level.id = `codex_level_${String(levelNumber).padStart(3, '0')}`;
    }

    level.id = `codex_level_${String(levelNumber).padStart(3, '0')}`;
    combined[levelNumber - 1] = level;
    if (!ONLY_LEVEL || PERSIST_RANGE) {
      writeLevels(combined);
    }
    console.log(`generated ${level.id}`);
  }

  if (ONLY_LEVEL && !PERSIST_RANGE) return;
  if (combined.length < TARGET_REBUILD_TO_LEVEL) {
    throw new Error(`Expected at least ${TARGET_REBUILD_TO_LEVEL} levels, got ${combined.length}`);
  }
  writeLevels(combined);
  console.log(`Wrote ${combined.length} Codex levels to ${OUTPUT_PATH.pathname}`);
}

main();



