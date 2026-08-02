import fs from 'node:fs';
import { Grid } from '../src/engine/Grid.js';
import { validateSolution } from '../src/engine/Validator.js';
import { computeRegions, combinedTraveledEdges } from '../src/engine/Regions.js';
import { countSolutions } from './verify-level.mjs';

const INPUT_PATH = new URL('../src/puzzles/codex-levels.json', import.meta.url);
const OUTPUT_PATH = new URL('../src/puzzles/codex-levels.json', import.meta.url);
const SEED = 20260801;
const TARGET_TOTAL = 300;
const START_LEVEL = 151;
const COLORS = ['black', 'white', 'blue'];
const DEBUG_LEVEL = process.env.DEBUG_LEVEL ? Number(process.env.DEBUG_LEVEL) : null;
const ONLY_LEVEL = process.env.ONLY_LEVEL ? Number(process.env.ONLY_LEVEL) : null;
const FROM_LEVEL = process.env.FROM_LEVEL ? Number(process.env.FROM_LEVEL) : START_LEVEL;
const MAX_ATTEMPTS = process.env.MAX_ATTEMPTS ? Number(process.env.MAX_ATTEMPTS) : 900;
const PERSIST_RANGE = process.env.PERSIST_RANGE === '1';

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(SEED);

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
  return [a, b]
    .map(([col, row]) => `${col},${row}`)
    .sort()
    .join('|');
}

function manhattan(a, b) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
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

function classifyPath(path) {
  const info = {
    turnNodes: [],
    straightNodes: [],
    horizontalNodes: [],
    verticalNodes: [],
    cornerNodes: [],
  };

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
  const used = new Set();
  for (const cut of cuts) {
    const signature = `${cut.axis}:${cut.index}`;
    if (used.has(signature)) continue;
    used.add(signature);
    chosen.push(...cut.edges);
    if (used.size >= count) break;
  }
  return used.size >= count ? chosen : null;
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
      .sort((a, b) => (manhattan(a, exit) - manhattan(b, exit)) + (rng() * 2 - 1));

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

function randomCornerPair(width, height) {
  return choice([
    [[0, height], [width, 0]],
    [[0, 0], [width, height]],
    [[width, height], [0, 0]],
    [[width, 0], [0, height]],
  ]);
}

function regionData(width, height, puzzle, solutionPath) {
  const grid = new Grid(width, height);
  const regions = computeRegions(grid, puzzle, solutionPath);
  const traveled = combinedTraveledEdges(grid, puzzle, solutionPath);
  return { grid, regions, traveled };
}

function freeCellsInRegion(region, occupied) {
  return region.filter((cell) => !occupied.has(cellKey(cell)));
}

function addDots(puzzle, path, occupiedNodes, count) {
  const candidates = path.slice(1, -1).filter((node) => !occupiedNodes.has(nodeKey(node)));
  const picked = pickSpaced(candidates, count);
  if (picked.length < count) return false;
  puzzle.dots = picked.map((node) => [...node]);
  picked.forEach((node) => occupiedNodes.add(nodeKey(node)));
  return true;
}

function addRequiredEdges(puzzle, path, count) {
  const edges = pathEdgeList(path);
  const picked = pickSpaced(edges, count);
  if (picked.length < count) return false;
  puzzle.requiredEdges = picked.map(([a, b]) => [[...a], [...b]]);
  return true;
}

function addNodeMechanic(puzzle, pathInfo, occupiedNodes, mechanic, count) {
  const source = shuffle(pathInfo[mechanic] || []).filter((entry) => {
    const key = nodeKey(Array.isArray(entry[0]) ? entry : [entry[0], entry[1]]);
    return !occupiedNodes.has(key);
  });
  const picked = pickSpaced(source, count);
  if (picked.length < count) return false;
  if (mechanic === 'cornerNodes') {
    puzzle.cornerNodes = picked.map(([col, row, orientation]) => [col, row, orientation]);
    picked.forEach(([col, row]) => occupiedNodes.add(`${col},${row}`));
  } else {
    puzzle[mechanic] = picked.map((node) => [...node]);
    picked.forEach((node) => occupiedNodes.add(nodeKey(node)));
  }
  return true;
}

function addTriangles(puzzle, grid, traveled, occupiedCells, count) {
  const candidates = [];
  for (let col = 0; col < puzzle.width; col++) {
    for (let row = 0; row < puzzle.height; row++) {
      if (occupiedCells.has(`${col},${row}`)) continue;
      const touching = grid.cellEdges(col, row).filter(([a, b]) => traveled.has(grid.edgeKey(a, b))).length;
      if (touching >= 1 && touching <= 3) candidates.push([col, row, touching]);
    }
  }
  const picked = pickSpaced(shuffle(candidates), count);
  if (picked.length < count) return false;
  puzzle.triangles = picked.map(([col, row, value]) => [col, row, value]);
  picked.forEach(([col, row]) => occupiedCells.add(`${col},${row}`));
  return true;
}

function addCellColors(puzzle, regions, occupiedCells, regionCount, cellsPerRegion) {
  const usableRegions = shuffle(regions.filter((region) => freeCellsInRegion(region, occupiedCells).length >= cellsPerRegion));
  if (usableRegions.length < regionCount) return false;
  const entries = [];
  for (let i = 0; i < regionCount; i++) {
    const color = COLORS[i % COLORS.length];
    const free = freeCellsInRegion(usableRegions[i], occupiedCells);
    const cells = pickSpaced(shuffle(free), cellsPerRegion);
    if (cells.length < cellsPerRegion) return false;
    cells.forEach(([col, row]) => {
      entries.push([col, row, color]);
      occupiedCells.add(`${col},${row}`);
    });
  }
  puzzle.cellColors = entries;
  return true;
}

function addStars(puzzle, regions, occupiedCells, pairCount) {
  const usableRegions = shuffle(regions.filter((region) => freeCellsInRegion(region, occupiedCells).length >= 2));
  if (usableRegions.length < pairCount) return false;
  const entries = [];
  for (let i = 0; i < pairCount; i++) {
    const color = COLORS[i % COLORS.length];
    const free = freeCellsInRegion(usableRegions[i], occupiedCells);
    const cells = pickSpaced(shuffle(free), 2);
    if (cells.length < 2) return false;
    cells.forEach(([col, row]) => {
      entries.push([col, row, color]);
      occupiedCells.add(`${col},${row}`);
    });
  }
  puzzle.stars = entries;
  return true;
}

function splitRegionSize(total, { requireMultiple = false } = {}) {
  if (total < 2) return null;

  const partitions = [];
  function dfs(remaining, parts) {
    if (remaining === 0) {
      if (!requireMultiple || parts.length >= 2) partitions.push([...parts]);
      return;
    }

    for (const value of shuffle([2, 3, 4, 5])) {
      if (value > remaining) continue;
      if (remaining - value === 1) continue;
      parts.push(value);
      dfs(remaining - value, parts);
      parts.pop();
    }
  }

  dfs(total, []);
  if (partitions.length === 0) return null;
  return choice(partitions);
}

function buildRegionSizeNumbers(total, mode) {
  if (total < 2) return null;

  switch (mode) {
    case 'single':
      return total >= 2 && total <= 5 ? [total] : null;
    case 'sum':
      return splitRegionSize(total, { requireMultiple: true });
    case 'mixed':
      if (total >= 2 && total <= 5 && rng() < 0.4) return [total];
      return splitRegionSize(total);
    case 'double-region':
      if (total >= 2 && total <= 5 && rng() < 0.5) return [total];
      return splitRegionSize(total);
    default:
      return total >= 2 && total <= 5 ? [total] : splitRegionSize(total);
  }
}

function addRegionSizes(puzzle, regions, occupiedCells, mode) {
  const entries = [];

  const candidates = shuffle(
    regions
      .map((region) => ({
        region,
        free: shuffle(freeCellsInRegion(region, occupiedCells)),
        numbers: buildRegionSizeNumbers(region.length, mode),
      }))
      .filter(({ region, free, numbers }) => region.length >= 2 && numbers && free.length >= numbers.length)
  );
  if (candidates.length === 0) return false;

  const selected = mode === 'double-region' ? candidates.slice(0, 2) : [candidates[0]];
  if (selected.length === 0 || (mode === 'double-region' && selected.length < 2)) return false;

  for (const { free, numbers } of selected) {
    for (let i = 0; i < numbers.length; i++) {
      const [col, row] = free[i];
      entries.push([col, row, numbers[i]]);
      occupiedCells.add(`${col},${row}`);
    }
  }

  puzzle.regionSizes = entries;
  return true;
}

function mechanicFieldForPrimary(primary) {
  return {
    turn: 'turnNodes',
    straight: 'straightNodes',
    horizontal: 'horizontalNodes',
    vertical: 'verticalNodes',
    corner: 'cornerNodes',
  }[primary] || null;
}

function buildRecipes() {
  const recipes = [];
  const push = (recipe) => recipes.push(recipe);

  const nodeIntro = ['turn', 'straight', 'horizontal', 'vertical'];
  for (const primary of nodeIntro) {
    for (let i = 0; i < 6; i++) {
      push({
        band: 'intro-node',
        primary,
        sizes: [[3, 3], [3, 4]],
        minEdges: 8,
        cutCount: i < 2 ? 0 : 1,
        dotCount: i < 4 ? 2 : 3,
        requiredCount: i < 4 ? 2 : 3,
        primaryCount: i < 2 ? 1 : 2,
        maxCount: i < 2 ? 12 : i < 4 ? 10 : 8,
        minCount: 1,
        support: ['triangles'],
        triangleCount: i < 2 ? 1 : 2,
      });
    }
  }

  for (let i = 0; i < 6; i++) {
    push({
      band: 'intro-corner',
      primary: 'corner',
      sizes: [[3, 4], [4, 3], [4, 4]],
      minEdges: 9,
      cutCount: i < 4 ? 0 : 1,
      dotCount: i < 3 ? 1 : 2,
      requiredCount: i < 3 ? 1 : 2,
      primaryCount: i < 3 ? 1 : 2,
      maxCount: i < 2 ? 20 : i < 4 ? 14 : 10,
      minCount: 1,
      support: i >= 4 ? ['cellColors'] : i >= 2 ? ['triangles'] : [],
      triangleCount: i >= 2 && i < 4 ? 1 : 0,
      colorRegionCount: i >= 4 ? 2 : 0,
      colorCellsPerRegion: 2,
    });
  }

  for (let i = 0; i < 6; i++) {
    push({
      band: 'intro-region-size',
      primary: 'regionSizes',
      sizes: [[3, 3], [3, 4], [4, 4]],
      minEdges: 8,
      cutCount: i < 4 ? 0 : 1,
      dotCount: i < 2 ? 1 : 2,
      requiredCount: i < 2 ? 0 : i < 4 ? 1 : 2,
      regionMode: i < 4 ? 'single' : 'sum',
      maxCount: i < 2 ? 18 : i < 4 ? 12 : 10,
      minCount: 1,
      support: [],
      colorRegionCount: 0,
      colorCellsPerRegion: 2,
    });
  }

  const bridgePrimaries = ['turn', 'straight', 'horizontal', 'vertical', 'corner', 'regionSizes'];
  const bridgeSupports = [
    ['triangles'],
    ['cellColors'],
    ['stars'],
    ['triangles', 'cellColors'],
    ['triangles', 'stars'],
  ];
  for (let i = 0; i < 30; i++) {
    const primary = bridgePrimaries[i % bridgePrimaries.length];
    push({
      band: 'bridge',
      primary,
      sizes: [[4, 4], [4, 5], [5, 4]],
      minEdges: 12,
      cutCount: i % 6 === 0 ? 1 : 0,
      dotCount: primary === 'regionSizes' ? 1 + (i % 2) : 2 + (i % 3 === 0 ? 1 : 0),
      requiredCount: 1 + (i % 4 === 0 ? 1 : 0),
      primaryCount: primary === 'regionSizes' ? 0 : 2 + (i % 2),
      regionMode: primary === 'regionSizes' ? (i % 2 === 0 ? 'single' : 'sum') : null,
      maxCount: 16,
      minCount: 1,
      support: bridgeSupports[i % bridgeSupports.length],
      triangleCount: 1 + (i % 3 === 0 ? 1 : 0),
      colorRegionCount: 2,
      colorCellsPerRegion: 2,
      starPairs: 1,
    });
  }

  const comboPrimaries = ['turn', 'straight', 'horizontal', 'vertical', 'corner', 'regionSizes'];
  for (let i = 0; i < 54; i++) {
    const primary = comboPrimaries[i % comboPrimaries.length];
    const secondary = comboPrimaries[(i + 2) % comboPrimaries.length];
    const doubleNodeCombo = primary !== 'regionSizes' && secondary !== 'regionSizes';
    push({
      band: 'combo',
      primary,
      secondary,
      sizes: [[4, 4], [4, 5], [5, 4], [5, 5]],
      minEdges: 13,
      cutCount: i % 2 === 0 ? 1 : 0,
      dotCount: doubleNodeCombo ? 1 + (i % 4 === 0 ? 1 : 0) : 2 + (i % 4 === 0 ? 1 : 0),
      requiredCount: doubleNodeCombo ? (i % 3 === 0 ? 1 : 0) : 1 + (i % 3 === 0 ? 1 : 0),
      primaryCount: primary === 'regionSizes' ? 0 : doubleNodeCombo ? 2 : 2 + (i % 2),
      secondaryCount: secondary === 'regionSizes' ? 0 : doubleNodeCombo ? 1 : 1 + (i % 4 === 1 ? 1 : 0),
      regionMode:
        primary === 'regionSizes'
          ? (i % 3 === 0 ? 'double-region' : 'mixed')
          : secondary === 'regionSizes'
            ? (i % 2 === 0 ? 'single' : 'sum')
            : null,
      maxCount: doubleNodeCombo ? 12 : 10,
      minCount: 1,
      support: doubleNodeCombo
        ? i % 3 === 0
          ? ['triangles', 'cellColors']
          : i % 3 === 1
            ? ['triangles', 'stars']
            : ['cellColors', 'stars']
        : i % 3 === 0
          ? ['triangles', 'cellColors']
          : i % 3 === 1
            ? ['stars']
            : ['cellColors'],
      triangleCount: doubleNodeCombo ? 2 : 1 + (i % 2),
      colorRegionCount: doubleNodeCombo ? 2 : 2,
      colorCellsPerRegion: 2,
      starPairs: 1,
    });
  }

  for (let i = 0; i < 30; i++) {
    const primary = comboPrimaries[i % comboPrimaries.length];
    const secondary = comboPrimaries[(i + 3) % comboPrimaries.length];
    const usesRegionSizes = primary === 'regionSizes' || secondary === 'regionSizes';
    const hardDoubleNodeCombo = !usesRegionSizes;
    push({
      band: 'hard',
      primary,
      secondary,
      sizes: [[4, 4], [4, 5], [5, 4]],
      minEdges: 14,
      cutCount: usesRegionSizes ? (i % 6 === 0 ? 1 : 0) : i % 3 === 0 ? 1 : 0,
      dotCount: usesRegionSizes ? 2 : 2,
      requiredCount: usesRegionSizes ? 1 + (i % 4 === 0 ? 1 : 0) : 1 + (i % 3 === 0 ? 1 : 0),
      primaryCount: primary === 'regionSizes' ? 0 : hardDoubleNodeCombo ? 1 : 2,
      secondaryCount: secondary === 'regionSizes' ? 0 : 1,
      regionMode:
        primary === 'regionSizes'
          ? (i % 3 === 0 ? 'sum' : 'double-region')
          : secondary === 'regionSizes'
            ? (i % 2 === 0 ? 'single' : 'sum')
            : null,
      maxCount: usesRegionSizes ? 12 : 10,
      minCount: 1,
      support: usesRegionSizes
        ? ['triangles', 'cellColors']
        : i % 3 === 0
          ? ['triangles', 'cellColors']
          : i % 3 === 1
            ? ['triangles', 'stars']
            : ['cellColors', 'stars'],
      triangleCount: usesRegionSizes ? 2 : 2,
      colorRegionCount: usesRegionSizes ? 2 : 3,
      colorCellsPerRegion: 2,
      starPairs: 1,
    });
  }

  return recipes;
}

function activeMechanics(puzzle) {
  return [
    ...(puzzle.dots?.length ? ['dots'] : []),
    ...(puzzle.blockedEdges?.length ? ['blockedEdges'] : []),
    ...(puzzle.requiredEdges?.length ? ['requiredEdges'] : []),
    ...(puzzle.turnNodes?.length ? ['turnNodes'] : []),
    ...(puzzle.straightNodes?.length ? ['straightNodes'] : []),
    ...(puzzle.horizontalNodes?.length ? ['horizontalNodes'] : []),
    ...(puzzle.verticalNodes?.length ? ['verticalNodes'] : []),
    ...(puzzle.cornerNodes?.length ? ['cornerNodes'] : []),
    ...(puzzle.triangles?.length ? ['triangles'] : []),
    ...(puzzle.cellColors?.length ? ['cellColors'] : []),
    ...(puzzle.stars?.length ? ['stars'] : []),
    ...(puzzle.polyominoes?.length ? ['polyominoes'] : []),
    ...(puzzle.regionSizes?.length ? ['regionSizes'] : []),
  ];
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

  const pushNodeEntries = (entries = []) => {
    for (const entry of entries) {
      const key = nodeKey(Array.isArray(entry) ? [entry[0], entry[1]] : entry);
      const index = nodeIndices.get(key);
      if (index !== undefined) progressEntries.push(index / totalEdges);
    }
  };

  pushNodeEntries(puzzle.dots);
  pushNodeEntries(puzzle.turnNodes);
  pushNodeEntries(puzzle.straightNodes);
  pushNodeEntries(puzzle.horizontalNodes);
  pushNodeEntries(puzzle.verticalNodes);
  pushNodeEntries(puzzle.cornerNodes);

  for (const edge of puzzle.requiredEdges || []) {
    const index = edgeIndices.get(edgeKey(edge[0], edge[1]));
    if (index !== undefined) progressEntries.push((index - 0.5) / totalEdges);
  }

  const middleGuides = progressEntries.filter((progress) => progress >= 0.22 && progress <= 0.78).length;
  const weightedGuideScore = progressEntries.reduce((sum, progress) => {
    if (progress >= 0.22 && progress <= 0.78) return sum + 1;
    if (progress >= 0.12 && progress <= 0.88) return sum + 0.6;
    return sum + 0.25;
  }, 0);
  const guideCoverage = weightedGuideScore / totalEdges;

  const deductiveFamilies = [
    puzzle.triangles?.length ? 'triangles' : null,
    puzzle.cellColors?.length ? 'cellColors' : null,
    puzzle.stars?.length ? 'stars' : null,
    puzzle.regionSizes?.length ? 'regionSizes' : null,
    puzzle.polyominoes?.length ? 'polyominoes' : null,
    puzzle.eliminators?.length ? 'eliminators' : null,
  ].filter(Boolean).length;

  return {
    directGuideCount: progressEntries.length,
    middleGuides,
    weightedGuideScore,
    guideCoverage,
    deductiveFamilies,
  };
}

function isOverGuidedPathPuzzle(puzzle, path, recipe) {
  const profile = directGuideProfile(puzzle, path);

  if (recipe.band.startsWith('intro')) return false;
  if (recipe.band === 'bridge') {
    if (profile.guideCoverage > 0.58 && profile.deductiveFamilies <= 1) return true;
    if (profile.guideCoverage > 0.5 && profile.middleGuides >= 5 && profile.deductiveFamilies <= 2) return true;
    if (profile.middleGuides >= 6 && profile.deductiveFamilies <= 2) return true;
    return false;
  }

  if (profile.guideCoverage > 0.5 && profile.deductiveFamilies <= 2) return true;
  if (profile.guideCoverage > 0.42 && profile.middleGuides >= 4 && profile.deductiveFamilies <= 2) return true;
  if (profile.middleGuides >= 5 && profile.deductiveFamilies <= 2) return true;
  if (profile.directGuideCount >= 7 && profile.deductiveFamilies <= 2) return true;
  if (profile.weightedGuideScore >= 5.75 && profile.deductiveFamilies <= 1) return true;
  if (profile.weightedGuideScore >= 6.5 && profile.deductiveFamilies <= 2) return true;

  return false;
}

function generateLevel(levelNumber, recipe) {
  const debugReasons = new Map();
  const fail = (reason) => {
    if (DEBUG_LEVEL === levelNumber) {
      debugReasons.set(reason, (debugReasons.get(reason) || 0) + 1);
    }
    return null;
  };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const [width, height] = choice(recipe.sizes);
    const [start, exit] = randomCornerPair(width, height);
    const path = randomSimplePath(width, height, start, exit, recipe.minEdges);
    if (!path) {
      fail('path');
      continue;
    }

    const pathInfo = classifyPath(path);
    const primaryField = mechanicFieldForPrimary(recipe.primary);
    const secondaryField = mechanicFieldForPrimary(recipe.secondary);
    if (primaryField && (pathInfo[primaryField] || []).length < (recipe.primaryCount || 0)) {
      fail('primaryField');
      continue;
    }
    if (secondaryField && (pathInfo[secondaryField] || []).length < (recipe.secondaryCount || 0)) {
      fail('secondaryField');
      continue;
    }
    if (recipe.primary === 'regionSizes' || recipe.secondary === 'regionSizes') {
      const previewRegions = computeRegions(new Grid(width, height), { width, height, start, exits: [exit] }, path);
      if (previewRegions.length === 0) {
        fail('previewRegions');
        continue;
      }
    }

    const blockedEdges = chooseCuts(width, height, path, recipe.cutCount);
    if (recipe.cutCount > 0 && !blockedEdges) {
      fail('blockedEdges');
      continue;
    }

    const puzzle = {
      id: `codex_level_${String(levelNumber).padStart(3, '0')}`,
      width,
      height,
      start,
      exits: [exit],
    };
    if (blockedEdges?.length) puzzle.blockedEdges = blockedEdges;

    const occupiedNodes = new Set([nodeKey(start), nodeKey(exit)]);
    if (recipe.primary === 'regionSizes') {
      // handled after region computation
    } else if (primaryField) {
      if (!addNodeMechanic(puzzle, pathInfo, occupiedNodes, primaryField, recipe.primaryCount || 0)) {
        fail('addPrimary');
        continue;
      }
    }
    if (recipe.secondary === 'regionSizes') {
      // handled after region computation
    } else if (secondaryField) {
      if (!addNodeMechanic(puzzle, pathInfo, occupiedNodes, secondaryField, recipe.secondaryCount || 0)) {
        fail('addSecondary');
        continue;
      }
    }

    const totalDots = recipe.support?.includes('dots-heavy') ? recipe.dotCount + 1 : recipe.dotCount;
    if (totalDots > 0 && !addDots(puzzle, path, occupiedNodes, totalDots)) {
      fail('dots');
      continue;
    }
    if (recipe.requiredCount > 0 && !addRequiredEdges(puzzle, path, recipe.requiredCount)) {
      fail('requiredEdges');
      continue;
    }

    const { grid, regions, traveled } = regionData(width, height, puzzle, path);
    const occupiedCells = new Set();

    if (recipe.primary === 'regionSizes') {
      if (!addRegionSizes(puzzle, regions, occupiedCells, recipe.regionMode || 'single')) {
        fail('primaryRegionSizes');
        continue;
      }
    } else if (recipe.secondary === 'regionSizes') {
      if (!addRegionSizes(puzzle, regions, occupiedCells, recipe.regionMode || 'single')) {
        fail('secondaryRegionSizes');
        continue;
      }
    }

    if (recipe.support?.includes('triangles')) {
      if (!addTriangles(puzzle, grid, traveled, occupiedCells, recipe.triangleCount || 1)) {
        fail('triangles');
        continue;
      }
    }
    if (recipe.support?.includes('cellColors')) {
      if (!addCellColors(puzzle, regions, occupiedCells, recipe.colorRegionCount || 1, recipe.colorCellsPerRegion || 2)) {
        fail('cellColors');
        continue;
      }
    }
    if (recipe.support?.includes('stars')) {
      if (!addStars(puzzle, regions, occupiedCells, recipe.starPairs || 1)) {
        fail('stars');
        continue;
      }
    }

    if (!validateSolution(grid, puzzle, path)) {
      fail('validateSolution');
      continue;
    }
    if (isOverGuidedPathPuzzle(puzzle, path, recipe)) {
      fail('overGuidedPath');
      continue;
    }
    const minimumMechanics = recipe.band.startsWith('intro') ? 1 : 2;
    if (activeMechanics(puzzle).length < minimumMechanics) {
      fail('minimumMechanics');
      continue;
    }

    const maxExpansions = width * height >= 25 ? 500000 : 350000;
    const measured = countSolutions(puzzle, Math.max(recipe.maxCount + 1, 20), maxExpansions);
    if (measured.truncated || measured.hitCap) {
      fail('solverCap');
      continue;
    }
    if (measured.count < recipe.minCount || measured.count > recipe.maxCount) {
      fail(`solutionCount:${measured.count}`);
      continue;
    }

    return puzzle;
  }

  if (DEBUG_LEVEL === levelNumber) {
    console.log(`debug ${levelNumber}: ${JSON.stringify(Object.fromEntries(debugReasons), null, 2)}`);
  }

  throw new Error(`Failed to generate level ${levelNumber} (${recipe.primary}${recipe.secondary ? ` + ${recipe.secondary}` : ''})`);
}

function main() {
  const existing = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
  const combined = existing.slice();
  const recipes = buildRecipes();
  if (recipes.length !== TARGET_TOTAL - START_LEVEL + 1) {
    throw new Error(`Expected ${TARGET_TOTAL - START_LEVEL + 1} recipes, got ${recipes.length}`);
  }

  const startIndex = Math.max(0, FROM_LEVEL - START_LEVEL);
  const endIndex = ONLY_LEVEL ? ONLY_LEVEL - START_LEVEL : recipes.length - 1;
  if (startIndex > endIndex || endIndex >= recipes.length) {
    throw new Error(`Invalid generation range: from=${FROM_LEVEL}, only=${ONLY_LEVEL ?? 'all'}`);
  }

  for (let i = startIndex; i <= endIndex; i++) {
    const levelNumber = START_LEVEL + i;
    const level = generateLevel(levelNumber, recipes[i]);
    combined[levelNumber - 1] = level;
    if (!ONLY_LEVEL || PERSIST_RANGE) {
      fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(combined, null, 2)}\n`);
    }
    console.log(`generated ${level.id} (${recipes[i].band})`);
  }

  if (ONLY_LEVEL && !PERSIST_RANGE) return;
  if (combined.length !== TARGET_TOTAL) {
    throw new Error(`Expected ${TARGET_TOTAL} total levels, got ${combined.length}`);
  }
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(combined, null, 2) + '\n');
  console.log(`Wrote ${combined.length} Codex levels to ${OUTPUT_PATH.pathname}`);
}

main();



