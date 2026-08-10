export function createNumberTraceController({ onSolve, setStatus }) {
  let host = null;
  let puzzle = null;
  let solved = false;
  let paused = false;
  let previewing = false;
  let inputIndex = 0;
  let roundIndex = 0;
  let revealTimer = null;
  let startBtn = null;
  let phaseLabel = null;
  let roundLabel = null;
  let boardEl = null;
  let cells = [];
  let lookup = new Map();

  function clearRevealTimer() {
    if (revealTimer) clearTimeout(revealTimer);
    revealTimer = null;
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
    boardEl.classList.toggle('is-ready', !previewing && !solved && inputIndex === 0 && startBtn.disabled === false);
    boardEl.classList.toggle('is-showing-sequence', previewing);
    boardEl.classList.toggle('is-awaiting-input', !previewing && !solved && startBtn.disabled === true);
  }

  function rounds() {
    if (Array.isArray(puzzle.data.rounds) && puzzle.data.rounds.length > 0) return puzzle.data.rounds;
    return [{ positions: puzzle.data.positions, previewMs: puzzle.data.previewMs }];
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
      ? `Round ${roundIndex + 1}/${totalRounds} · Trace ${targetCount} numbers`
      : `Trace ${targetCount} numbers`;
    startBtn.textContent = roundIndex === 0 ? 'Show Pattern' : `Start Round ${roundIndex + 1}`;
  }

  function updateUI(showNumbers = false) {
    for (let y = 0; y < puzzle.data.rows; y++) {
      for (let x = 0; x < puzzle.data.cols; x++) {
        const btn = cells[y][x];
        const key = `${x},${y}`;
        const expected = lookup.get(key);
        const active = showNumbers && expected;
        const complete = expected && expected < inputIndex + 1 && !showNumbers;

        btn.classList.toggle('is-trace-target', Boolean(expected));
        btn.classList.toggle('is-trace-preview', Boolean(active));
        btn.classList.toggle('is-trace-complete', Boolean(complete));
        btn.textContent = active ? String(expected) : complete ? String(expected) : '';
      }
    }
  }

  function finishPreview() {
    if (paused) return;
    previewing = false;
    updatePhase('Trace');
    setStatus('Trace the hidden numbers.');
    startBtn.disabled = true;
    updateUI(false);
    updateBoardState();
  }

  function beginRound() {
    if (solved || paused || previewing) return;
    clearRevealTimer();
    inputIndex = 0;
    previewing = true;
    startBtn.disabled = true;
    updatePhase('Watch');
    setStatus('Watch the pattern.');
    updateUI(true);
    updateBoardState();
    revealTimer = setTimeout(finishPreview, currentRound().previewMs);
  }

  function handleCell(x, y) {
    if (solved || paused || previewing) return;
    const key = `${x},${y}`;
    const expected = lookup.get(key);
    const target = inputIndex + 1;
    if (expected !== target) {
      updatePhase('Miss');
      setStatus(`Need ${target} next.`);
      return;
    }

    inputIndex += 1;
    updateUI(false);

    if (inputIndex < currentRound().positions.length) {
      updatePhase(`Tracing ${inputIndex}/${currentRound().positions.length}`);
      setStatus(`Find ${inputIndex + 1}.`);
      return;
    }

    const totalRounds = rounds().length;
    if (roundIndex < totalRounds - 1) {
      const clearedRound = roundIndex + 1;
      roundIndex += 1;
      inputIndex = 0;
      previewing = false;
      startBtn.disabled = false;
      buildLookup();
      updateRoundSummary();
      updateUI(false);
      updatePhase('Clear');
      setStatus(`Round ${clearedRound} clear. Start ${roundIndex + 1}.`);
      updateBoardState();
      return;
    }

    solved = true;
    updatePhase('Clear');
    setStatus('Trace clear.');
    updateBoardState();
    onSolve();
  }

  function render() {
    host.replaceChildren();
    cells = [];

    const shell = document.createElement('section');
    shell.className = 'puzzle-shell puzzle-number-trace';

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
    boardEl.className = 'trace-grid';
    boardEl.style.setProperty('--trace-columns', String(puzzle.data.cols));

    for (let y = 0; y < puzzle.data.rows; y++) {
      const row = [];
      for (let x = 0; x < puzzle.data.cols; x++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'trace-cell';
        btn.setAttribute('aria-label', `Trace cell ${x + 1}, ${y + 1}`);
        btn.addEventListener('click', () => handleCell(x, y));
        boardEl.appendChild(btn);
        row.push(btn);
      }
      cells.push(row);
    }

    const note = document.createElement('p');
    note.className = 'puzzle-note';
    note.textContent = 'Watch the numbered layout, then trace the hidden positions in order.';

    shell.append(header, note, boardEl, startBtn);
    host.appendChild(shell);
    updateRoundSummary();
    updateUI(false);
    updateBoardState();
  }

  function resetState() {
    clearRevealTimer();
    solved = false;
    paused = false;
    previewing = false;
    inputIndex = 0;
    roundIndex = 0;
    buildLookup();
    setStatus('Click Show Pattern to start.');
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
        clearRevealTimer();
        previewing = false;
        updateUI(false);
        updatePhase('Paused');
        updateBoardState();
      }
    },
    destroy() {
      clearRevealTimer();
      host = null;
      cells = [];
    },
  };
}
