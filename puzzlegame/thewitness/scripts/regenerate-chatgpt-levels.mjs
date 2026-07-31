import fs from 'fs';
import { Grid } from '../src/engine/Grid.js';
import { validateSolution } from '../src/engine/Validator.js';
import { computeRegions, combinedTraveledEdges } from '../src/engine/Regions.js';
import { POLYOMINO_ROTATIONS } from '../src/engine/Polyominoes.js';

const INPUT_PATH = new URL('../src/puzzles/chatgpt-levels.json', import.meta.url);
const OUTPUT_PATH = new URL('../src/puzzles/chatgpt-levels.json', import.meta.url);
const CAP = 700;
const HEAVY_CAP = 1800;
const COLORS = ['black', 'white', 'blue'];
const REORDER_FROM_LEVEL = 91;
const REORDER_TO_LEVEL = 120;

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

  if ((puzzle.blockedEdges || []).length > 0) {
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

function stageForLevel(levelNumber) {
  if (levelNumber <= 135) return 'endgame';
  return 'bonus';
}

function buildSpec(levelNumber, family) {
  const stage = stageForLevel(levelNumber);
  const byStage = {
    endgame: {
      sizes: [[5, 5], [5, 6], [6, 5]],
      minCount: 1,
      maxCount: 3,
      minPathEdges: 15,
      cutCount: 3,
      dotCount: 3,
      requiredCount: 3,
      triangleCount: 3,
      colorRegionCount: 3,
      colorCellsPerRegion: 2,
      minMechanics: 5,
    },
    bonus: {
      sizes: [[5, 6], [6, 5], [6, 6]],
      minCount: 1,
      maxCount: 2,
      minPathEdges: 17,
      cutCount: 4,
      dotCount: 4,
      requiredCount: 3,
      triangleCount: 3,
      colorRegionCount: 4,
      colorCellsPerRegion: 2,
      minMechanics: 5,
    },
  };

  const base = { family, stage, ...byStage[stage] };

  const overrides = {
    dbc: {},
    drt: { cutCount: 1, triangleCount: 3, dotCount: stage === 'bonus' ? 3 : 2, requiredCount: 2 },
    rsc: { dotCount: stage === 'bonus' ? 2 : 1 },
    dst: {
      symmetry: true,
      cutCount: 0,
      requiredCount: 2,
      sizes: [[4, 3], [3, 4], [4, 4]],
    },
    dbrc: {
      cutCount: 3,
      triangleCount: 2,
    },
    dtre: { cutCount: 1, triangleCount: 1 },
    dbp: {
      dotCount: stage === 'bonus' ? 3 : stage === 'endgame' ? 2 : 1,
      requiredCount: stage === 'bonus' ? 3 : 2,
      colorRegionCount: 3,
    },
    heavy: {
      cutCount: 3,
      dotCount: stage === 'bonus' ? 4 : stage === 'endgame' ? 3 : 2,
      requiredCount: 3,
      triangleCount: stage === 'bonus' ? 3 : stage === 'endgame' ? 3 : 2,
    },
    grand: {
      cutCount: 3,
      dotCount: stage === 'bonus' ? 4 : 3,
      requiredCount: 3,
      triangleCount: stage === 'bonus' ? 3 : 2,
      colorRegionCount: stage === 'bonus' ? 4 : 3,
    },
    architect: {
      cutCount: 3,
      dotCount: stage === 'bonus' ? 4 : stage === 'endgame' ? 3 : 2,
      requiredCount: stage === 'bonus' ? 3 : 2,
      colorRegionCount: stage === 'bonus' ? 4 : 3,
    },
  };

  return { ...base, ...(overrides[family] || {}) };
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
  for (let attempt = 0; attempt < 800; attempt++) {
    const context = buildContext(spec);
    if (!context) continue;

    let puzzle = null;

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

function main() {
  const levels = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
  const prefix = levels.slice(0, REORDER_FROM_LEVEL - 1).map((level) => structuredClone(level));
  const reorderedLate = levels
    .slice(REORDER_FROM_LEVEL - 1, REORDER_TO_LEVEL)
    .map((level) => ({
      originalId: level.id,
      score: difficultyScore(level),
      puzzle: structuredClone(level),
    }))
    .sort((a, b) => a.score - b.score || a.originalId.localeCompare(b.originalId));
  const preserved = prefix
    .concat(reorderedLate.map((entry) => entry.puzzle))
    .map((level, index) => ({
      ...level,
      id: `chatgpt_level_${String(index + 1).padStart(3, '0')}`,
    }));
  const generated = [];
  const signatures = new Set();

  preserved.forEach((puzzle) => signatures.add(canonicalSignature(puzzle)));
  const variants = buildVariantLevels(preserved.slice(REORDER_FROM_LEVEL - 1, REORDER_TO_LEVEL), 30, signatures);
  if (variants.length < 30) {
    throw new Error(`Failed to build enough hard variants: ${variants.length}/30`);
  }

  variants.forEach((entry, offset) => {
    const levelNumber = preserved.length + 1 + offset;
    generated.push({
      level: levelNumber,
      sourceId: entry.sourceId,
      turns: entry.turns,
      score: entry.score,
      puzzle: {
        ...entry.puzzle,
        id: `chatgpt_level_${String(levelNumber).padStart(3, '0')}`,
      },
    });
  });

  const rebuilt = preserved.concat(generated.map((entry) => entry.puzzle));
  writeLevels(rebuilt);

  console.log(
    JSON.stringify(
      {
        preserved: preserved.length,
        regenerated: generated.length,
        reorderedLate: reorderedLate.map(({ originalId, score }, index) => ({
          originalId,
          newLevel: REORDER_FROM_LEVEL + index,
          score,
        })),
        transformedTail: generated.map(({ level, sourceId, turns, score }) => ({
          level,
          sourceId,
          turns,
          score,
        })),
      },
      null,
      2
    )
  );
}

main();
