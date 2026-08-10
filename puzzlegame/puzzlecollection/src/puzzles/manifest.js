const LEVELS_PER_TYPE = 50;
const MAX_MEMORY_PADS = 9;

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let n = Math.imul(t ^ (t >>> 15), t | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rand, min, max) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sample(arr, rand) {
  return arr[randInt(rand, 0, arr.length - 1)];
}

function idLabel(index) {
  return String(index + 1).padStart(2, '0');
}

function buildGridNodes(cols, rows) {
  const nodes = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const id = String.fromCharCode(65 + nodes.length);
      const affects = [id];
      if (x > 0) affects.push(String.fromCharCode(65 + y * cols + (x - 1)));
      if (x < cols - 1) affects.push(String.fromCharCode(65 + y * cols + (x + 1)));
      if (y > 0) affects.push(String.fromCharCode(65 + (y - 1) * cols + x));
      if (y < rows - 1) affects.push(String.fromCharCode(65 + (y + 1) * cols + x));
      nodes.push({ id, label: id, affects });
    }
  }
  return nodes;
}

function buildTogglePuzzle(index) {
  const cols = index < 15 ? 3 : index < 32 ? 4 : 4;
  const rows = index < 15 ? 2 : index < 32 ? 3 : 4;
  const data = buildToggleData({
    seed: 1000 + index,
    cols,
    rows,
    pressCount: clamp(2 + Math.floor(index / 8), 2, Math.max(4, Math.floor((cols * rows) * 0.55))),
  });

  return {
    id: `toggle-${idLabel(index)}`,
    type: 'toggle-switches',
    title: rows >= 4 ? `Control Matrix ${index + 1}` : rows >= 3 ? `Switchboard ${index + 1}` : `Signal Cluster ${index + 1}`,
    instructions: 'Click switches until every lamp is ON. Each switch also flips its linked neighbors.',
    statusText: data.nodes.length >= 12 ? 'Read the full board first.' : 'Every click matters.',
    data,
  };
}

function buildToggleData({ seed, cols, rows, pressCount }) {
  const rand = mulberry32(seed);
  const nodes = buildGridNodes(cols, rows);
  const solved = new Map(nodes.map((node) => [node.id, true]));
  const chosen = new Set();
  const safePressCount = clamp(pressCount, 2, Math.max(2, nodes.length - 1));

  while (chosen.size < safePressCount) {
    chosen.add(sample(nodes, rand).id);
  }

  for (const node of nodes) {
    if (!chosen.has(node.id)) continue;
    for (const targetId of node.affects) {
      solved.set(targetId, !solved.get(targetId));
    }
  }

  return {
    nodes,
    initialOn: nodes.filter((node) => solved.get(node.id)).map((node) => node.id),
    columns: cols,
  };
}

function buildRotationRoute(cols, rows, rand) {
  const startRow = randInt(rand, 0, rows - 1);
  const cells = [{ x: 0, y: startRow }];
  let current = { x: 0, y: startRow };
  let movedVertically = false;

  for (let x = 0; x < cols - 1; x++) {
    const maxShift = rows >= 5 ? 2 : 1;
    let targetY = clamp(current.y + randInt(rand, -maxShift, maxShift), 0, rows - 1);
    if (rows > 1 && x < cols - 2 && targetY === current.y && rand() < 0.55) {
      targetY = clamp(current.y + (rand() < 0.5 ? -1 : 1), 0, rows - 1);
    }
    while (current.y !== targetY) {
      current = { x: current.x, y: current.y + Math.sign(targetY - current.y) };
      cells.push(current);
      movedVertically = true;
    }
    current = { x: current.x + 1, y: current.y };
    cells.push(current);
  }

  if (!movedVertically && rows > 1) {
    const route = [];
    let y = startRow;
    let x = 0;
    route.push({ x, y });
    const bendY = y === 0 ? 1 : y - 1;
    while (y !== bendY) {
      y += Math.sign(bendY - y);
      route.push({ x, y });
    }
    while (x < cols - 1) {
      x += 1;
      route.push({ x, y });
    }
    return route;
  }

  return cells;
}

function directionFrom(a, b) {
  if (b.x === a.x + 1) return 'E';
  if (b.x === a.x - 1) return 'W';
  if (b.y === a.y + 1) return 'S';
  return 'N';
}

function pieceSpecFor(inDir, outDir) {
  const dirs = [inDir, outDir].sort().join('');
  if (dirs === 'NS') return 'straight:0';
  if (dirs === 'EW') return 'straight:1';
  if (dirs === 'EN') return 'elbow:0';
  if (dirs === 'ES') return 'elbow:1';
  if (dirs === 'SW') return 'elbow:2';
  return 'elbow:3';
}

function parsePieceSpec(spec) {
  const [kind, rotation] = spec.split(':');
  return { kind, rotation: parseInt(rotation, 10) };
}

function buildRotationPuzzle(index) {
  const cols = index < 15 ? 4 : index < 35 ? 5 : 6;
  const rows = index < 20 ? 3 : index < 40 ? 4 : 5;
  const data = buildRotationData({ seed: 2000 + index, cols, rows });

  return {
    id: `rotation-${idLabel(index)}`,
    type: 'rotation-path',
    title: index < 20 ? `Latch ${index + 1}` : `Lock Array ${index + 1}`,
    instructions: 'Rotate each piece until a continuous path connects the left side to the right side.',
    statusText: index < 20 ? 'Corners matter.' : 'Find the clean route.',
    data,
  };
}

function buildRotationData({ seed, cols, rows }) {
  const rand = mulberry32(seed);
  const route = buildRotationRoute(cols, rows, rand);
  const grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 'empty'));

  for (let i = 0; i < route.length; i++) {
    const cell = route[i];
    const inDir = i === 0 ? 'W' : directionFrom(route[i], route[i - 1]);
    const outDir = i === route.length - 1 ? 'E' : directionFrom(route[i], route[i + 1]);
    const solvedSpec = pieceSpecFor(inDir, outDir);
    const parsed = parsePieceSpec(solvedSpec);
    const rotationCount = parsed.kind === 'straight' ? 2 : 4;
    const offset = randInt(rand, 1, rotationCount - 1);
    grid[cell.y][cell.x] = `${parsed.kind}:${(parsed.rotation + offset) % rotationCount}`;
  }

  return {
    cols,
    rows,
    start: { x: route[0].x, y: route[0].y, dir: 'W' },
    end: { x: route[route.length - 1].x, y: route[route.length - 1].y, dir: 'E' },
    pieces: grid,
  };
}

function buildMemorySequence(index) {
  const roundCount = index < 15 ? 3 : 4;
  const baseLength = 3 + Math.floor(index / 12);
  const padCount = index < 15 ? 4 : index < 32 ? 6 : 9;
  const columns = padCount <= 4 ? 2 : 3;
  const data = buildMemoryData({
    seed: 3000 + index,
    padCount,
    columns,
    roundCount,
    baseLength,
  });

  return {
    id: `memory-${idLabel(index)}`,
    type: 'memory-sequence',
    title: index < 20 ? `Echo Pattern ${index + 1}` : `Signal Chain ${index + 1}`,
    instructions: 'Watch the flashing pads, then repeat the full sequence from memory.',
    statusText: 'Click Start Round to start.',
    data,
  };
}

function buildMemoryData({ seed, padCount, columns, roundCount, baseLength }) {
  const rand = mulberry32(seed);
  const pads = Array.from({ length: padCount }, (_, index) => index);
  const rounds = [];

  for (let round = 0; round < roundCount; round++) {
    const length = baseLength + round;
    const seq = [];
    for (let i = 0; i < length; i++) {
      let next = randInt(rand, 0, pads.length - 1);
      if (seq.length > 0 && next === seq[seq.length - 1]) {
        next = (next + 1 + randInt(rand, 0, pads.length - 2)) % pads.length;
      }
      seq.push(next);
    }
    rounds.push(seq);
  }

  return { pads, columns, rounds };
}

function buildTracePositions(rand, cols, rows, targetCount) {
  const positions = [];
  const taken = new Set();
  const safeCount = clamp(targetCount, 3, Math.min(cols * rows, 9));

  while (positions.length < safeCount) {
    const x = randInt(rand, 0, cols - 1);
    const y = randInt(rand, 0, rows - 1);
    const cellKey = `${x},${y}`;
    if (taken.has(cellKey)) continue;
    taken.add(cellKey);
    positions.push({ x, y, value: positions.length + 1 });
  }

  return positions;
}

function buildNumberTraceData({ seed, cols, rows, targetCount, previewMs, roundCount = 1 }) {
  const rand = mulberry32(seed);
  const safeRoundCount = clamp(roundCount, 1, 6);
  const maxCount = Math.min(cols * rows, 9);
  const rounds = [];

  for (let round = 0; round < safeRoundCount; round++) {
    rounds.push({
      previewMs: clamp(previewMs - round * 120, 700, 2200),
      positions: buildTracePositions(rand, cols, rows, Math.min(targetCount + round, maxCount)),
    });
  }

  return {
    cols,
    rows,
    previewMs: rounds[0].previewMs,
    positions: rounds[0].positions,
    rounds,
  };
}

function buildChimpPositions(rand, cols, rows, targetCount) {
  const positions = [];
  const taken = new Set();
  const safeCount = clamp(targetCount, 4, Math.min(cols * rows, 12));

  while (positions.length < safeCount) {
    const x = randInt(rand, 0, cols - 1);
    const y = randInt(rand, 0, rows - 1);
    const cellKey = `${x},${y}`;
    if (taken.has(cellKey)) continue;
    taken.add(cellKey);
    positions.push({ x, y, value: positions.length + 1 });
  }

  return positions;
}

function buildChimpTestData({ seed, cols, rows, targetCount, roundCount = 1 }) {
  const rand = mulberry32(seed);
  const safeRoundCount = clamp(roundCount, 1, 6);
  const maxCount = Math.min(cols * rows, 12);
  const rounds = [];

  for (let round = 0; round < safeRoundCount; round++) {
    rounds.push({
      positions: buildChimpPositions(rand, cols, rows, Math.min(targetCount + round, maxCount)),
    });
  }

  return {
    cols,
    rows,
    positions: rounds[0].positions,
    rounds,
  };
}

export function createCustomMemoryPuzzle({ cols, rows, roundCount }) {
  const safeCols = clamp(cols, 2, 3);
  const safeRows = clamp(rows, 2, 3);
  const safePadCount = clamp(safeCols * safeRows, 4, MAX_MEMORY_PADS);
  const safeRoundCount = clamp(roundCount, 2, 6);
  const columns = safeCols;
  const baseLength = safePadCount <= 4 ? 3 : safePadCount <= 6 ? 4 : 5;
  const seed = Date.now() % 1000000000;

  return {
    id: `memory-custom-${seed}`,
    type: 'memory-sequence',
    title: 'Custom Memory Sequence',
    instructions: 'Watch the flashing pads, then repeat the full sequence from memory.',
    statusText: `${safeCols} x ${safeRows} board · ${safeRoundCount} rounds`,
    data: buildMemoryData({
      seed,
      padCount: safePadCount,
      columns,
      roundCount: safeRoundCount,
      baseLength,
    }),
  };
}

function buildNumberTracePuzzle(index) {
  const cols = index < 15 ? 3 : index < 35 ? 4 : 5;
  const rows = index < 15 ? 3 : index < 35 ? 4 : 5;
  const targetCount = index < 10 ? 4 : index < 22 ? 5 : index < 34 ? 6 : index < 44 ? 7 : 8;
  const previewMs = Math.max(800, 1800 - index * 18);
  const roundCount = index < 16 ? 2 : index < 34 ? 3 : 4;
  const data = buildNumberTraceData({
    seed: 5000 + index,
    cols,
    rows,
    targetCount,
    previewMs,
    roundCount,
  });

  return {
    id: `trace-${idLabel(index)}`,
    type: 'number-trace',
    title: index < 20 ? `Trace Board ${index + 1}` : `Recall Trace ${index + 1}`,
    instructions: 'Study the numbered pattern, then tap the hidden positions back in ascending order.',
    statusText: 'Click Show Pattern to start.',
    data,
  };
}

export function createCustomNumberTracePuzzle({ cols, rows, targetCount, previewMs, roundCount }) {
  const safeCols = clamp(cols, 3, 5);
  const safeRows = clamp(rows, 3, 5);
  const safeCount = clamp(targetCount, 3, Math.min(safeCols * safeRows, 9));
  const safePreviewMs = clamp(previewMs, 700, 2200);
  const safeRoundCount = clamp(roundCount, 1, 6);
  const seed = Date.now() % 1000000000;

  return {
    id: `trace-custom-${seed}`,
    type: 'number-trace',
    title: 'Custom Number Trace',
    instructions: 'Study the numbered pattern, then tap the hidden positions back in ascending order.',
    statusText: `${safeCols} x ${safeRows} · ${safeCount} nums · ${safeRoundCount} round${safeRoundCount === 1 ? '' : 's'}`,
    data: buildNumberTraceData({
      seed,
      cols: safeCols,
      rows: safeRows,
      targetCount: safeCount,
      previewMs: safePreviewMs,
      roundCount: safeRoundCount,
    }),
  };
}

function buildChimpTestPuzzle(index) {
  const cols = index < 15 ? 4 : index < 35 ? 5 : 6;
  const rows = index < 10 ? 3 : index < 30 ? 4 : 5;
  const maxCount = Math.min(cols * rows, 12);
  const targetCount = clamp(4 + Math.floor(index / 6), 4, maxCount);
  const roundCount = index < 14 ? 2 : index < 32 ? 3 : 4;
  const data = buildChimpTestData({
    seed: 6000 + index,
    cols,
    rows,
    targetCount,
    roundCount,
  });

  return {
    id: `chimp-${idLabel(index)}`,
    type: 'chimp-test',
    title: index < 20 ? `Chimp Grid ${index + 1}` : `Flash Recall ${index + 1}`,
    instructions: 'Memorize the visible numbers, hit 1, then finish the remaining positions in ascending order after they hide.',
    statusText: 'Click Show Numbers to start.',
    data,
  };
}

export function createCustomChimpPuzzle({ cols, rows, targetCount, roundCount }) {
  const safeCols = clamp(cols, 3, 6);
  const safeRows = clamp(rows, 3, 6);
  const safeCount = clamp(targetCount, 4, Math.min(safeCols * safeRows, 12));
  const safeRoundCount = clamp(roundCount, 1, 6);
  const seed = Date.now() % 1000000000;

  return {
    id: `chimp-custom-${seed}`,
    type: 'chimp-test',
    title: 'Custom Chimp Test',
    instructions: 'Memorize the visible numbers, hit 1, then finish the remaining positions in ascending order after they hide.',
    statusText: 'Click Show Numbers to start.',
    data: buildChimpTestData({
      seed,
      cols: safeCols,
      rows: safeRows,
      targetCount: safeCount,
      roundCount: safeRoundCount,
    }),
  };
}

export function createCustomTogglePuzzle({ cols, rows }) {
  const safeCols = clamp(cols, 3, 4);
  const safeRows = clamp(rows, 2, 4);
  const seed = Date.now() % 1000000000;
  const size = safeCols * safeRows;

  return {
    id: `toggle-custom-${seed}`,
    type: 'toggle-switches',
    title: 'Custom Toggle Switches',
    instructions: 'Click switches until every lamp is ON. Each switch also flips its linked neighbors.',
    statusText: `${safeCols} x ${safeRows} board`,
    data: buildToggleData({
      seed,
      cols: safeCols,
      rows: safeRows,
      pressCount: clamp(Math.ceil(size * 0.4), 2, Math.max(3, Math.floor(size * 0.55))),
    }),
  };
}

export function createCustomRotationPuzzle({ cols, rows }) {
  const safeCols = clamp(cols, 4, 7);
  const safeRows = clamp(rows, 3, 5);
  const seed = Date.now() % 1000000000;

  return {
    id: `rotation-custom-${seed}`,
    type: 'rotation-path',
    title: 'Custom Rotation Path',
    instructions: 'Rotate each piece until a continuous path connects the left side to the right side.',
    statusText: `${safeCols} x ${safeRows} board`,
    data: buildRotationData({ seed, cols: safeCols, rows: safeRows }),
  };
}

function mirrorForTurn(inDir, outDir) {
  if (
    (inDir === 'N' && outDir === 'E') ||
    (inDir === 'E' && outDir === 'N') ||
    (inDir === 'S' && outDir === 'W') ||
    (inDir === 'W' && outDir === 'S')
  ) {
    return '/';
  }
  return '\\';
}

function buildMirrorRoute(cols, rows, rand) {
  const startRow = randInt(rand, 1, rows - 2);
  const source = { x: 0, y: startRow, dir: 'E' };
  const cells = [{ x: 1, y: startRow }];
  let current = { x: 1, y: startRow };
  let movedVertically = false;
  const largerBoard = cols + rows >= 12;
  const turnChance = largerBoard ? 0.28 : 0.5;

  for (let x = 1; x < cols - 1; x++) {
    const maxShift = rows >= 6 ? 2 : 1;
    let targetY = current.y;

    if (x < cols - 2 && rand() < turnChance) {
      targetY = clamp(current.y + randInt(rand, -maxShift, maxShift), 0, rows - 1);
      if (targetY === current.y) {
        targetY = clamp(current.y + (rand() < 0.5 ? -1 : 1), 0, rows - 1);
      }
    }

    while (current.y !== targetY) {
      current = { x: current.x, y: current.y + Math.sign(targetY - current.y) };
      cells.push(current);
      movedVertically = true;
    }
    if (current.x < cols - 1) {
      current = { x: current.x + 1, y: current.y };
      cells.push(current);
    }
  }

  if (!movedVertically && rows > 2) {
    const route = [{ x: 1, y: startRow }];
    let y = startRow;
    const bendY = startRow === 1 ? 2 : startRow - 1;
    while (y !== bendY) {
      y += Math.sign(bendY - y);
      route.push({ x: 1, y });
    }
    for (let x = 2; x < cols; x++) {
      route.push({ x, y });
    }
    return { source, cells: route };
  }

  return { source, cells };
}

function buildMirrorPuzzle(index) {
  const cols = index < 18 ? 5 : index < 36 ? 6 : 7;
  const rows = index < 18 ? 5 : index < 36 ? 6 : 7;
  const data = buildMirrorData({
    seed: 4000 + index,
    cols,
    rows,
    blockerBudget: Math.min(5, 1 + Math.floor(index / 10)),
  });

  return {
    id: `mirror-${idLabel(index)}`,
    type: 'mirror-reflection',
    title: index < 20 ? `Light Channel ${index + 1}` : `Beam Relay ${index + 1}`,
    instructions: 'Rotate mirrors until the beam reaches the target crystal.',
    statusText: index < 20 ? 'Beam updates live.' : 'Trace reflections first.',
    data,
  };
}

function buildMirrorData({ seed, cols, rows, blockerBudget }) {
  const rand = mulberry32(seed);
  const { source, cells } = buildMirrorRoute(cols, rows, rand);
  const mirrors = [];
  const routeSet = new Set(cells.map((cell) => `${cell.x},${cell.y}`));

  for (let i = 0; i < cells.length; i++) {
    const current = cells[i];
    const inDir = i === 0 ? 'E' : directionFrom(cells[i - 1], cells[i]);
    const outDir = i === cells.length - 1 ? null : directionFrom(current, cells[i + 1]);
    if (!outDir || inDir === outDir) continue;
    const solvedType = mirrorForTurn(inDir, outDir);
    const initialType = rand() < 0.7 ? (solvedType === '/' ? '\\' : '/') : solvedType;
    mirrors.push({ x: current.x, y: current.y, type: initialType });
  }

  const blockers = [];
  let attempts = 0;
  while (blockers.length < blockerBudget && attempts < 40) {
    attempts += 1;
    const x = randInt(rand, 1, cols - 2);
    const y = randInt(rand, 0, rows - 1);
    const cellKey = `${x},${y}`;
    if (routeSet.has(cellKey)) continue;
    if (blockers.some((blocker) => blocker.x === x && blocker.y === y)) continue;
    blockers.push({ x, y });
  }

  return {
    cols,
    rows,
    source,
    target: { x: cells[cells.length - 1].x, y: cells[cells.length - 1].y },
    mirrors,
    blockers,
  };
}

export function createCustomMirrorPuzzle({ cols, rows }) {
  const safeCols = clamp(cols, 5, 7);
  const safeRows = clamp(rows, 5, 7);
  const seed = Date.now() % 1000000000;
  const blockerBudget = Math.max(
    (safeCols >= 7 || safeRows >= 7) ? 5 : (safeCols >= 6 || safeRows >= 6) ? 4 : 3,
    1,
  );

  return {
    id: `mirror-custom-${seed}`,
    type: 'mirror-reflection',
    title: 'Custom Mirror Reflection',
    instructions: 'Rotate mirrors until the beam reaches the target crystal.',
    statusText: `${safeCols} x ${safeRows} board`,
    data: buildMirrorData({ seed, cols: safeCols, rows: safeRows, blockerBudget }),
  };
}

function buildCollection(builder) {
  return Array.from({ length: LEVELS_PER_TYPE }, (_, index) => builder(index));
}

export const PUZZLES = [
  ...buildCollection(buildTogglePuzzle),
  ...buildCollection(buildRotationPuzzle),
  ...buildCollection(buildMemorySequence),
  ...buildCollection(buildMirrorPuzzle),
  ...buildCollection(buildNumberTracePuzzle),
  ...buildCollection(buildChimpTestPuzzle),
];
