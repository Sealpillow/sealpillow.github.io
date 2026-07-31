import { computeRegions } from './Regions.js';

// Canonical shapes as [dc, dr] cell offsets. Rotations (not reflections) are generated below —
// the piece must fit exactly, translated and/or rotated in 90° steps, no mirroring.
export const POLYOMINO_SHAPES = {
  domino: [[0, 0], [1, 0]],
  'tromino-I': [[0, 0], [1, 0], [2, 0]],
  'tromino-L': [[0, 0], [0, 1], [1, 1]],
  square: [[0, 0], [1, 0], [0, 1], [1, 1]],
  'tetromino-I': [[0, 0], [1, 0], [2, 0], [3, 0]],
  'tetromino-L': [[0, 0], [0, 1], [0, 2], [1, 2]],
  'tetromino-T': [[0, 0], [1, 0], [2, 0], [1, 1]],
  'tetromino-S': [[1, 0], [2, 0], [0, 1], [1, 1]],
};

function normalize(cells) {
  const minC = Math.min(...cells.map((c) => c[0]));
  const minR = Math.min(...cells.map((c) => c[1]));
  return cells.map(([c, r]) => [c - minC, r - minR]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

function rotate90(cells) {
  return cells.map(([c, r]) => [r, -c]);
}

function allRotations(cells) {
  const seen = new Set();
  const rotations = [];
  let current = cells;
  for (let i = 0; i < 4; i++) {
    const shape = normalize(current);
    const key = shape.map(([c, r]) => `${c},${r}`).join('|');
    if (!seen.has(key)) {
      seen.add(key);
      rotations.push(shape);
    }
    current = rotate90(current);
  }
  return rotations;
}

export const POLYOMINO_ROTATIONS = Object.fromEntries(
  Object.entries(POLYOMINO_SHAPES).map(([key, cells]) => [key, allRotations(cells)])
);

// Rotate a shape's canonical cells by `steps` quarter-turns (0-3) and normalize — used for
// fixed-orientation ("straight") pieces, which may need any of the 4 steps even where
// POLYOMINO_ROTATIONS has deduped away a visually-identical duplicate (e.g. a domino at
// steps=2 looks the same as steps=0, but a straight piece still names one specific step).
export function rotateShape(shape, steps) {
  let cells = POLYOMINO_SHAPES[shape];
  for (let i = 0; i < ((steps % 4) + 4) % 4; i++) cells = rotate90(cells);
  return normalize(cells);
}

// All ways a piece's rotations can be placed so that one of its cells lands on `anchor`,
// with every resulting cell still inside `remaining` (unplaced region cells).
function placementsCovering(rotations, anchor, remaining) {
  const [ac, ar] = anchor;
  const seen = new Set();
  const placements = [];
  for (const shape of rotations) {
    for (const [sc, sr] of shape) {
      const offCol = ac - sc;
      const offRow = ar - sr;
      const cells = shape.map(([c, r]) => [c + offCol, r + offRow]);
      const keys = cells.map(([c, r]) => `${c},${r}`);
      if (!keys.every((k) => remaining.has(k))) continue;
      const sig = [...keys].sort().join('|');
      if (seen.has(sig)) continue;
      seen.add(sig);
      placements.push(keys);
    }
  }
  return placements;
}

// Exact-cover backtracking: always resolve whichever remaining cell is picked first (arbitrary
// but fixed), since it must be covered by some not-yet-placed piece — this keeps branching low.
function canTile(pieces, remaining) {
  if (remaining.size === 0) return pieces.length === 0;
  if (pieces.length === 0) return false;

  let anchorKey = null;
  for (const k of remaining) {
    if (anchorKey === null || k < anchorKey) anchorKey = k;
  }
  const anchor = anchorKey.split(',').map(Number);

  for (let i = 0; i < pieces.length; i++) {
    const placements = placementsCovering(pieces[i].rotations, anchor, remaining);
    for (const cells of placements) {
      const nextRemaining = new Set(remaining);
      for (const k of cells) nextRemaining.delete(k);
      const nextPieces = pieces.slice(0, i).concat(pieces.slice(i + 1));
      if (canTile(nextPieces, nextRemaining)) return true;
    }
  }
  return false;
}

// A region containing polyomino icons must be exactly tileable (no gaps, no overlaps) by all
// of those pieces at once, each usable in any of its rotations. Regions with no icon are ignored.
export function satisfiesPolyominoes(grid, puzzle, path) {
  const entries = puzzle.polyominoes || [];
  if (entries.length === 0) return true;

  const pieceByCell = new Map();
  for (const [col, row, shape, rotationSteps = 0, rotatable = true] of entries) {
    if (!POLYOMINO_SHAPES[shape]) throw new Error(`Unknown polyomino shape: ${shape}`);
    // A "straight" piece (rotatable: false) must match its one named orientation exactly —
    // a "slanted" piece (rotatable: true) may use any of the shape's unique rotations.
    const rotations = rotatable ? POLYOMINO_ROTATIONS[shape] : [rotateShape(shape, rotationSteps)];
    pieceByCell.set(`${col},${row}`, { rotations });
  }

  for (const region of computeRegions(grid, puzzle, path)) {
    const pieces = [];
    for (const [c, r] of region) {
      const piece = pieceByCell.get(`${c},${r}`);
      if (piece) pieces.push(piece);
    }
    if (pieces.length === 0) continue;

    const totalPieceCells = pieces.reduce((sum, p) => sum + p.rotations[0].length, 0);
    if (totalPieceCells !== region.length) return false;

    const remaining = new Set(region.map(([c, r]) => `${c},${r}`));
    if (!canTile(pieces, remaining)) return false;
  }
  return true;
}

export function findInvalidPolyominoCells(grid, puzzle, path) {
  const failures = new Set();
  const entries = puzzle.polyominoes || [];
  if (entries.length === 0) return failures;

  const pieceByCell = new Map();
  for (const [col, row, shape, rotationSteps = 0, rotatable = true] of entries) {
    if (!POLYOMINO_SHAPES[shape]) throw new Error(`Unknown polyomino shape: ${shape}`);
    const rotations = rotatable ? POLYOMINO_ROTATIONS[shape] : [rotateShape(shape, rotationSteps)];
    pieceByCell.set(`${col},${row}`, { rotations });
  }

  for (const region of computeRegions(grid, puzzle, path)) {
    const pieces = [];
    const pieceCells = [];
    for (const [c, r] of region) {
      const key = `${c},${r}`;
      const piece = pieceByCell.get(key);
      if (!piece) continue;
      pieces.push(piece);
      pieceCells.push(key);
    }
    if (pieces.length === 0) continue;

    const totalPieceCells = pieces.reduce((sum, p) => sum + p.rotations[0].length, 0);
    const remaining = new Set(region.map(([c, r]) => `${c},${r}`));
    if (totalPieceCells !== region.length || !canTile(pieces, remaining)) {
      pieceCells.forEach((key) => failures.add(key));
    }
  }

  return failures;
}
