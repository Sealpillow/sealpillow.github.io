export function createChimpTestController({ onSolve, onMiss, setStatus }) {
  let host = null;
  let puzzle = null;
  let solved = false;
  let paused = false;
  let failed = false;
  let revealMode = true;
  let inputIndex = 0;
  let roundIndex = 0;
  let startBtn = null;
  let phaseLabel = null;
  let roundLabel = null;
  let boardEl = null;
  let cells = [];
  let lookup = new Map();

  function rounds() {
    if (Array.isArray(puzzle.data.rounds) && puzzle.data.rounds.length > 0) return puzzle.data.rounds;
    return [{ positions: puzzle.data.positions }];
  }

  function currentRound() {
    return rounds()[roundIndex];
  }

  function buildLookup() {
    lookup = new Map(
      currentRound().positions.map((item) => [`${item.x},${item.y}`, item.value]),
    );
  }

  function updateRoundSummary() {
    if (!roundLabel) return;
    const totalRounds = rounds().length;
    const targetCount = currentRound().positions.length;
    roundLabel.textContent = totalRounds > 1
      ? `Round ${roundIndex + 1}/${totalRounds} · ${targetCount} numbers`
      : `${targetCount} numbers`;
    startBtn.textContent = roundIndex === 0 ? 'Show Numbers' : `Start Round ${roundIndex + 1}`;
  }

  function updatePhase(message) {
    phaseLabel.textContent = message;
    phaseLabel.dataset.phase = message
      .toLowerCase()
      .replace(/[^\w]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function updateBoardState() {
    if (!boardEl) return;
    boardEl.classList.toggle('is-ready', !revealMode && !solved && inputIndex === 0 && startBtn.disabled === false);
    boardEl.classList.toggle('is-showing-sequence', revealMode);
    boardEl.classList.toggle('is-awaiting-input', !revealMode && !solved && startBtn.disabled === true);
  }

  function updateUI() {
    for (let y = 0; y < puzzle.data.rows; y++) {
      for (let x = 0; x < puzzle.data.cols; x++) {
        const btn = cells[y][x];
        const key = `${x},${y}`;
        const value = lookup.get(key);
        const completed = value && value < inputIndex + 1;
        const visibleNumber = value && (revealMode || completed);

        btn.classList.toggle('is-chimp-target', Boolean(value));
        btn.classList.toggle('is-chimp-reveal', Boolean(value) && revealMode);
        btn.classList.toggle('is-chimp-complete', Boolean(completed));
        btn.textContent = visibleNumber ? String(value) : '';
      }
    }
  }

  function beginRound() {
    if (solved || paused) return;
    revealMode = true;
    failed = false;
    inputIndex = 0;
    startBtn.disabled = true;
    updatePhase('Study');
    setStatus('Tap 1 while numbers show.');
    updateUI();
    updateBoardState();
  }

  function handleCell(x, y) {
    if (solved || failed || paused || startBtn.disabled === false) return;
    const key = `${x},${y}`;
    const value = lookup.get(key);
    const target = inputIndex + 1;
    if (value !== target) {
      if (puzzle.customMeta?.regenerateOnMiss && onMiss?.()) return;
      failed = true;
      revealMode = true;
      inputIndex = 0;
      startBtn.disabled = false;
      updatePhase('Miss');
      updateUI();
      updateBoardState();
      setStatus(`Need ${target} next. Numbers shown.`);
      return;
    }

    inputIndex += 1;
    if (target === 1) {
      revealMode = false;
      updatePhase('Recall');
      setStatus('Now finish in order.');
    } else if (inputIndex < currentRound().positions.length) {
      updatePhase(`Step ${inputIndex}/${currentRound().positions.length}`);
      setStatus(`Find ${inputIndex + 1}.`);
    }

    updateUI();
    updateBoardState();

    if (inputIndex < currentRound().positions.length) return;

    const totalRounds = rounds().length;
    if (roundIndex < totalRounds - 1) {
      const clearedRound = roundIndex + 1;
      roundIndex += 1;
      revealMode = false;
      failed = false;
      inputIndex = 0;
      startBtn.disabled = false;
      buildLookup();
      updateRoundSummary();
      updateUI();
      updatePhase('Clear');
      setStatus(`Round ${clearedRound} clear. Start ${roundIndex + 1}.`);
      updateBoardState();
      return;
    }

    solved = true;
    updatePhase('Clear');
    setStatus('Chimp clear.');
    updateBoardState();
    onSolve();
  }

  function render() {
    host.replaceChildren();
    cells = [];

    const shell = document.createElement('section');
    shell.className = 'puzzle-shell puzzle-chimp-test';

    const header = document.createElement('div');
    header.className = 'memory-header';

    const info = document.createElement('div');
    info.className = 'memory-info';

    roundLabel = document.createElement('p');
    roundLabel.className = 'memory-round';

    phaseLabel = document.createElement('p');
    phaseLabel.className = 'memory-phase';

    info.append(roundLabel, phaseLabel);

    startBtn = document.createElement('button');
    startBtn.type = 'button';
    startBtn.className = 'memory-start';
    startBtn.addEventListener('click', beginRound);

    header.append(info);

    boardEl = document.createElement('div');
    boardEl.className = 'chimp-grid';
    boardEl.style.setProperty('--chimp-columns', String(puzzle.data.cols));

    for (let y = 0; y < puzzle.data.rows; y++) {
      const row = [];
      for (let x = 0; x < puzzle.data.cols; x++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chimp-cell';
        btn.setAttribute('aria-label', `Chimp cell ${x + 1}, ${y + 1}`);
        btn.addEventListener('click', () => handleCell(x, y));
        boardEl.appendChild(btn);
        row.push(btn);
      }
      cells.push(row);
    }

    const note = document.createElement('p');
    note.className = 'puzzle-note';
    note.textContent = 'Click 1 while the board is visible. The rest hide after that first correct tap.';

    shell.append(header, note, boardEl, startBtn);
    host.appendChild(shell);
    updateRoundSummary();
    updateUI();
    updateBoardState();
  }

  function resetState() {
    solved = false;
    paused = false;
    failed = false;
    revealMode = false;
    inputIndex = 0;
    roundIndex = 0;
    buildLookup();
    setStatus(puzzle.statusText ?? 'Click Show Numbers to start.');
    if (host) {
      render();
      updatePhase('Ready');
      updateBoardState();
    }
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
    setPaused(nextPaused) {
      paused = nextPaused;
      if (paused) {
        revealMode = false;
        updateUI();
        updatePhase('Paused');
        updateBoardState();
      }
    },
    destroy() {
      host = null;
      cells = [];
    },
  };
}
