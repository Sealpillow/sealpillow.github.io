import { combinedTraveledEdges, computeRegions } from './Regions.js';

// Every symbol placed in a region-carrying cell, tagged by type so an eliminator can cancel
// any one of them (including another eliminator) regardless of what it is.
function regionSymbols(region, puzzle) {
  const triangleByCell = new Map((puzzle.triangles || []).map(([c, r, count]) => [`${c},${r}`, count]));
  const colorByCell = new Map((puzzle.cellColors || []).map(([c, r, color]) => [`${c},${r}`, color]));
  const starByCell = new Map((puzzle.stars || []).map(([c, r, color]) => [`${c},${r}`, color]));
  const eliminatorCells = new Set((puzzle.eliminators || []).map(([c, r]) => `${c},${r}`));

  const symbols = [];
  for (const [c, r] of region) {
    const key = `${c},${r}`;
    if (eliminatorCells.has(key)) symbols.push({ type: 'eliminator', col: c, row: r });
    else if (starByCell.has(key)) symbols.push({ type: 'star', col: c, row: r, color: starByCell.get(key) });
    else if (colorByCell.has(key)) symbols.push({ type: 'color', col: c, row: r, color: colorByCell.get(key) });
    if (triangleByCell.has(key)) symbols.push({ type: 'triangle', col: c, row: r, count: triangleByCell.get(key) });
  }
  return symbols;
}

// Same rules as satisfiesTriangles/satisfiesRegions/satisfiesStars, just applied to whichever
// symbols in this region were NOT cancelled by an eliminator.
function regionSymbolsSatisfied(symbols, grid, traveled) {
  for (const s of symbols) {
    if (s.type !== 'triangle') continue;
    const touching = grid.cellEdges(s.col, s.row).filter(([a, b]) => traveled.has(grid.edgeKey(a, b)));
    if (touching.length !== s.count) return false;
  }

  const colorLike = symbols.filter((s) => s.type === 'color' || s.type === 'star');
  const starColors = new Set(colorLike.filter((s) => s.type === 'star').map((s) => s.color));
  if (starColors.size > 1) return false;
  if (starColors.size === 0) {
    if (new Set(colorLike.map((s) => s.color)).size > 1) return false;
  } else {
    const [starColor] = starColors;
    let matching = 0;
    for (const s of colorLike) {
      if (s.color !== starColor) return false;
      matching++;
    }
    if (matching !== 2) return false;
  }
  return true;
}

// Every eliminator must cancel exactly one other symbol in the region (which can itself be an
// eliminator). The puzzle doesn't say which pairing to use, so this searches for ANY assignment
// that resolves every eliminator and leaves the survivors satisfying their normal rules.
function regionHasValidElimination(symbols, grid, traveled) {
  const elimIndices = [];
  symbols.forEach((s, i) => {
    if (s.type === 'eliminator') elimIndices.push(i);
  });
  if (elimIndices.length === 0) return regionSymbolsSatisfied(symbols, grid, traveled);

  function search(pending, used) {
    if (pending.length === 0) {
      const remaining = symbols.filter((_, i) => !used.has(i));
      return regionSymbolsSatisfied(remaining, grid, traveled);
    }
    const [cur, ...rest] = pending;
    if (used.has(cur)) return search(rest, used); // already cancelled as someone else's target
    for (let j = 0; j < symbols.length; j++) {
      if (j === cur || used.has(j)) continue;
      const nextUsed = new Set(used);
      nextUsed.add(cur);
      nextUsed.add(j);
      if (search(rest, nextUsed)) return true;
    }
    return false;
  }

  return search(elimIndices, new Set());
}

export function satisfiesEliminators(grid, puzzle, path) {
  const eliminators = puzzle.eliminators || [];
  if (eliminators.length === 0) return true;
  const traveled = combinedTraveledEdges(grid, puzzle, path);
  for (const region of computeRegions(grid, puzzle, path)) {
    const symbols = regionSymbols(region, puzzle);
    if (!regionHasValidElimination(symbols, grid, traveled)) return false;
  }
  return true;
}

export function findInvalidEliminatorSymbols(grid, puzzle, path) {
  const failures = {
    triangles: new Set(),
    cellColors: new Set(),
    stars: new Set(),
    eliminators: new Set(),
  };
  const eliminators = puzzle.eliminators || [];
  if (eliminators.length === 0) return failures;

  const traveled = combinedTraveledEdges(grid, puzzle, path);
  for (const region of computeRegions(grid, puzzle, path)) {
    const symbols = regionSymbols(region, puzzle);
    if (regionHasValidElimination(symbols, grid, traveled)) continue;
    for (const symbol of symbols) {
      const key = `${symbol.col},${symbol.row}`;
      if (symbol.type === 'triangle') failures.triangles.add(key);
      if (symbol.type === 'color') failures.cellColors.add(key);
      if (symbol.type === 'star') failures.stars.add(key);
      if (symbol.type === 'eliminator') failures.eliminators.add(key);
    }
  }

  return failures;
}
