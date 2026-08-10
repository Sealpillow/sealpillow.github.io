export function createToggleSwitchesController({ onSolve, setStatus }) {
  let host = null;
  let puzzle = null;
  let solved = false;
  let lights = new Map();
  let buttons = new Map();

  function buildInitialLights(data) {
    const next = new Map(data.nodes.map((node) => [node.id, false]));
    for (const id of data.initialOn) next.set(id, true);
    return next;
  }

  function isSolved() {
    return Array.from(lights.values()).every(Boolean);
  }

  function updateUI() {
    for (const node of puzzle.data.nodes) {
      const btn = buttons.get(node.id);
      const lamp = btn?.querySelector('.switch-lamp');
      if (!btn || !lamp) continue;
      const on = lights.get(node.id);
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', String(on));
      lamp.textContent = on ? 'ON' : 'OFF';
    }
  }

  function maybeSolve() {
    if (solved || !isSolved()) return;
    solved = true;
    setStatus('All lights on.');
    onSolve();
  }

  function toggleNode(node) {
    if (solved) return;
    for (const id of node.affects) {
      lights.set(id, !lights.get(id));
    }
    updateUI();
    setStatus('Each switch flips its links.');
    maybeSolve();
  }

  function render() {
    host.replaceChildren();
    buttons = new Map();

    const shell = document.createElement('section');
    shell.className = 'puzzle-shell puzzle-switches';

    const board = document.createElement('div');
    board.className = 'switch-grid';
    board.style.setProperty('--switch-columns', String(puzzle.data.columns ?? 3));

    for (const node of puzzle.data.nodes) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'switch-tile';
      btn.setAttribute('aria-label', `Switch ${node.label}`);
      btn.innerHTML = `
        <span class="switch-label">${node.label}</span>
        <span class="switch-lamp"></span>
      `;
      btn.addEventListener('click', () => toggleNode(node));
      board.appendChild(btn);
      buttons.set(node.id, btn);
    }

    const note = document.createElement('p');
    note.className = 'puzzle-note';
    note.textContent = 'Goal: turn every lamp on at once.';

    shell.append(board, note);
    host.appendChild(shell);
    updateUI();
  }

  function resetState() {
    solved = false;
    lights = buildInitialLights(puzzle.data);
    setStatus(puzzle.statusText ?? 'Find the stable pattern.');
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
      buttons = new Map();
    },
  };
}
