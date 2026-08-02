# PuzzleGame

This repository contains two separate, unrelated puzzle projects:

- **[The Vision](#the-vision)** - a browser-based Witness-style line-drawing game. The actively developed project.
- **[game.py](#gamepy--legacy-prototype)** - an earlier, unrelated terminal-based prototype. Legacy, not maintained.

---

# The Vision

*A browser-based puzzle game inspired by the design philosophy of **The Witness**, built entirely with vanilla HTML, CSS, JavaScript, and SVG - no backend, no build step, no frameworks.*

## Vision

The goal is a logic puzzle game where every mechanic is discovered through play, never explained. The player draws a single line from a start node to an exit; getting it wrong a few times while the rule clicks into place is the intended experience, not a failure state. The design deliberately avoids story, combat, RPG progression, timers, and randomness - difficulty comes entirely from the interaction of simple rules, never from board size, reflexes, or memorization.

This is also why the game never names its own mechanics anywhere in the UI - no "Triangles" label, no "Area 3" tab, no tutorial text. Labeling a rule before the player has worked it out themselves defeats the point.

Visually: clean architecture, minimal geometry, muted colors, soft animations. No flashy particles, no large HUDs - the interface stays out of the way of the puzzle.

## Quick start

Because the game loads puzzle data with `fetch()`, it needs to be served over HTTP (not opened directly as a `file://` URL). From the project root, run one of:

```sh
npx serve .
# or
python -m http.server 8000
```

Then open the printed local address (e.g. `http://localhost:8000`) in your browser.

Drag from the glowing start node to an exit tick on the border to solve each puzzle - or click once to arm the line and trace it by moving the mouse without holding the button down, then click again to submit; a classic click-and-drag still works too. Progress is saved locally (`localStorage`).

On touch devices, starting a path also opens a small thumb-scope panel for easier tracing. The scope mirrors the current puzzle area and softly follows the path tip while you drag, making longer thumb-only tracing easier than dragging directly across the whole board. You can tap outside it to dismiss it, reopen it with the small `Scope` button, and use the top-left cog to switch the scope between right-hand and left-hand placement as well as tune the scope follow speed with a slider or exact numeric input. While your thumb is actively swiping inside the scope, that gesture is captured for path control rather than scrolling the page. In mobile tracing mode, tapping an earlier node already on the current path rewinds the path directly back to that point instead of forcing one-step-at-a-time undo. The level navigation is also compacted on narrow screens into a stable `2 x 5` block (2 rows, 5 columns, 10 levels per page), while desktop uses `2 x 10` for a 20-level page. Throughout this project, layout counts are written as `rows x columns`.

### Testing

Append `?level=N` to the URL (e.g. `http://localhost:8000/?level=37`) to jump straight to level N - it unlocks free navigation within the active collection for that session (labeled "(debug)" in the UI) without touching your real save progress. In debug mode, the UI also exposes `Guide` and `Show Solution` helper tools.

## Tech stack & constraints

- Vanilla HTML, CSS, JavaScript, SVG - no frameworks, no build tools
- No backend, no database, no login
- Hosted as static files (GitHub Pages)
- Progress persisted via `localStorage` only

## Structure

```text
src/
  engine/
    Grid.js          - node/edge/cell geometry for an arbitrary width x height board
    Renderer.js      - draws the grid, symbols, and both paths as SVG
    Input.js         - pointer handling: click-to-arm / move-to-trace / click-to-submit, or classic click-and-drag
    PuzzleLoader.js  - fetches and parses the active level collection JSON
    Validator.js     - checks a drawn path against a puzzle's active mechanics
    Symmetry.js      - the mirrored-path transform for Symmetry puzzles
    Regions.js       - shared flood-fill region computation (used by Colored Regions, Stars, Eliminators, Polyominoes)
    Eliminators.js   - the Eliminators mechanic (backtracking pairing search)
    Polyominoes.js   - the Polyominoes/Tetris mechanic (exact-cover tiling search)
  puzzles/
    levels.json          - original 134-level campaign source
    claude-levels.json   - Claude collection shown in the level-source dropdown
    codex-levels.json  - Codex collection shown in the level-source dropdown
  save/
    SaveManager.js   - localStorage read/write
index.html
style.css
main.js              - app orchestration: level loading, sequential unlock gating, shared desktop/mobile nav layout mode, debug level jump/reveal/guide tools, and the mobile scope UI
```

Every mechanic's validation lives as a plain exported function (not a class) across the `engine/*.js` files above - `passesAllDots`, `satisfiesTriangles`, `satisfiesRegions`, `satisfiesStars`, `includesRequiredEdges` (all in `Validator.js`), plus `satisfiesSymmetry`, `satisfiesEliminators`, and `satisfiesPolyominoes` in their own modules. Each returns a plain `true`/`false`; `validateSolution` ANDs every applicable one together.

## Puzzle data format

Every puzzle collection lives in `src/puzzles/*.json`, one flat array per collection. A puzzle only includes the fields its active mechanics need - most levels use 0-2 of them:

```js
{
  "id": "level_56",
  "width": 2,
  "height": 2,
  "start": [0, 0],
  "exits": [[2, 2]],
  "eliminators": [[0, 0]],
  "triangles": [[1, 1, 4]]
}
```

The full set of possible fields: `dots`, `blockedEdges`, `requiredEdges`, `triangles`, `cellColors`, `stars`, `eliminators`, `polyominoes`, `regionSizes`, and a `symmetry` string (currently only `"rotational"`). A polyomino entry is `[col, row, shapeName, rotationSteps, rotatable]`; a region-size entry is `[col, row, value]` - see the notes below.

## Engine internals

**Validation pipeline**, in order - a puzzle only succeeds if every step passes:
1. Valid path (grid-adjacent moves only, no revisits except retracing the immediately-previous node, no crossing a blocked edge) - enforced live during dragging, not just at the end.
2. Reaches an exit (matches *any* entry in `exits`, not necessarily all).
3. Passes every dot.
4. Includes every required edge.
5. Region-based mechanics (Triangles, Colored Regions, Stars - or, if the puzzle has Eliminators, one combined region-aware check replaces all three) and Polyominoes.
6. Symmetry, if the puzzle defines one.

**Per-mechanic implementation notes:**
- **Colored Regions / Stars / Eliminators / Polyominoes** all share `Regions.js`'s `computeRegions`, a flood fill over grid cells that treats any edge the player's path actually traveled as a wall (`blockedEdges` are *not* flood-fill walls by themselves - only the drawn path's own edges partition regions).
- **Symmetry** (`Symmetry.js`) derives a mirror path from the one path the player drags via a 180-degree rotation transform; the mirror path's nodes/edges are credited into the dot/required/triangle/region checks (`combinedTraveledNodes`/`combinedTraveledEdges`), which is how Symmetry combines with other mechanics instead of staying standalone. `blockedEdges` are deliberately never combined with Symmetry - the grid's walls are static and not reflected per-path, so every symmetric maze would need hand-verification to guarantee the mirror path never crosses a wall the primary doesn't.
- **Eliminators** (`Eliminators.js`) runs a small backtracking search per region: the puzzle doesn't say which other symbol each eliminator cancels, so it tries every pairing (including two eliminators cancelling each other) and accepts the region if any pairing leaves the survivors satisfying their normal rules.
- **Polyominoes** (`Polyominoes.js`) runs an exact-cover backtracking tiling search per region. Each piece instance carries `rotationSteps` (0-3 quarter turns) and `rotatable` (boolean): a `rotatable: true` ("slanted") piece may use any of its shape's unique rotations in the search; a `rotatable: false` ("straight") piece must match `rotationSteps` exactly, a genuine solving constraint. `Renderer.js`'s `drawPolyominoIcon` draws the piece as one solid block (flush unit cells with thin divider lines) and rotates that whole block rigidly - axis-aligned at `rotationSteps*90deg` for straight pieces, tilted at a fixed shallow non-90-degree-multiple angle for slanted ones. That tilt is the *only* rotation cue the player gets; there's no separate badge/arrow icon. This is deliberately positive-piece tiling only - no subtractive/negative pieces, since their exact rule in the source game couldn't be reconstructed with confidence.

**Input rules:** snap to the nearest node within a grab radius; can't skip nodes (must be grid-adjacent to the last one); can't cross a blocked edge; no interpolation - the line snaps instantly node-to-node. On desktop/fine-pointer input, revisits are limited to stepping back onto the immediately-previous node (undo-by-retracing, not a general reverse). On mobile thumb-scope input, tapping a node that is already earlier in the active path rewinds directly back to that node as a quicker touch-friendly undo. On Symmetry levels, either visible start point may be used.

**Save shape** (`SaveManager.js`, in `localStorage`):
```js
{ completedPuzzles: [], currentLevelIndex: 0 }
```

**Rendering** is plain SVG with five groups in a fixed order: `grid-lines`, `symbols`, `player-path`, `mirror-path`, `nodes`.

## Mechanics

The shared engine currently supports these rule types across the shipped collections (for reference here - the game itself never names them):

- **Dots** - the drawn line must pass through every dot.
- **Blocked Edges** - certain grid lines can never be crossed (shown as a broken red line); the drag input physically stops you from crossing one.
- **Required Edges** - certain grid lines (highlighted gold) must be part of the final path, not just avoided.
- **Triangles** - a cell marked with 1-3 triangles requires exactly that many of its four edges to be part of the path.
- **Colored Regions** - the path must partition the grid so that same-colored cells always end up in one connected region, with no two colors sharing a region. Not limited to two colors - a region just can't mix colors.
- **Stars** - a star must pair with exactly one other same-colored cell (another star, or a plain colored square) within its region; a region holding a star can't contain anything of a different color.
- **Eliminators** - cancels exactly one other symbol (a triangle, colored square, star, or another eliminator) in its region; the puzzle doesn't say which one, so it's solved if *any* valid pairing leaves everything else satisfied.
- **Polyominoes** - a region containing one or more Tetris-style piece icons must be exactly tileable by all of them at once, with no gaps or overlaps. Each piece icon is drawn as one solid block, shown one of two ways: sitting axis-aligned ("straight") means it must fit in exactly that one orientation; tilted at an angle ("slanted") means it may be rotated to any of its valid 90-degree orientations.
- **Turn Nodes** - if the path visits that node, it must turn there rather than pass straight through.
- **Straight Nodes** - if the path visits that node, it must pass straight through it, either horizontally or vertically.
- **Horizontal Nodes** - if the path visits that node, it must pass straight left-to-right through it.
- **Vertical Nodes** - if the path visits that node, it must pass straight top-to-bottom through it.
- **Corner Nodes** - if the path visits that node, it must form one specific L-shaped corner orientation there.
- **Region Size Numbers** - each numbered cell adds that many cells to its region's required total. If multiple numbers appear in the same region, add them together; that region must contain exactly that many cells in any shape. Current authoring preference is to keep individual values compact, usually `2-5`, and express larger totals through multiple numbers rather than a single big value.
- **Symmetry** - a second, mirrored path is drawn automatically alongside yours; both must be valid and the two must never touch. On a Symmetry level, your drawn path may start from either visible start point and may finish on either a listed exit or that exit's mirrored counterpart. The mirror path's nodes/edges also count toward dots/required/triangles/regions, so Symmetry can combine with the other mechanics rather than staying standalone.

Most puzzles have a single exit, but a level can define more than one - either ending is a valid solution, so the player may need to plan for more than one possible finish.

## Level progression

Levels are one flat, gated sequence - solving level N unlocks level N+1 (`main.js`'s `isLevelUnlocked`, based purely on which puzzle IDs are in `save.completedPuzzles`, not a separate pointer). Completed levels stay freely replayable from the level-select strip. In the legacy single-campaign structure, the original 9 core mechanics finish teaching well before the heavy combination phases begin - no mechanic is introduced after a "finale":

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
| 53-58 | Polyominoes - all 9 original core mechanics now introduced |
| 59-64 | Symmetry reintroduced, combined with other mechanics |
| 65-80 | Fresh 2-3 mechanic combinations spanning all 9 original core mechanics, on genuinely varied grid shapes (3x3/3x4/4x3/4x4) |
| 81-96 | 4-mechanic combinations on bigger boards |
| 97-112 | Heaviest main-campaign combinations |
| 113 | Grand finale |
| 114-134 | Bonus hard-mode tier - harder than the main finale, each a distinct board |

See `level-creation-rulebook.md` for the mechanic-order rationale and the exact difficulty target per tier.

### Collection philosophy

The app supports multiple collections through a level-source dropdown. Those collections do **not** define different mechanic rules; they define different pacing and ordering styles over the same shared rule system.

- Both collections use the exact same engine and mechanic rules; only the authored/generated level set and pacing philosophy differ.
- A new mechanic should usually get only `1-2` pure introduction levels.
- Difficulty should start scaling earlier instead of waiting for a long late-game ramp.
- Once a mechanic is introduced, it should begin combining with previously-taught rules quickly to keep the player engaged.
- Cell-based mechanic icons must never overlap on the same cell.
- The extended Codex block (`151-300`) is where the newer node-direction family and region-size numbers are introduced, then recombined into harder late-game boards.
- A level may use the start or finish to frame the route, but most of the route should still be deduction-driven instead of feeling pre-drawn by node and edge constraints.

### Level design priorities

When we build or revise a collection, these priorities outrank everything else:

1. **Discoverability first.** A level should teach or reinforce a rule through play, not through guesswork or UI explanation.
2. **No decorative mechanics.** Every active symbol should remove real candidate paths; if stripping it does not matter, it needs to move or be removed.
3. **Difficulty should feel like it climbs.** If a later level feels softer than the surrounding band, reorder it earlier or replace it rather than leaving a dip in the curve.
4. **Combinations should start early.** New mechanics get a short pure introduction, then begin mixing with older ones quickly.
5. **Distinct boards matter.** Avoid repeating the same wall skeleton or visual structure just with different symbol paint.
6. **Board size is not fake difficulty.** Prefer better logic density before reaching for a larger grid.

### Level authoring thought process

The practical authoring mindset is:

1. Pick what the level is supposed to test: an introduction, a reinforcement, or a hard combination.
2. Decide which mechanic should be the star and which older mechanics are there to support or complicate it.
3. Draft the board so the solution space starts broad enough to allow deduction, not just maze-following.
4. Place symbols to rule out meaningful alternatives, not just to decorate the solved path.
5. Check whether the level belongs where it currently sits in the collection; if it reads easier than its neighbors, move or replace it.
6. Only after the logic feels right, verify it with solve-count, redundancy, and branching checks.

## How levels are designed and verified

Every serious level is meant to be a deduction space, not just a hidden route. The board should initially support multiple believable ideas, and the symbols should collapse those ideas by logic. That means this project does **not** treat level generation as "place some symbols on a solved path and see if the validator accepts it." The reasoning standard is stricter than that.

This part is not obvious from playing the game, so it is stated explicitly here: every level past the earliest teaching boards should be built and checked against a real methodology, not tuned by feel.

1. **Brute-force solution counting**, not just "does at least one solution exist." A headless solver enumerates every valid path on a candidate puzzle using the real engine code, and each difficulty tier has a target ceiling (e.g. a four-mechanic level should land at <=6 solutions, not 100+).
2. **Redundancy audit** - for every active mechanic, strip it from the puzzle and re-count. If the solution count doesn't change, that mechanic was decorative and gets repositioned to somewhere it actually rules something out.
3. **Branching check** - strip everything except `blockedEdges` and re-count. A maze that alone already forces a near-unique path leaves nothing for the other mechanics to filter; a real puzzle needs raw branching that *collapses* to the final count, not one that starts there.
4. **Compatibility check** - a mechanic can matter against the raw maze and still be effectively constant among the candidates that survive every other rule. The real question is whether it changes the surviving candidate set.
5. **Density scales with grid size** - a bigger board needs proportionally more meaningful constraint interaction, or it ends up easier despite looking more complex.
6. **Logic over maze walls** - `blockedEdges` is the only mechanic that removes topology outright, so it must be used carefully. Prefer a light `2-4` edge cut and let the other mechanics do the deeper reasoning.
7. **Walls are optional, not the default board template** - a strong collection should contain plenty of zero-wall levels. If blocked edges appear in almost every board, they stop feeling like a mechanic and start feeling like the board itself.
8. **Directional nodes should do their own work** - if a `horizontal`, `vertical`, or oriented `corner` node already forbids certain exits, do not also block those same exits with `blockedEdges`. That duplicates information instead of creating fresh deduction space.
9. **Start/end framing is allowed, middle-route scripting is not** - a level may frame the opening or closing approach, but the middle of the solve should still be governed by deduction.

New mechanics also get unit-tested against hand-built synthetic puzzles (edge cases like "no valid target to cancel" or "piece only fits with a 180-degree rotation") before any real level uses them, and every engine change gets a full regression pass - every existing level re-verified, plus a simulated end-to-end playthrough checking unlock gating, solvability, and that no mechanic name ever leaks into the UI - before new content is added.

The full reasoning standard, including what the generator is supposed to optimize for, the step-by-step design loop, exact per-tier numeric targets, constraint-design principles, and hard rules, lives in `level-creation-rulebook.md`. That file should be treated as the authoritative design document.

### Current collections

- `src/puzzles/claude-levels.json` - 120 levels, longer teaching blocks, gentler early ramp.
- `src/puzzles/codex-levels.json` - 300 levels, shorter intros, earlier combination play, steeper late ramp, and an extended `151-300` band for node-direction and region-size mechanics.
- `src/puzzles/levels.json` - the older 134-level single-campaign source kept as legacy reference material.

## Guiding principles

When considering a new mechanic or feature, ask:
- Does this encourage observation?
- Does it introduce a genuinely new idea?
- Can players discover the rule without being told?
- Does it deepen existing mechanics instead of adding unnecessary complexity?
- Does it keep the interface calm and uncluttered?

If the answer to any of these is "no," reconsider whether it belongs in the game. The goal is not to imitate *The Witness*, but to share its philosophy: simple rules, deep interactions, and rewarding moments of discovery.

## Possible future additions

Some of these are not built at all; others exist only as prototypes. All could work without a backend, storing data locally or importing/exporting JSON:

- Daily puzzle
- Community level import
- Level editor
- Puzzle replay
- Hint system
- Accessibility options
- Keyboard controls
- Further touch accessibility refinements
- Audio (line-drawing sound, success/failure tones, ambient background) - nothing in the codebase plays sound today; if ever added, it should never distract from the puzzle.

## Status

Desktop tracing, debug solution reveal, the debug symbol guide, and the mobile thumb-scope control are all live in the current build, including soft-follow camera movement, adjustable follow speed, left/right-hand placement, dismiss/reopen behavior, tap-to-rewind on visited nodes, and swipe capture that suppresses page scrolling while the scope is being dragged.

The shared engine now covers the original core mechanics plus the newer node-direction family and region-size numbers. No audio, level editor, hint system, or daily puzzle yet - see Possible future additions above.

## Further reading

`level-creation-rulebook.md` - the authoritative level-design document for mechanic order, collection philosophy, generator intent, design reasoning, verification flow, constraint principles, and hard rules. Read it before adding or editing a level.

---

# game.py - legacy prototype

*An earlier, unrelated terminal-based Python puzzle game. Different tech stack (Python, console/keyboard I/O), no shared code or design lineage with The Vision beyond a "connect the dots" premise. Not actively maintained.*

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


