function normalizeColorName(color) {
  return color === 'black' ? 'gold' : color;
}

function normalizePuzzleColors(puzzle) {
  const normalized = structuredClone(puzzle);
  if (normalized.cellColors) {
    normalized.cellColors = normalized.cellColors.map(([col, row, color]) => [col, row, normalizeColorName(color)]);
  }
  if (normalized.stars) {
    normalized.stars = normalized.stars.map(([col, row, color]) => [col, row, normalizeColorName(color)]);
  }
  return normalized;
}

export async function loadPuzzles(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load puzzles from ${url}: ${response.status}`);
  }
  const puzzles = await response.json();
  return puzzles.map(normalizePuzzleColors);
}
