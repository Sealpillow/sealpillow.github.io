import { Grid } from './Grid.js';
import { validateSolution, isEdgeBlocked, isNodeTransitionAllowed } from './Validator.js';
import { transformNode } from './Symmetry.js';

function manhattan(a, b) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

// Sorts candidates closest-to-some-exit first (same trick the generator's own path builder uses
// in randomSimplePath) instead of leaving them in a fixed right/left/down/up order. Without this,
// a plain DFS has no sense of "direction" at all - on the small boards this ran on for a long
// time that rarely mattered, but on the bigger, denser boards levels 101+ introduced, a
// direction-blind search can burn through the entire expansion budget wandering away from the
// exit before ever finding the real solution, even though one exists (confirmed: the generator's
// own validateSolution already proved these levels solvable at generation time).
function sortTowardExits(candidates, exitNodes) {
  return [...candidates].sort((a, b) => {
    const da = Math.min(...exitNodes.map((exit) => manhattan(a, exit)));
    const db = Math.min(...exitNodes.map((exit) => manhattan(b, exit)));
    return da - db;
  });
}

export function findSolutionPath(puzzle, maxExpansions = 400000) {
  const grid = new Grid(puzzle.width, puzzle.height);
  const startCandidates = [puzzle.start];
  if (puzzle.symmetry) {
    const mirrored = transformNode(puzzle.symmetry, grid, puzzle.start);
    if (grid.nodeKey(mirrored) !== grid.nodeKey(puzzle.start)) startCandidates.push(mirrored);
  }

  const exitNodes = [...(puzzle.exits || [])];
  const exitKeys = new Set(exitNodes.map((exit) => grid.nodeKey(exit)));
  if (puzzle.symmetry) {
    for (const exit of puzzle.exits || []) {
      const mirrored = transformNode(puzzle.symmetry, grid, exit);
      exitKeys.add(grid.nodeKey(mirrored));
      exitNodes.push(mirrored);
    }
  }

  function neighborsOf([col, row]) {
    const candidates = [[col + 1, row], [col - 1, row], [col, row + 1], [col, row - 1]].filter(
      ([nextCol, nextRow]) =>
        nextCol >= 0 && nextCol <= puzzle.width && nextRow >= 0 && nextRow <= puzzle.height
    );
    return sortTowardExits(candidates, exitNodes);
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
        if (!isNodeTransitionAllowed(grid, puzzle, path, next)) continue;
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

// Like findSolutionPath, but keeps searching past the first match to collect up to `cap` distinct
// solutions instead of stopping at one - used by the debug "Show Sol." control so a level with
// multiple valid solving paths can be cycled through rather than only ever showing whichever one
// the fixed neighbor order happens to reach first. Shares maxExpansions with findSolutionPath's
// default so a wide-open board without enough real solutions to fill the cap still bails out
// rather than exhausting the whole self-avoiding-walk space looking for more.
export function findSolutionPaths(puzzle, cap = 8, maxExpansions = 400000) {
  const grid = new Grid(puzzle.width, puzzle.height);
  const startCandidates = [puzzle.start];
  if (puzzle.symmetry) {
    const mirrored = transformNode(puzzle.symmetry, grid, puzzle.start);
    if (grid.nodeKey(mirrored) !== grid.nodeKey(puzzle.start)) startCandidates.push(mirrored);
  }

  const exitNodes = [...(puzzle.exits || [])];
  const exitKeys = new Set(exitNodes.map((exit) => grid.nodeKey(exit)));
  if (puzzle.symmetry) {
    for (const exit of puzzle.exits || []) {
      const mirrored = transformNode(puzzle.symmetry, grid, exit);
      exitKeys.add(grid.nodeKey(mirrored));
      exitNodes.push(mirrored);
    }
  }

  function neighborsOf([col, row]) {
    const candidates = [[col + 1, row], [col - 1, row], [col, row + 1], [col, row - 1]].filter(
      ([nextCol, nextRow]) =>
        nextCol >= 0 && nextCol <= puzzle.width && nextRow >= 0 && nextRow <= puzzle.height
    );
    return sortTowardExits(candidates, exitNodes);
  }

  const found = [];
  let expansions = 0;
  const shouldStop = () => found.length >= cap || expansions > maxExpansions;

  for (const start of startCandidates) {
    if (shouldStop()) break;
    const path = [start];
    const seen = new Set([grid.nodeKey(start)]);

    (function dfs() {
      if (shouldStop()) return;
      expansions++;
      if (expansions > maxExpansions) return;

      const current = path[path.length - 1];
      if (path.length >= 2 && exitKeys.has(grid.nodeKey(current)) && validateSolution(grid, puzzle, path)) {
        found.push([...path]);
        if (shouldStop()) return;
      }

      for (const next of neighborsOf(current)) {
        if (shouldStop()) return;
        const key = grid.nodeKey(next);
        if (seen.has(key)) continue;
        if (isEdgeBlocked(grid, puzzle, current, next)) continue;
        if (!isNodeTransitionAllowed(grid, puzzle, path, next)) continue;
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
