export function transformNode(type, grid, [col, row]) {
  if (type === 'rotational') return [grid.width - col, grid.height - row];
  return [col, row];
}

export function mirrorPath(type, grid, path) {
  return path.map((node) => transformNode(type, grid, node));
}

export function satisfiesSymmetry(grid, puzzle, path) {
  if (!puzzle.symmetry) return true;
  const mirrored = mirrorPath(puzzle.symmetry, grid, path);
  const primaryKeys = new Set(path.map((n) => grid.nodeKey(n)));
  return !mirrored.some((n) => primaryKeys.has(grid.nodeKey(n)));
}
