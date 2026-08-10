export function createMemorySequenceController({ onSolve, setStatus }) {
  const MEMORY_THEME_COLOR = '#67a8ff';
  let host = null;
  let puzzle = null;
  let solved = false;
  let paused = false;
  let roundIndex = 0;
  let inputIndex = 0;
  let playbackTimers = [];
  let canInput = false;
  let showingSequence = false;
  let pads = [];
  let startBtn = null;
  let roundLabel = null;
  let phaseLabel = null;
  let boardEl = null;

  function clearPlaybackTimers() {
    for (const timer of playbackTimers) clearTimeout(timer);
    playbackTimers = [];
  }

  function flashPad(index) {
    const pad = pads[index];
    if (!pad) return;
    pad.classList.add('is-lit');
    setTimeout(() => pad.classList.remove('is-lit'), 380);
  }

  function updateRoundLabel() {
    roundLabel.textContent = `Round ${roundIndex + 1} of ${puzzle.data.rounds.length}`;
  }

  function updatePhaseLabel(message) {
    phaseLabel.textContent = message;
    phaseLabel.dataset.phase = message
      .toLowerCase()
      .replace(/[^\w]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function updateBoardState() {
    if (!boardEl) return;
    boardEl.classList.toggle('is-ready', !showingSequence && !canInput && !solved);
    boardEl.classList.toggle('is-showing-sequence', showingSequence);
    boardEl.classList.toggle('is-awaiting-input', canInput && !showingSequence);
  }

  function setButtonsDisabled(disabled) {
    for (const pad of pads) pad.disabled = disabled;
    startBtn.disabled = disabled;
  }

  function beginRound() {
    if (solved || paused) return;
    clearPlaybackTimers();
    canInput = false;
    showingSequence = true;
    inputIndex = 0;
    const sequence = puzzle.data.rounds[roundIndex];
    setStatus('Watch closely.');
    updatePhaseLabel('Watch');
    updateBoardState();
    setButtonsDisabled(true);

    sequence.forEach((padIndex, idx) => {
      playbackTimers.push(setTimeout(() => {
        flashPad(padIndex);
      }, 520 * idx + 200));
    });

    playbackTimers.push(setTimeout(() => {
      if (paused) return;
      showingSequence = false;
      canInput = true;
      updatePhaseLabel('Repeat');
      updateBoardState();
      setButtonsDisabled(false);
      setStatus('Repeat the sequence.');
    }, 520 * sequence.length + 260));
  }

  function handleInput(index) {
    if (!canInput || solved || paused) return;
    flashPad(index);

    const expected = puzzle.data.rounds[roundIndex][inputIndex];
    if (index !== expected) {
      canInput = false;
      updatePhaseLabel('Miss');
      updateBoardState();
      setStatus('Missed it. Restart the round.');
      return;
    }

    inputIndex += 1;
    if (inputIndex < puzzle.data.rounds[roundIndex].length) return;

    roundIndex += 1;
    canInput = false;
    updateBoardState();
    if (roundIndex >= puzzle.data.rounds.length) {
      solved = true;
      updatePhaseLabel('Clear');
      setStatus('Sequence clear.');
      onSolve();
      return;
    }

    updateRoundLabel();
    updatePhaseLabel('Next Round');
    setStatus('Round clear. Start the next.');
  }

  function render() {
    host.replaceChildren();
    pads = [];

    const shell = document.createElement('section');
    shell.className = 'puzzle-shell puzzle-memory';

    const header = document.createElement('div');
    header.className = 'memory-header';

    roundLabel = document.createElement('p');
    roundLabel.className = 'memory-round';

    phaseLabel = document.createElement('p');
    phaseLabel.className = 'memory-phase';

    startBtn = document.createElement('button');
    startBtn.type = 'button';
    startBtn.className = 'memory-start';
    startBtn.textContent = 'Start Round';
    startBtn.addEventListener('click', beginRound);

    const info = document.createElement('div');
    info.className = 'memory-info';
    info.append(roundLabel, phaseLabel);

    header.append(info, startBtn);

    boardEl = document.createElement('div');
    boardEl.className = 'memory-grid';
    boardEl.style.setProperty('--memory-columns', String(puzzle.data.columns ?? 2));

    puzzle.data.pads.forEach((padData, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'memory-pad';
      btn.style.setProperty('--memory-pad-color', MEMORY_THEME_COLOR);
      btn.setAttribute('aria-label', `Sequence tile ${index + 1}`);
      btn.innerHTML = `
        <span class="memory-pad-glow" aria-hidden="true"></span>
      `;
      btn.addEventListener('click', () => handleInput(index));
      boardEl.appendChild(btn);
      pads.push(btn);
    });

    const note = document.createElement('p');
    note.className = 'puzzle-note';
    note.textContent = 'Each round must be repeated exactly from the beginning.';

    shell.append(header, boardEl, note);
    host.appendChild(shell);
    updateRoundLabel();
    updatePhaseLabel('Ready');
    updateBoardState();
  }

  function resetState() {
    clearPlaybackTimers();
    solved = false;
    paused = false;
    roundIndex = 0;
    inputIndex = 0;
    canInput = false;
    showingSequence = false;
    setStatus('Click Start Round to start.');
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
    setPaused(nextPaused) {
      paused = nextPaused;
      if (paused) {
        clearPlaybackTimers();
        showingSequence = false;
        canInput = false;
        updatePhaseLabel('Paused');
        updateBoardState();
      }
    },
    destroy() {
      clearPlaybackTimers();
      host = null;
      pads = [];
    },
  };
}
