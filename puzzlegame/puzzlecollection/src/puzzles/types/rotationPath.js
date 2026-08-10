const CONNECTIONS = {
  empty: [],
  straight: [
    ['N', 'S'],
    ['E', 'W'],
  ],
  elbow: [
    ['N', 'E'],
    ['E', 'S'],
    ['S', 'W'],
    ['W', 'N'],
  ],
};

const DIRS = {
  N: { dx: 0, dy: -1, opposite: 'S' },
  E: { dx: 1, dy: 0, opposite: 'W' },
  S: { dx: 0, dy: 1, opposite: 'N' },
  W: { dx: -1, dy: 0, opposite: 'E' },
};

function parsePiece(spec) {
  if (spec === 'empty') return { kind: 'empty', rotation: 0 };
  const [kind, rotation] = spec.split(':');
  return { kind, rotation: parseInt(rotation, 10) };
}

function pieceChar(piece) {
  if (piece.kind === 'empty') return '';
  if (piece.kind === 'straight') return piece.rotation % 2 === 0 ? '|' : '-';
  return ['NE', 'ES', 'SW', 'WN'][piece.rotation % 4];
}

function pieceConnections(piece) {
  const variants = CONNECTIONS[piece.kind];
  return variants?.[piece.rotation % variants.length] ?? [];
}

function edgeMarkerPosition({ x, y, dir }, cols, rows) {
  const xStep = 100 / cols;
  const yStep = 100 / rows;
  const centerX = (x + 0.5) * xStep;
  const centerY = (y + 0.5) * yStep;

  switch (dir) {
    case 'N':
      return { left: `${centerX}%`, top: '0%', edge: 'top' };
    case 'S':
      return { left: `${centerX}%`, top: '100%', edge: 'bottom' };
    case 'W':
      return { left: '0%', top: `${centerY}%`, edge: 'left' };
    case 'E':
      return { left: '100%', top: `${centerY}%`, edge: 'right' };
    default:
      return { left: `${centerX}%`, top: `${centerY}%`, edge: 'left' };
  }
}

export function createRotationPathController({ onSolve, setStatus }) {
  let host = null;
  let puzzle = null;
  let solved = false;
  let state = [];
  let cells = [];

  function cloneState() {
    state = puzzle.data.pieces.map((row) => row.map((spec) => parsePiece(spec)));
  }

  function within(x, y) {
    return x >= 0 && y >= 0 && x < puzzle.data.cols && y < puzzle.data.rows;
  }

  function pathConnected() {
    const stack = [{ x: puzzle.data.start.x, y: puzzle.data.start.y, entry: puzzle.data.start.dir }];
    const visited = new Set();

    while (stack.length > 0) {
      const current = stack.pop();
      const key = `${current.x},${current.y},${current.entry}`;
      if (visited.has(key)) continue;
      visited.add(key);

      if (!within(current.x, current.y)) continue;
      const piece = state[current.y][current.x];
      const connections = pieceConnections(piece);
      if (!connections.includes(current.entry)) continue;

      if (
        current.x === puzzle.data.end.x &&
        current.y === puzzle.data.end.y &&
        connections.includes(puzzle.data.end.dir)
      ) {
        return true;
      }

      for (const exit of connections) {
        if (exit === current.entry) continue;
        const dir = DIRS[exit];
        stack.push({
          x: current.x + dir.dx,
          y: current.y + dir.dy,
          entry: dir.opposite,
        });
      }
    }

    return false;
  }

  function updateUI() {
    for (let y = 0; y < puzzle.data.rows; y++) {
      for (let x = 0; x < puzzle.data.cols; x++) {
        const btn = cells[y][x];
        const piece = state[y][x];
        btn.dataset.kind = piece.kind;
        btn.dataset.rotation = String(piece.rotation);
        btn.innerHTML = piece.kind === 'empty'
          ? '<span class="rotation-empty-dot" aria-hidden="true"></span>'
          : `
            <span class="rotation-piece" aria-hidden="true">
              <span class="rotation-segment rotation-segment-a"></span>
              <span class="rotation-segment rotation-segment-b"></span>
              <span class="rotation-core"></span>
            </span>
          `;
        btn.setAttribute('aria-label', piece.kind === 'empty'
          ? 'Empty socket'
          : piece.kind === 'straight'
            ? 'Straight lock piece'
            : 'Corner lock piece');
        btn.classList.toggle('is-empty', piece.kind === 'empty');
      }
    }
  }

  function maybeSolve() {
    if (solved || !pathConnected()) return;
    solved = true;
    setStatus('Path connected.');
    onSolve();
  }

  function rotate(x, y) {
    const piece = state[y][x];
    if (solved || piece.kind === 'empty') return;
    piece.rotation = (piece.rotation + 1) % CONNECTIONS[piece.kind].length;
    updateUI();
    setStatus('Connect left to right.');
    maybeSolve();
  }

  function render() {
    host.replaceChildren();
    cells = [];

    const shell = document.createElement('section');
    shell.className = 'puzzle-shell puzzle-rotation';

    const boardFrame = document.createElement('div');
    boardFrame.className = 'rotation-board-frame';

    const board = document.createElement('div');
    board.className = 'rotation-grid';
    board.style.setProperty('--rotation-columns', String(puzzle.data.cols));

    const startMarker = document.createElement('span');
    startMarker.className = 'rotation-edge-marker rotation-edge-marker-start';
    startMarker.textContent = 'IN';
    const startPos = edgeMarkerPosition(puzzle.data.start, puzzle.data.cols, puzzle.data.rows);
    startMarker.style.left = startPos.left;
    startMarker.style.top = startPos.top;
    startMarker.dataset.edge = startPos.edge;

    const endMarker = document.createElement('span');
    endMarker.className = 'rotation-edge-marker rotation-edge-marker-end';
    endMarker.textContent = 'OUT';
    const endPos = edgeMarkerPosition(puzzle.data.end, puzzle.data.cols, puzzle.data.rows);
    endMarker.style.left = endPos.left;
    endMarker.style.top = endPos.top;
    endMarker.dataset.edge = endPos.edge;

    for (let y = 0; y < puzzle.data.rows; y++) {
      const row = [];
      for (let x = 0; x < puzzle.data.cols; x++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'rotation-cell';
        btn.addEventListener('click', () => rotate(x, y));
        if (x === puzzle.data.start.x && y === puzzle.data.start.y) btn.classList.add('is-start');
        if (x === puzzle.data.end.x && y === puzzle.data.end.y) btn.classList.add('is-end');
        board.appendChild(btn);
        row.push(btn);
      }
      cells.push(row);
    }

    boardFrame.append(board, startMarker, endMarker);

    const note = document.createElement('p');
    note.className = 'puzzle-note';
    note.textContent = 'Build a route from the IN side marker to the OUT side marker.';

    shell.append(boardFrame, note);
    host.appendChild(shell);
    updateUI();
  }

  function resetState() {
    solved = false;
    cloneState();
    setStatus(puzzle.statusText ?? 'Build one route.');
    if (host) render();
  }

  return {
    mount(container, nextPuzzle) {
      host = container;
      puzzle = nextPuzzle;
      resetState();
    },
    restart() {
      resetState();
    },
    setPaused() {},
    destroy() {
      host = null;
      cells = [];
    },
  };
}
