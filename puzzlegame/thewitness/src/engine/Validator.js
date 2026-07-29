import { satisfiesSymmetry } from './Symmetry.js';
import { combinedTraveledNodes, combinedTraveledEdges, computeRegions } from './Regions.js';
import { satisfiesEliminators } from './Eliminators.js';
import { satisfiesPolyominoes } from './Polyominoes.js';

export function isEdgeBlocked(grid, puzzle, a, b) {
  const key = grid.edgeKey(a, b);
  return (puzzle.blockedEdges || []).some((edge) => grid.edgeKey(edge[0], edge[1]) === key);
}

export function isValidPath(grid, puzzle, path) {
  if (path.length < 2) return false;
  const [sc, sr] = puzzle.start;
  if (path[0][0] !== sc || path[0][1] !== sr) return false;

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

export function reachesExit(puzzle, path) {
  const [lc, lr] = path[path.length - 1];
  return (puzzle.exits || []).some(([ec, er]) => ec === lc && er === lr);
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

export function validateSolution(grid, puzzle, path) {
  return (
    isValidPath(grid, puzzle, path) &&
    reachesExit(puzzle, path) &&
    passesAllDots(grid, puzzle, path) &&
    includesRequiredEdges(grid, puzzle, path) &&
    satisfiesRegionMechanics(grid, puzzle, path) &&
    satisfiesSymmetry(grid, puzzle, path) &&
    satisfiesPolyominoes(grid, puzzle, path)
  );
}
