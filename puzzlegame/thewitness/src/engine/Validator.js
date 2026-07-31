import { satisfiesSymmetry, transformNode } from './Symmetry.js';
import { combinedTraveledNodes, combinedTraveledEdges, computeRegions } from './Regions.js';
import { satisfiesEliminators, findInvalidEliminatorSymbols } from './Eliminators.js';
import { satisfiesPolyominoes, findInvalidPolyominoCells } from './Polyominoes.js';

export function isEdgeBlocked(grid, puzzle, a, b) {
  const key = grid.edgeKey(a, b);
  return (puzzle.blockedEdges || []).some((edge) => grid.edgeKey(edge[0], edge[1]) === key);
}

export function isValidStartNode(grid, puzzle, node) {
  const startKeys = new Set([grid.nodeKey(puzzle.start)]);
  if (puzzle.symmetry) {
    startKeys.add(grid.nodeKey(transformNode(puzzle.symmetry, grid, puzzle.start)));
  }
  return startKeys.has(grid.nodeKey(node));
}

export function isValidPath(grid, puzzle, path) {
  if (path.length < 2) return false;
  if (!isValidStartNode(grid, puzzle, path[0])) return false;

  const seen = new Set([grid.nodeKey(path[0])]);
  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1];
    const curr = path[i];
    if (!grid.isAdjacent(prev, curr)) return false;
    if (isEdgeBlocked(grid, puzzle, prev, curr)) return false;
    const key = grid.nodeKey(curr);
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

export function reachesExit(grid, puzzle, path) {
  const [lc, lr] = path[path.length - 1];
  const exitKeys = new Set((puzzle.exits || []).map(([ec, er]) => `${ec},${er}`));
  if (puzzle.symmetry) {
    for (const exit of puzzle.exits || []) {
      const [mc, mr] = transformNode(puzzle.symmetry, grid, exit);
      exitKeys.add(`${mc},${mr}`);
    }
  }
  return exitKeys.has(`${lc},${lr}`);
}

export function passesAllDots(grid, puzzle, path) {
  const dots = puzzle.dots || [];
  if (dots.length === 0) return true;
  const visited = combinedTraveledNodes(grid, puzzle, path);
  return dots.every((dot) => visited.has(grid.nodeKey(dot)));
}

export function includesRequiredEdges(grid, puzzle, path) {
  const required = puzzle.requiredEdges || [];
  if (required.length === 0) return true;
  const traveled = combinedTraveledEdges(grid, puzzle, path);
  return required.every((edge) => traveled.has(grid.edgeKey(edge[0], edge[1])));
}

export function satisfiesTriangles(grid, puzzle, path) {
  const triangles = puzzle.triangles || [];
  if (triangles.length === 0) return true;
  const traveled = combinedTraveledEdges(grid, puzzle, path);
  return triangles.every(([col, row, count]) => {
    const touching = grid.cellEdges(col, row).filter(([a, b]) => traveled.has(grid.edgeKey(a, b)));
    return touching.length === count;
  });
}

export function satisfiesRegions(grid, puzzle, path) {
  const cellColors = puzzle.cellColors || [];
  if (cellColors.length === 0) return true;
  const colorByCell = new Map(cellColors.map(([col, row, color]) => [`${col},${row}`, color]));

  for (const region of computeRegions(grid, puzzle, path)) {
    const colorsInRegion = new Set(
      region.map(([c, r]) => colorByCell.get(`${c},${r}`)).filter((color) => color !== undefined)
    );
    if (colorsInRegion.size > 1) return false;
  }
  return true;
}

// A star pairs with exactly one other cell of the same color within its region — either
// another star or a plain colored square. A region holding a star may contain no other color.
export function satisfiesStars(grid, puzzle, path) {
  const stars = puzzle.stars || [];
  if (stars.length === 0) return true;
  const starByCell = new Map(stars.map(([col, row, color]) => [`${col},${row}`, color]));
  const colorByCell = new Map((puzzle.cellColors || []).map(([col, row, color]) => [`${col},${row}`, color]));

  for (const region of computeRegions(grid, puzzle, path)) {
    const starColors = new Set(
      region.map(([c, r]) => starByCell.get(`${c},${r}`)).filter((color) => color !== undefined)
    );
    if (starColors.size === 0) continue;
    if (starColors.size > 1) return false;
    const [starColor] = starColors;

    let matching = 0;
    for (const [c, r] of region) {
      const key = `${c},${r}`;
      const cellColor = starByCell.has(key) ? starByCell.get(key) : colorByCell.get(key);
      if (cellColor === undefined) continue;
      if (cellColor !== starColor) return false;
      matching++;
    }
    if (matching !== 2) return false;
  }
  return true;
}

// Eliminators exempt a triangle/color/star from its normal rule, which satisfiesTriangles/
// satisfiesRegions/satisfiesStars can't account for on their own (triangles in particular have
// no notion of "region" at all). When a puzzle has no eliminators this is identical to running
// the three independent checks, so every existing non-eliminator level is completely unaffected.
function satisfiesRegionMechanics(grid, puzzle, path) {
  if ((puzzle.eliminators || []).length > 0) return satisfiesEliminators(grid, puzzle, path);
  return (
    satisfiesTriangles(grid, puzzle, path) &&
    satisfiesRegions(grid, puzzle, path) &&
    satisfiesStars(grid, puzzle, path)
  );
}

function createFailureSet() {
  return {
    dots: new Set(),
    requiredEdges: new Set(),
    triangles: new Set(),
    cellColors: new Set(),
    stars: new Set(),
    eliminators: new Set(),
    polyominoes: new Set(),
  };
}

function serializeFailures(failures) {
  return Object.fromEntries(
    Object.entries(failures).map(([key, values]) => [key, [...values]])
  );
}

function mergeFailures(target, source) {
  for (const [key, values] of Object.entries(source)) {
    if (!target[key]) continue;
    values.forEach((value) => target[key].add(value));
  }
}

function findMissingDots(grid, puzzle, path) {
  const visited = combinedTraveledNodes(grid, puzzle, path);
  return new Set(
    (puzzle.dots || [])
      .filter((dot) => !visited.has(grid.nodeKey(dot)))
      .map((dot) => grid.nodeKey(dot))
  );
}

function findMissingRequiredEdges(grid, puzzle, path) {
  const traveled = combinedTraveledEdges(grid, puzzle, path);
  return new Set(
    (puzzle.requiredEdges || [])
      .filter((edge) => !traveled.has(grid.edgeKey(edge[0], edge[1])))
      .map((edge) => grid.edgeKey(edge[0], edge[1]))
  );
}

function findInvalidTriangles(grid, puzzle, path, traveled = combinedTraveledEdges(grid, puzzle, path)) {
  const invalid = new Set();
  for (const [col, row, count] of puzzle.triangles || []) {
    const touching = grid.cellEdges(col, row).filter(([a, b]) => traveled.has(grid.edgeKey(a, b)));
    if (touching.length !== count) invalid.add(`${col},${row}`);
  }
  return invalid;
}

function findInvalidRegionColors(grid, puzzle, path, regions = computeRegions(grid, puzzle, path)) {
  const invalid = new Set();
  const colorByCell = new Map((puzzle.cellColors || []).map(([col, row, color]) => [`${col},${row}`, color]));

  for (const region of regions) {
    const used = region
      .map(([col, row]) => {
        const key = `${col},${row}`;
        return colorByCell.has(key) ? [key, colorByCell.get(key)] : null;
      })
      .filter((entry) => entry !== null);
    if (new Set(used.map(([, color]) => color)).size <= 1) continue;
    used.forEach(([key]) => invalid.add(key));
  }

  return invalid;
}

function findInvalidStars(grid, puzzle, path, regions = computeRegions(grid, puzzle, path)) {
  const invalid = new Set();
  const starByCell = new Map((puzzle.stars || []).map(([col, row, color]) => [`${col},${row}`, color]));
  const colorByCell = new Map((puzzle.cellColors || []).map(([col, row, color]) => [`${col},${row}`, color]));

  for (const region of regions) {
    const colorLike = region
      .map(([col, row]) => {
        const key = `${col},${row}`;
        if (starByCell.has(key)) return { key, color: starByCell.get(key), isStar: true };
        if (colorByCell.has(key)) return { key, color: colorByCell.get(key), isStar: false };
        return null;
      })
      .filter((entry) => entry !== null);
    const stars = colorLike.filter((entry) => entry.isStar);
    if (stars.length === 0) continue;

    const starColors = new Set(stars.map((entry) => entry.color));
    if (starColors.size > 1) {
      colorLike.forEach((entry) => invalid.add(entry.key));
      continue;
    }

    const [starColor] = [...starColors];
    const matching = colorLike.filter((entry) => entry.color === starColor).length;
    const allMatch = colorLike.every((entry) => entry.color === starColor);
    if (!allMatch || matching !== 2) {
      colorLike.forEach((entry) => invalid.add(entry.key));
    }
  }

  return invalid;
}

export function analyzeSolution(grid, puzzle, path) {
  const failures = createFailureSet();
  const validPath = isValidPath(grid, puzzle, path);
  const exited = validPath && reachesExit(grid, puzzle, path);
  if (!validPath || !exited) {
    return {
      valid: false,
      failures: serializeFailures(failures),
    };
  }

  failures.dots = findMissingDots(grid, puzzle, path);
  failures.requiredEdges = findMissingRequiredEdges(grid, puzzle, path);

  if ((puzzle.eliminators || []).length > 0) {
    mergeFailures(failures, findInvalidEliminatorSymbols(grid, puzzle, path));
  } else {
    const regions = computeRegions(grid, puzzle, path);
    const traveled = combinedTraveledEdges(grid, puzzle, path);
    failures.triangles = findInvalidTriangles(grid, puzzle, path, traveled);
    failures.cellColors = findInvalidRegionColors(grid, puzzle, path, regions);
    failures.stars = findInvalidStars(grid, puzzle, path, regions);
  }

  failures.polyominoes = findInvalidPolyominoCells(grid, puzzle, path);

  const valid =
    failures.dots.size === 0 &&
    failures.requiredEdges.size === 0 &&
    failures.triangles.size === 0 &&
    failures.cellColors.size === 0 &&
    failures.stars.size === 0 &&
    failures.eliminators.size === 0 &&
    failures.polyominoes.size === 0 &&
    satisfiesSymmetry(grid, puzzle, path);

  return {
    valid,
    failures: serializeFailures(failures),
  };
}

export function validateSolution(grid, puzzle, path) {
  return analyzeSolution(grid, puzzle, path).valid;
}
