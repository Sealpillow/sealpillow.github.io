import { Grid } from './Grid.js';
import { validateSolution, isEdgeBlocked } from './Validator.js';
import { transformNode } from './Symmetry.js';

export function findSolutionPath(puzzle, maxExpansions = 400000) {
  const grid = new Grid(puzzle.width, puzzle.height);
  const startCandidates = [puzzle.start];
  if (puzzle.symmetry) {
    const mirrored = transformNode(puzzle.symmetry, grid, puzzle.start);
    if (grid.nodeKey(mirrored) !== grid.nodeKey(puzzle.start)) startCandidates.push(mirrored);
  }

  const exitKeys = new Set((puzzle.exits || []).map((exit) => grid.nodeKey(exit)));
  if (puzzle.symmetry) {
    for (const exit of puzzle.exits || []) {
      exitKeys.add(grid.nodeKey(transformNode(puzzle.symmetry, grid, exit)));
    }
  }

  function neighborsOf([col, row]) {
    const candidates = [[col + 1, row], [col - 1, row], [col, row + 1], [col, row - 1]];
    return candidates.filter(
      ([nextCol, nextRow]) =>
        nextCol >= 0 && nextCol <= puzzle.width && nextRow >= 0 && nextRow <= puzzle.height
    );
  }

  let expansions = 0;
  let found = null;

  for (const start of startCandidates) {
    if (found) break;
    const path = [start];
    const seen = new Set([grid.nodeKey(start)]);

    (function dfs() {
      if (found) return;
      expansions++;
      if (expansions > maxExpansions) return;

      const current = path[path.length - 1];
      if (path.length >= 2 && exitKeys.has(grid.nodeKey(current)) && validateSolution(grid, puzzle, path)) {
        found = [...path];
        return;
      }

      for (const next of neighborsOf(current)) {
        if (found) return;
        const key = grid.nodeKey(next);
        if (seen.has(key)) continue;
        if (isEdgeBlocked(grid, puzzle, current, next)) continue;
        seen.add(key);
        path.push(next);
        dfs();
        path.pop();
        seen.delete(key);
      }
    })();
  }

  return found;
}
