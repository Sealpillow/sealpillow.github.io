import { mirrorPath } from './Symmetry.js';

export function pathEdgeSet(grid, path) {
  const set = new Set();
  for (let i = 1; i < path.length; i++) {
    set.add(grid.edgeKey(path[i - 1], path[i]));
  }
  return set;
}

// The mirror path is fully derived from the drawn path, so crediting its nodes/edges
// toward dots/required/triangles/regions is consistent, not a special case: whatever
// the drawn path satisfies, the mirror satisfies the reflected version of automatically.
export function combinedTraveledNodes(grid, puzzle, path) {
  const nodes = new Set(path.map((n) => grid.nodeKey(n)));
  if (puzzle.symmetry) {
    for (const n of mirrorPath(puzzle.symmetry, grid, path)) nodes.add(grid.nodeKey(n));
  }
  return nodes;
}

export function combinedTraveledEdges(grid, puzzle, path) {
  const edges = pathEdgeSet(grid, path);
  if (puzzle.symmetry) {
    const mirrored = mirrorPath(puzzle.symmetry, grid, path);
    for (const e of pathEdgeSet(grid, mirrored)) edges.add(e);
  }
  return edges;
}

// Path edges (plus the mirror's, for symmetry puzzles) act as flood-fill walls between cells.
// Shared by satisfiesRegions, satisfiesStars, satisfiesEliminators and satisfiesPolyominoes so
// every region-based mechanic partitions the board identically.
export function computeRegions(grid, puzzle, path) {
  const traveled = combinedTraveledEdges(grid, puzzle, path);
  const visited = new Set();
  const regions = [];
  for (const [col, row] of grid.allCells()) {
    const startKey = `${col},${row}`;
    if (visited.has(startKey)) continue;
    visited.add(startKey);
    const region = [[col, row]];
    const stack = [[col, row]];
    while (stack.length) {
      const [c, r] = stack.pop();
      for (const { cell, edge } of grid.cellNeighbors(c, r)) {
        const key = `${cell[0]},${cell[1]}`;
        if (visited.has(key)) continue;
        if (traveled.has(grid.edgeKey(edge[0], edge[1]))) continue;
        visited.add(key);
        region.push(cell);
        stack.push(cell);
      }
    }
    regions.push(region);
  }
  return regions;
}
