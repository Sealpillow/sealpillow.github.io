import { Grid } from './Grid.js';
import { validateSolution, isEdgeBlocked } from './Validator.js';
import { transformNode } from './Symmetry.js';

// maxExpansions is a hard safety budget on DFS calls, independent of the solution cap - an
// open board with few blockedEdges has an astronomically large self-avoiding-walk count long
// before `cap` solutions are ever found, so without this a wide-open 6x6+ grid can run for a
// very long time (or effectively hang) enumerating dead-end paths that never reach an exit.
//
// Shared by the CLI verification tool (scripts/verify-level.mjs) and the browser-based
// puzzle designer (designer/designer.js) so both report identical solution counts for the same puzzle.
export function countSolutions(puzzle, cap = 1000, maxExpansions = 400000) {
  const grid = new Grid(puzzle.width, puzzle.height);
  let count = 0;
  let hitCap = false;
  let truncated = false;
  let expansions = 0;

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

  function shouldStop() {
    return hitCap || truncated;
  }

  for (const start of startCandidates) {
    if (shouldStop()) break;
    const path = [start];
    const seen = new Set([grid.nodeKey(start)]);

    (function dfs() {
      if (shouldStop()) return;
      expansions++;
      if (expansions > maxExpansions) {
        truncated = true;
        return;
      }

      const current = path[path.length - 1];
      if (path.length >= 2 && exitKeys.has(grid.nodeKey(current))) {
        if (validateSolution(grid, puzzle, path)) {
          count++;
          if (count >= cap) {
            hitCap = true;
            return;
          }
        }
      }

      for (const next of neighborsOf(current)) {
        if (shouldStop()) return;
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

  return { count, hitCap, truncated };
}
