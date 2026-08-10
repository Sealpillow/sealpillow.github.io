const DIRS = {
  N: { dx: 0, dy: -1 },
  E: { dx: 1, dy: 0 },
  S: { dx: 0, dy: 1 },
  W: { dx: -1, dy: 0 },
};

const REFLECTIONS = {
  '/': { N: 'E', E: 'N', S: 'W', W: 'S' },
  '\\': { N: 'W', W: 'N', S: 'E', E: 'S' },
};

function key(x, y) {
  return `${x},${y}`;
}

function sourceChar(dir) {
  return dir;
}

export function createMirrorReflectionController({ onSolve, setStatus }) {
  let host = null;
  let puzzle = null;
  let solved = false;
  let mirrorState = new Map();
  let blockers = new Set();
  let cells = [];

  function resetState() {
    solved = false;
    mirrorState = new Map(puzzle.data.mirrors.map((mirror) => [key(mirror.x, mirror.y), mirror.type]));
    blockers = new Set((puzzle.data.blockers ?? []).map((blocker) => key(blocker.x, blocker.y)));
    setStatus(puzzle.statusText ?? 'Aim the beam at the target.');
    if (host) render();
  }

  function traceBeam() {
    const path = [];
    const visited = new Set();
    let x = puzzle.data.source.x;
    let y = puzzle.data.source.y;
    let dir = puzzle.data.source.dir;

    while (true) {
      const step = DIRS[dir];
      x += step.dx;
      y += step.dy;

      if (x < 0 || y < 0 || x >= puzzle.data.cols || y >= puzzle.data.rows) {
        return { path, hitTarget: false };
      }

      const visitKey = `${x},${y},${dir}`;
      if (visited.has(visitKey)) {
        return { path, hitTarget: false };
      }
      visited.add(visitKey);
      path.push(key(x, y));

      if (x === puzzle.data.target.x && y === puzzle.data.target.y) {
        return { path, hitTarget: true };
      }

      if (blockers.has(key(x, y))) {
        return { path, hitTarget: false };
      }

      const mirror = mirrorState.get(key(x, y));
      if (mirror) {
        dir = REFLECTIONS[mirror][dir];
      }
    }
  }

  function updateUI() {
    const result = traceBeam();
    const activeCells = new Set(result.path);

    for (let y = 0; y < puzzle.data.rows; y++) {
      for (let x = 0; x < puzzle.data.cols; x++) {
        const cell = cells[y][x];
        const cellKey = key(x, y);
        cell.classList.toggle('beam-active', activeCells.has(cellKey));
        cell.classList.toggle('has-target', x === puzzle.data.target.x && y === puzzle.data.target.y);
        cell.classList.toggle('has-source', x === puzzle.data.source.x && y === puzzle.data.source.y);
        cell.classList.toggle('is-blocker', blockers.has(cellKey));

        if (x === puzzle.data.source.x && y === puzzle.data.source.y) {
          cell.textContent = sourceChar(puzzle.data.source.dir);
        } else if (x === puzzle.data.target.x && y === puzzle.data.target.y) {
          cell.textContent = result.hitTarget ? '*' : 'O';
        } else if (blockers.has(cellKey)) {
          cell.textContent = '#';
        } else {
          cell.textContent = mirrorState.get(cellKey) ?? '';
        }
      }
    }

    if (!solved && result.hitTarget) {
      solved = true;
      setStatus('Beam aligned.');
      onSolve();
    }
  }

  function rotateMirror(x, y) {
    const cellKey = key(x, y);
    const current = mirrorState.get(cellKey);
    if (solved || !current) return;
    mirrorState.set(cellKey, current === '/' ? '\\' : '/');
    setStatus('The beam updates live.');
    updateUI();
  }

  function render() {
    host.replaceChildren();
    cells = [];

    const shell = document.createElement('section');
    shell.className = 'puzzle-shell puzzle-mirror';

    const board = document.createElement('div');
    board.className = 'mirror-grid';
    board.style.setProperty('--mirror-columns', String(puzzle.data.cols));

    for (let y = 0; y < puzzle.data.rows; y++) {
      const row = [];
      for (let x = 0; x < puzzle.data.cols; x++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mirror-cell';
        btn.addEventListener('click', () => rotateMirror(x, y));
        board.appendChild(btn);
        row.push(btn);
      }
      cells.push(row);
    }

    const note = document.createElement('p');
    note.className = 'puzzle-note';
    note.textContent = 'Mirrors reflect the beam instantly. Blocks stop it cold.';

    shell.append(board, note);
    host.appendChild(shell);
    updateUI();
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
