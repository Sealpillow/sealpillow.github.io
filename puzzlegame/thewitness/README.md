# PuzzleGame

This repository contains two separate, unrelated puzzle projects:

- **[Insight](#insight)** — a browser-based Witness-style line-drawing game. The actively developed project.
- **[game.py](#gamepy--legacy-prototype)** — an earlier, unrelated terminal-based prototype. Legacy, not maintained.

---

# Insight

*A browser-based puzzle game inspired by the design philosophy of **The Witness**, built entirely with vanilla HTML, CSS, JavaScript, and SVG — no backend, no build step, no frameworks.*

## Vision

The goal is a logic puzzle game where every mechanic is discovered through play, never explained. The player draws a single line from a start node to an exit; getting it wrong a few times while the rule clicks into place is the intended experience, not a failure state. The design deliberately avoids story, combat, RPG progression, timers, and randomness — difficulty comes entirely from the interaction of simple rules, never from board size, reflexes, or memorization.

This is also why the game never names its own mechanics anywhere in the UI — no "Triangles" label, no "Area 3" tab, no tutorial text. Labeling a rule before the player has worked it out themselves defeats the point. See `plan.md` Section 1 (Vision) and Section 3 (Design Philosophy) for the full statement.

## Quick start

Because the game loads puzzle data with `fetch()`, it needs to be served over HTTP (not opened directly as a `file://` URL). From the project root, run one of:

```
npx serve .
# or
python -m http.server 8000
```

Then open the printed local address (e.g. `http://localhost:8000`) in your browser.

Drag from the glowing start node to an exit tick on the border to solve each puzzle — or click once to arm the line and trace it by moving the mouse without holding the button down, then click again to submit; a classic click-and-drag still works too. Progress is saved locally (`localStorage`).

### Testing

Append `?level=N` to the URL (e.g. `http://localhost:8000/?level=37`) to jump straight to level N — it unlocks free navigation between all 120 levels for that session (labeled "(debug)" in the UI) without touching your real save progress.

## Tech stack & constraints

- Vanilla HTML, CSS, JavaScript, SVG — no frameworks, no build tools
- No backend, no database, no login
- Hosted as static files (GitHub Pages)
- Progress persisted via `localStorage` only

## Structure

```
src/
  engine/
    Grid.js          — node/edge/cell geometry for an arbitrary width×height board
    Renderer.js      — draws the grid, symbols, and both paths as SVG
    Input.js         — pointer handling: click-to-arm / move-to-trace / click-to-submit, or classic click-and-drag
    PuzzleLoader.js  — fetches and parses levels.json
    Validator.js     — checks a drawn path against a puzzle's active mechanics
    Symmetry.js      — the mirrored-path transform for Symmetry puzzles
    Regions.js       — shared flood-fill region computation (used by Colored Regions, Stars, Eliminators, Polyominoes)
    Eliminators.js   — the Eliminators mechanic (backtracking pairing search)
    Polyominoes.js   — the Polyominoes/Tetris mechanic (exact-cover tiling search)
  puzzles/
    levels.json      — all 120 levels, one flat ordered array
  save/
    SaveManager.js   — localStorage read/write
index.html
style.css
main.js              — wires it together: level loading, sequential unlock gating, the debug backdoor
```

`plan.md` has the full architecture rationale and a phase-by-phase build history if you want the *why*, not just the *what*.

## Mechanics

Nine rule types are combined across the level set (for reference here — the game itself never names them):

- **Dots** — the drawn line must pass through every dot.
- **Blocked Edges** — certain grid lines can never be crossed (shown as a broken red line); the drag input physically stops you from crossing one.
- **Required Edges** — certain grid lines (highlighted gold) must be part of the final path, not just avoided.
- **Triangles** — a cell marked with 1-3 triangles requires exactly that many of its four edges to be part of the path.
- **Colored Regions** — the path must partition the grid so that same-colored cells always end up in one connected region, with no two colors sharing a region. Not limited to two colors — a region just can't mix colors.
- **Stars** — a star must pair with exactly one other same-colored cell (another star, or a plain colored square) within its region; a region holding a star can't contain anything of a different color.
- **Eliminators** — cancels exactly one other symbol (a triangle, colored square, star, or another eliminator) in its region; the puzzle doesn't say which one, so it's solved if *any* valid pairing leaves everything else satisfied.
- **Polyominoes** — a region containing one or more Tetris-style piece icons must be exactly tileable by all of them at once, each piece usable in any of its rotations, with no gaps or overlaps.
- **Symmetry** — a second, mirrored path is drawn automatically alongside yours; both must be valid and the two must never touch. The mirror path's nodes/edges also count toward dots/required/triangles/regions, so Symmetry can combine with the other mechanics rather than staying standalone.

Most puzzles have a single exit, but a level can define more than one — either ending is a valid solution, so the player may need to plan for more than one possible finish.

## Level progression

Levels are one flat, gated sequence — solving level N unlocks level N+1 (`main.js`'s `isLevelUnlocked`, based purely on which puzzle IDs are in `save.completedPuzzles`, not a separate pointer). Completed levels stay freely replayable from the level-select strip. All 9 mechanics finish teaching well before the heavy combination phases begin — no mechanic is introduced after a "finale":

| Levels | What's introduced |
|---|---|
| 1-4 | Basic pathing only |
| 5-10 | Dots |
| 11-16 | Blocked Edges, then combined with Dots |
| 17-22 | Required Edges, then combined with Blocked Edges and Dots |
| 23-28 | Symmetry (standalone) |
| 29-34 | Triangles, then combined with Dots and Blocked Edges |
| 35-40 | Colored Regions, then combined with Dots, Required Edges, and Blocked Edges |
| 41-46 | Stars |
| 47-52 | Eliminators |
| 53-58 | Polyominoes — all 9 mechanics now introduced |
| 59-64 | Symmetry reintroduced, combined with other mechanics |
| 65-76 | Fresh 2-3 mechanic combinations spanning all 9 mechanics |
| 77-88 | 4-mechanic combinations |
| 89-99 | Heaviest main-campaign combinations |
| 100 | Grand finale |
| 101-120 | Bonus hard-mode tier — harder than the main finale |

See `plan.md` Section 13 for the exact per-level breakdown and the reasoning behind the ordering.

## How levels are actually designed and verified

This part isn't obvious from playing the game, so it's worth stating explicitly: every level past the earliest teaching levels is built and checked against a real methodology, not tuned by feel.

1. **Brute-force solution counting**, not just "does at least one solution exist." A headless solver enumerates every valid path on a candidate puzzle using the real engine code, and each difficulty tier has a target ceiling (e.g. a four-mechanic level should land at ≤6 solutions, not 100+).
2. **Redundancy audit** — for every active mechanic, strip it from the puzzle and re-count. If the solution count doesn't change, that mechanic was decorative and gets repositioned to somewhere it actually rules something out.
3. **Branching check** — strip everything except `blockedEdges` and re-count. A maze that alone already forces a near-unique path leaves nothing for the other mechanics to filter; a real puzzle needs raw branching that *collapses* to the final count, not one that starts there.
4. **Density scales with grid size** — a bigger board needs proportionally more constraint instances, or it ends up easier despite looking more complex.
5. **Logic over maze walls** — `blockedEdges` is the only mechanic that removes topology outright, so it's tempting to lean on it for difficulty. The standing rule is a light single cut first, then more density from the *other* mechanics, rather than a heavier wall.

New mechanics also get unit-tested against hand-built synthetic puzzles (edge cases like "no valid target to cancel" or "piece only fits with a 180° rotation") before any real level uses them, and every engine change gets a full regression pass — every existing level re-verified, plus a simulated end-to-end playthrough checking unlock gating, solvability, and that no mechanic name ever leaks into the UI — before new content is added.

The full methodology, including exact numeric targets per difficulty tier, lives in `plan.md` Section 13 ("Difficulty methodology").

## Status

All 11 planned phases are implemented (`plan.md` Section 12) — 9 mechanic types across a 120-level campaign (100-level main sequence + a 20-level bonus hard tier). Not yet built (`plan.md` Section 18): a level editor, hint system, daily puzzle, audio, and a few other stretch ideas.

## Further reading

`plan.md` — the full design doc: architecture rationale, a phase-by-phase build history for every mechanic, the complete difficulty methodology with exact numeric targets, and a record of approaches that were tried and rejected (kept as "Superseded" notes so they don't get re-attempted from scratch).

---

# game.py — legacy prototype

*An earlier, unrelated terminal-based Python puzzle game. Different tech stack (Python, console/keyboard I/O), no shared code or design lineage with Insight beyond a "connect the dots" premise. Not actively maintained.*

Inspired from The Witness game <br/>
Hexagon Dots <br/>
![image](https://user-images.githubusercontent.com/51332449/177965327-cab933e9-6448-4622-a8fc-3518b967a5ad.png)

There are currently 10 puzzles to choose from with increasing difficulty <br/>

Instructions:
Think of it like connecting the dots! You must connect all the dots before to solve the puzzle <br/>
1: Left <br/>
![image](https://user-images.githubusercontent.com/51332449/177968794-d5a945c8-0af9-4596-babf-e53812b47a8f.png)
 <br/>
2: Right <br/>
![image](https://user-images.githubusercontent.com/51332449/177968657-1b96c9ec-9399-4ba1-8201-d0a1c75747e0.png)<br/>
3: Up <br/>
![image](https://user-images.githubusercontent.com/51332449/177969171-e49cd1f8-4da7-4a7b-9489-20dbecdab0ac.png) <br/>
4: Down <br/>
![image](https://user-images.githubusercontent.com/51332449/177969348-a782a515-f7d4-4b5d-8272-d3a79f2015b6.png) <br/>

5: Reset <br/>
![image](https://user-images.githubusercontent.com/51332449/177971129-dd2f52e4-2134-4301-b29a-8b14c1e473e3.png) <br/>

6: Return to Main Menu <br/>
![image](https://user-images.githubusercontent.com/51332449/177966074-6c658477-1cf0-4a40-9dda-c85597f176d0.png) <br/>
