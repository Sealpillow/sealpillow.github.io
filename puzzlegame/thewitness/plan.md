# Puzzle Game Development Plan
### Project Codename: Insight
*A browser-based puzzle game inspired by the design philosophy of **The Witness**, built entirely with HTML, CSS, JavaScript, and SVG.*

---

# 1. Vision

## Goal

Create a logic puzzle game where players solve line-drawing puzzles that gradually teach mechanics without explicit tutorials.

The emphasis is on:

- Observation
- Deduction
- Discovery
- Elegant interactions
- Minimal UI
- Environmental progression

NOT on:

- Story
- Combat
- RPG mechanics
- Timers
- Randomness

The player should feel smart because they discovered the rule themselves.

---

# 2. Technical Constraints

Hosting:

- GitHub Pages

Technology:

- HTML
- CSS
- Vanilla JavaScript
- SVG

No:

- Backend
- Database
- Login
- Frameworks
- Build tools

Progress saved using:

- localStorage

---

# 3. Design Philosophy

## Teach Through Play

Every mechanic should be introduced naturally.

Bad:

> "Triangles mean this."

Good:

The player solves several easy puzzles until they naturally realize what triangles represent.

---

## One New Idea At A Time

Each stretch of the level sequence introduces only ONE new mechanic before it starts getting combined with what came before.

**Superseded:** this section originally described a literal "Area 1 → Area 2 (new mechanic) → Area 3 (combination) → Area 4 (advanced) → Final Area" structure, with each area gated and named. That was replaced by the flat, unlabeled 60-level sequence in Section 13 — the *principle* (one new idea at a time, then rewoven) still holds, it's just expressed as level ranges now (e.g. dots at 5-9, blocked edges at 10-14, ... eliminators at 56-57, polyominoes at 58-59) rather than discrete named areas. See Section 13's table and the Phase 12 "Superseded note" for the full history.

---

## Elegant Complexity

Difficulty comes from:

- interaction of rules

NOT

- huge boards
- randomness
- impossible memorization

---

# 4. Gameplay Loop

Player enters puzzle

↓

Draw line

↓

Release

↓

Validate

↓

Solved?

Yes
↓

Unlock next puzzle

No
↓

Reset animation

Repeat

---

# 5. Game Structure

**Superseded:** this originally described a Main Menu → Puzzle World → Area → Puzzle → Solved → Unlock Next → Finish Area → Unlock New Area flow with a menu screen and gated areas. None of that was built. The real structure, matching the flat-sequence redesign in Section 13, is much simpler:

Single page (`index.html`) loads directly into the current puzzle

↓

Puzzle

↓

Solved (`validateSolution` passes) → next level unlocked in `save.completedPuzzles`

↓

Level-select strip (`#puzzle-nav`) lets the player jump to any already-unlocked level to replay it

There is no main menu, no "puzzle world" screen, and no area concept anywhere in the code.

---

# 6. Puzzle Engine

Core systems:

## Grid

`Grid.js` is generic over any `width`×`height` (not a fixed enum of square sizes) — everything scales automatically off those two numbers. In practice `levels.json` ranges from 1×1 up through 4×4, with one non-square 4×3 board (level 60); no level ever uses 5×5 or 6×6.

---

## Nodes

Each intersection becomes a node.

Example:

O──O──O

│  │  │

O──O──O

│  │  │

O──O──O

---

## Edges

Edges connect nodes.

Player may travel only through valid edges.

---

## Path

Stores:

```
Node 1
↓

Node 2
↓

Node 3
↓

Node 4
```

Validation occurs only after reaching an exit.

---

# 7. Puzzle Data Format

**Superseded:** the original sketch here used a generic `id: "garden_01"` and a catch-all `symbols: []` array. The real format that shipped uses `level_NN` ids and a separate, typed array per mechanic instead of one generic `symbols` list — e.g. level 56 from the actual `levels.json`:

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

The full set of mechanic-specific fields a puzzle can carry: `dots`, `blockedEdges`, `requiredEdges`, `triangles`, `cellColors`, `stars`, `eliminators`, `polyominoes`, and a `symmetry` string (currently only `"rotational"`). A puzzle only includes the fields its active mechanics need — most levels use 0-2 of them.

Every puzzle exists as JSON, in a single file (`src/puzzles/levels.json`) rather than per-area files — see Section 13.

---

# 8. Rendering

Use SVG.

Structure:

```html
<svg>

<g class="grid-lines"></g>

<g class="symbols"></g>

<g class="player-path"></g>

<g class="mirror-path"></g>

<g class="nodes"></g>

</svg>
```

(`grid-lines`, not `grid`; `mirror-path` was added for Symmetry in Phase 7 — this is the real group structure from `index.html`.)

Reasons:

- scalable
- crisp
- easy hit detection
- mobile friendly

---

# 9. Input System

Desktop

Mouse:

Click

↓

Drag

↓

Release

Mobile

Finger

↓

Drag

↓

Release

Rules:

- snap to nearest node (`nearestNode` + a grab-radius threshold)
- cannot skip nodes (must be grid-adjacent to the last node)
- cannot cross blocked edges
- cannot revisit a node — except stepping back onto the immediately-previous node, which pops it (undo-by-retracing, not a general reverse)
- no interpolation/easing — the line snaps instantly node-to-node; see `src/engine/Input.js`'s click-to-arm / move-to-trace / click-to-submit interaction model for how a path gets armed and released (a plain click arms tracing without holding the button; a classic click-and-drag still works too)

---

# 10. Save System

Stored locally.

```javascript
// SaveManager.js's real defaultSave() shape — no unlockedAreas/settings/statistics
// (all superseded along with the areas model), and one field the original sketch
// didn't anticipate: currentLevelIndex, so the app can resume where you left off.
save = {
  completedPuzzles: [],
  currentLevelIndex: 0,
}
```

Use:

```
localStorage
```

---

# 11. Puzzle Validation Pipeline

Step 1

Valid path? (adjacency, no revisits, AND no blocked edges crossed — `isValidPath` checks blocked edges inline as part of path validity, not as a separate later step; `Input.js` also blocks the move live during dragging so an invalid edge is never even drawn)

↓

Step 2

Reached exit? (matches ANY entry in `exits`, not necessarily all — see the multi-exit note in Section 13)

↓

Step 3

Passed all dots?

↓

Step 4

Required edges?

↓

Step 5

Region-based mechanics (triangles, colored regions, stars — or, if the puzzle has eliminators, a single combined region-aware check replaces all three) and polyominoes

↓

Step 6

Symmetry (if the puzzle has one)

↓

Success

---

# 12. Puzzle Mechanics Roadmap

## Phase 1 — ✅ Done

Basic Path

✔ Start

✔ Exit

✔ Drawing

---

## Phase 2 — ✅ Done

Dots

Player must pass through every dot.

---

## Phase 3 — ✅ Done

Blocked Edges

Cannot cross certain edges.

`Validator.isEdgeBlocked`, the blocked-edge rendering, and the drag-time block in `Input` all work end to end. Introduced at levels 10-14 in `src/puzzles/levels.json`.

---

## Phase 4 — ✅ Done

Required Edges

Highlighted edges must be included.

`Validator.includesRequiredEdges` plus a highlighted-line style in `Renderer`/`style.css` (`.grid-edge.required`). Introduced at levels 15-19 in `src/puzzles/levels.json`.

---

## Phase 5 — ✅ Done

Colored Regions

Player separates regions using the path.

`Validator.satisfiesRegions` calls `computeRegions` (now in `src/engine/Regions.js`, shared with Stars/Eliminators/Polyominoes — see Phase 10), which flood-fills grid cells via `Grid.cellNeighbors`, treating any path edge as a wall; a region is invalid if it contains more than one distinct `cellColors` value. Rendered as small colored chips centered in each cell. Introduced at levels 30-34 in `src/puzzles/levels.json`.

---

## Phase 6 — ✅ Done

Triangles

Cell requires exactly N adjacent edges.

`Validator.satisfiesTriangles` counts, per `triangles` entry `[col, row, count]`, how many of `Grid.cellEdges(col, row)` the path traveled, and requires an exact match. Rendered as a small triangle cluster in the cell. Introduced at levels 25-29 in `src/puzzles/levels.json`.

---

## Phase 7 — ✅ Done

Symmetry

Player controls two mirrored paths.

New `src/engine/Symmetry.js` module: `transformNode`/`mirrorPath` apply a puzzle's `symmetry` transform (currently `"rotational"`, 180° about grid center) to the drawn path, and `satisfiesSymmetry` fails if the primary and mirrored path ever share a node. The mirror path is rendered live in a distinct color, alongside a dimmed mirror start/exit marker so the player knows where it runs. No changes to `Input` were needed — the mirror path is purely derived from the one path the player actually drags. Symmetry is introduced standalone in `src/puzzles/levels.json` (20-24) — note that opposite-corner start/exit pairs are unsolvable by construction (they collide with their own reflection), and any grid node that is its own reflection must be avoided by the path.

**Symmetry now combines with the other mechanics** (`Validator.js`'s `combinedTraveledNodes`/`combinedTraveledEdges`): `passesAllDots`/`includesRequiredEdges`/`satisfiesTriangles`/`satisfiesRegions` credit the mirror path's nodes/edges alongside the primary path's whenever `puzzle.symmetry` is set. This isn't a special case bolted on — since the mirror path is entirely *derived* from the primary path via the transform, "the mirror path satisfies constraint X" and "the primary path's reflection satisfies X" are the same fact; crediting both sides just makes that fact available to the dot/edge/cell checks instead of ignoring half of what's already true. Levels 36 and 46 combine Symmetry with Dots/Triangles and Dots/Required/Regions respectively (blockedEdges is deliberately not combined with Symmetry: the grid's blocked edges are static and not reflected per-path, so the mirror path can visually cross a wall the primary never touches — best avoided rather than requiring every maze to be hand-verified symmetric). `isValidPath`/`reachesExit` still apply only to the primary drawn path, since that's the one actual drag gesture; only the four "which of the still-open edges get used" checks were extended.

---

## Phase 8 — ✅ Done

Mixed Mechanics

Multiple rule types.

`Validator.validateSolution` already ANDs every mechanic check together, so combining rules needed no new engine code — just puzzle data combining more than one of `dots`/`blockedEdges`/`requiredEdges`/`triangles`/`cellColors` at once. Mixed-mechanic levels are woven throughout `src/puzzles/levels.json` rather than isolated into one area — see Section 13.

---

## Phase 9 — ✅ Done

Stars, multi-color Regions, multi-exit levels

A star must pair with exactly one other cell of the same color in its region.

`Validator.js` was refactored to pull the region flood-fill out of `satisfiesRegions` into a shared `computeRegions(grid, puzzle, path)` helper, since the new `satisfiesStars` needs the same cell partitioning. For each region, `satisfiesStars` collects any `stars` entries present; a region with no star is left alone (governed only by the ordinary `satisfiesRegions` single-color rule). A region with a star must contain exactly 2 cells of that star's color — counting both other stars and plain `cellColors` squares — and nothing of a different color; two different star colors landing in the same region is an automatic fail. Rendered as a 5-point polygon (`Renderer.js`'s `starPoints` helper) using the same per-color fill classes as region chips. Introduced at levels 41-46 in the current 120-level sequence (standalone pairing, pairing with a plain colored square, then combined with Dots/Required/Blocked — see Section 13).

Two more additions needed no engine work, since the existing code already generalized to them — only new content: **Colored Regions is not limited to two colors** (`satisfiesRegions`'s mixed-color check was already color-count-agnostic; a third `--region-blue` was added to the palette), and **a puzzle can define more than one exit** (`puzzle.exits` was already an array; `reachesExit` already accepted any match).

---

## Phase 10 — ✅ Done

Eliminators, Polyominoes

An eliminator cancels one other symbol in its region; a polyomino region must be exactly tileable by its piece set.

Both mechanics needed genuine search, not a fixed rule check, so the engine grew three new files. `src/engine/Regions.js` is a shared module holding `computeRegions`/`combinedTraveledEdges`/`combinedTraveledNodes` (pulled out of `Validator.js` verbatim — zero behavior change, confirmed by regression before adding any new content), so the two new mechanic modules can use the same region partitioning without a circular import back into `Validator.js`.

**Eliminators** (`src/engine/Eliminators.js`): a puzzle's `eliminators: [[col,row]]` entries each cancel exactly one other symbol — a triangle, a plain colored square, a star, or another eliminator — within their own region. The puzzle doesn't specify which pairing to use, so `satisfiesEliminators` runs a small backtracking search per region: try every way to match each unresolved eliminator to some other not-yet-used symbol (including another eliminator, letting two cancel each other out), and accept the region if any pairing leaves the untouched survivors satisfying their normal rules (independent triangle counts; the same single-color-or-star-pairing check as `satisfiesRegions`/`satisfiesStars`, just restricted to the surviving subset). Region sizes here are always small (a handful of symbols), so brute-force search is instant. When `puzzle.eliminators` is non-empty, this check *replaces* the independent `satisfiesTriangles`/`satisfiesRegions`/`satisfiesStars` calls for the whole puzzle (`Validator.js`'s `satisfiesRegionMechanics`), since exempting a cancelled triangle requires knowing which region it's in — those three checks have no such notion on their own. Every non-eliminator level takes the exact same code path as before, so this is a strict superset, not a rewrite. Rendered as an orange ring with an X (`.eliminator-ring`/`.eliminator-mark`). Introduced at levels 47-52 (see Section 13) — the intro level pairs an eliminator with a triangle whose count is 4, which is otherwise mathematically unsatisfiable, making the mechanic's necessity unambiguous rather than just "technically non-redundant"; this trick is reused throughout the bonus hard tier (101-120) too.

**Polyominoes** (`src/engine/Polyominoes.js`): a small named shape library (`domino`, two trominoes, `square`, four tetrominoes) as canonical `[dc,dr]` cell offsets. `puzzle.polyominoes: [[col,row,shapeName]]` places an icon in a cell purely to assign that piece to whichever region contains it (the icon's exact cell doesn't matter beyond that). `satisfiesPolyominoes` collects all pieces assigned to each region and runs an exact-cover backtracking search — always resolve whichever unplaced region cell comes first, try every piece in every rotation that can cover it, recurse — accepting the region only if some placement uses every assigned piece with no gaps and no overlaps. Rotations (90° steps only, no mirroring) are precomputed once per shape at module load. This is deliberately *positive-piece tiling only* — the real Witness also has subtractive/negative pieces, but its exact interaction rule couldn't be reconstructed with confidence, and a guessed-wrong subtractive rule would be worse than not having one; positive-only tiling is already a complete, well-defined mechanic on its own. Rendered as a miniature grid of filled squares matching the piece's canonical shape (`Renderer.js`'s `drawPolyominoIcon`). Introduced at levels 53-58 (see Section 13): single-piece tiling, then multi-piece tiling requiring a 90°/180° rotation to prove the rotation search actually works.

Both mechanics were unit-tested against hand-built synthetic puzzles (pass/fail cases for each edge case — no valid target, mutual elimination, wrong-shape/wrong-size pieces, rotation-required tiling) before touching real level data, then verified on the actual levels via the same solution-counting/redundancy-audit harness as every other mechanic in this document.

---

## Phase 11 — ✅ Done

Full fresh 120-level redesign (100-level main campaign + 20-level bonus hard tier)

No engine changes — this was a content-only redesign of `src/puzzles/levels.json`, prompted by the difficulty curve across the original 60 levels being uneven (confirmed by the actual solution-count data: levels 1-34 and 51-60 both swung erratically between very loose and very tight with no intentional trend) and structurally odd (three new mechanics — Stars, Eliminators, Polyominoes — were introduced *after* the original 5-mechanic finale at level 50, undercutting it). The fix was a full fresh redesign rather than a patch: all 120 levels were authored from scratch (existing techniques like the Full Cut, free-adjacent-triangle, and triangle-count-4-cancelled-by-eliminator tricks were reused as a toolkit, but no level content was preserved), reordering so all 9 mechanics finish teaching (by level 58) well before the heavy combination phases begin, and adding an explicit 20-level bonus hard tier (101-120) beyond the main 100-level campaign. See Section 13 for the full tier breakdown and the updated difficulty methodology notes on what's uniformly enforced versus pragmatically accepted.

Every one of the 120 levels was individually brute-force solved, redundancy-audited, and branching-checked before assembly; the full set was then regression-solved together and driven through the real UI end-to-end (sequential unlock gating from level 1, every level solved via simulated mouse drag, the finale message confirmed at both 100 and 120, zero mechanic-name leaks, zero console errors).

---

**Superseded note (kept for history):** an earlier iteration organized these mechanics into 7 separate "areas" (`area1.json`..`area7_mixed.json`), each gated as a whole and displayed via named tabs ("Basics + Dots", "Blocked Edges", etc.). That was replaced by the flat, unlabeled level sequence described in Section 13 below — labeling an area "Triangles" before the player discovers the rule directly violated this document's own "Teach Through Play" principle (Section 3), and isolating each mechanic into its own area worked against "keep the user engaged" by letting a learned mechanic go quiet for dozens of puzzles at a time.

---

# 13. Level Progression

Puzzle data lives in a single file, `src/puzzles/levels.json` — one flat, ordered array of 120 puzzles (`level_01`..`level_120`), not separate area files. The player only ever sees "Level N of 120"; no area or mechanic name is displayed anywhere, including status messages. Levels are gated sequentially: level N+1 unlocks only once level N is solved (`main.js`'s `isLevelUnlocked`, derived from `save.completedPuzzles`). Completed levels stay freely replayable via the level-select grid.

**Superseded (kept for history):** the previous version of this section documented a 60-level sequence where Stars, Eliminators, and Polyominoes were appended *after* a 5-mechanic finale at level 50 — meaning three brand-new mechanics were introduced only after the game had already staged its "grand finale," and the intro-tier solution counts swung erratically level to level (e.g. a tight `1`-solution Symmetry intro sitting immediately next to a wide-open `60+` level, with no intentional trend). That structure is fully replaced by the 120-level sequence below: every mechanic now finishes teaching well before the heavy combo phases begin, and every tier has an explicit, coherent tightening trend rather than ad hoc per-level tuning.

Mechanics are introduced gradually, each given a full 6-level teaching block, and are all fully introduced before the heavy combination phases begin:

| Levels | Content |
|---|---|
| 1-4 | Basic path only (grid ramps 1x1 → 2x2 → 3x3) |
| 5-10 | Dots introduced, reinforced up to a 4x4 grid |
| 11-16 | Blocked Edges introduced, then combined with Dots |
| 17-22 | Required Edges introduced, then combined with Blocked Edges and Dots |
| 23-28 | Symmetry introduced standalone |
| 29-34 | Triangles introduced, then combined with Dots and Blocked Edges |
| 35-40 | Colored Regions introduced, then combined with Dots, Required Edges, and Blocked Edges |
| 41-46 | Stars introduced: standalone pairing, pairing with a plain colored square, then combined with Dots/Required/Blocked |
| 47-52 | Eliminators introduced: paired with an otherwise-impossible triangle (count 4) so its necessity is unmistakable, then combined with colors, stars, required edges, and blocked edges |
| 53-58 | Polyominoes introduced: single-piece tiling, then multi-piece tiling requiring rotation, then combined with required edges, dots, and blocked edges |
| — | **All 9 mechanics now introduced by level 58** |
| 59-64 | Symmetry reintroduced combined with 1-2 other mechanics (dots, triangles, required edges, colored regions) |
| 65-76 | Fresh 2-3 mechanic combinations spanning *all 9* mechanics, not just the original 6 — including combos pairing two of {Stars, Eliminators, Polyominoes} together |
| 77-88 | 4-mechanic combinations, systematically pairing the newer mechanics with older ones in combinations not shown yet |
| 89-99 | Heaviest main-campaign combinations, tightest solution counts before the finale |
| 100 | Grand finale — Eliminators + Polyominoes + Triangles + Dots |
| 101-120 | Bonus hard-mode tier — harder than the main finale, built on a repeated "Full Cut" 3x3 skeleton (blocked-edge cut + required-edge approach-forcer + free-adjacent triangle) with a different 9th-mechanic overlay each level, systematically covering combinations not exhausted in the main campaign |

Mechanic order (Dots → Blocked → Required → Symmetry → Triangles → Regions → Stars → Eliminators → Polyominoes) groups the three simple point/edge rules first, places Symmetry as a paradigm-shift breather (matching how the actual Witness introduces it early rather than saving it as a capstone), then ends on the mechanics requiring reasoning beyond a single point/edge — Triangles locally (one cell), Colored Regions globally (the whole board), Stars as a stricter regions variant, and Eliminators/Polyominoes last since both depend on the player already understanding regions.

## Difficulty methodology

A first pass at the original 35-50 range only proved "at least one solution exists" and never checked *how many* — several of those levels, despite nominally combining 4-5 mechanics, turned out to have 100+ valid alternate routes on a big, under-constrained 4x4 board, which is not actually hard no matter how many mechanic types are switched on. This was a direct violation of the "Elegant Complexity" principle above (huge boards ≠ difficulty). The fix, the standing methodology for this puzzle set:

**Measure difficulty by counting valid solutions, not just proving one exists.** A brute-force DFS enumerates *every* valid solution up to a safety cap, using the real `Grid`/`Validator` code, plus a redundancy audit (strip each active mechanic, re-count; unchanged count means it was decorative) and a branching check (strip everything except `blockedEdges`; raw branching should meaningfully exceed the final count, or the maze alone is doing all the work). Teaching-tier levels (5-58, one mechanic at a time, no cutting tool active yet beyond whichever mechanic is being taught) are allowed to stay loose — this mirrors the real game's own precedent and isn't a flaw, since forcing artificial tightness there would mean overloading an *introduction* with more instances than a first exposure should have. The combination tiers (65 onward) are held to explicit ceilings: fresh 2-3 mechanic combos (65-76) target ≤10 tightening toward ≤6, 4-mechanic combos (77-88) target ≤6 tightening toward ≤3, the heaviest pre-finale tier (89-99) targets ≤3, the finale (100) targets 1-2, and the bonus hard tier (101-120) targets exactly 1 with verified real branching underneath. Most combination-tier levels hit these targets; a handful (e.g. levels 66, 67, 71, 73, 79, 81, 82, 92, 97, 103, 115) land looser than their tier's target after a bounded number of tightening attempts — kept as an accepted tradeoff (matching the precedent already set by the original 42/47/48 case) rather than spending unbounded iteration chasing an exact number on every one of 120 levels, since the primary goals (solvability, zero redundant mechanics, a coherent overall tightening trend) were met throughout.

**Note on the paragraphs below:** they document the techniques (Full Cut, branching check, density scaling, light-cut preference, mechanic compatibility) using their original worked examples from the earlier 60-level design — the specific level numbers referenced (42, 46, 47, 48, 49, 50) point to *that* history and no longer describe the current level 120's content, which was fully redesigned. The techniques themselves are unchanged and were reused throughout the 120-level redesign.

**`blockedEdges` as a real topological cut, not decoration.** Between two adjacent grid columns (or rows) there are `height+1` (or `width+1`) crossing edges — block all but one and every simple path is *provably* forced through that single gap, for the cost of just a few blocked-edge entries. Cells bounded by the newly-blocked edges get 1-2 edges fixed at zero for free — the cheapest place to add a tight triangle count (never use 4, see below). A required edge placed at the gap, or right next to it to force a specific approach direction, is satisfied by construction; region-colored cells straddling the gap are separated for free too, since the gap edge is guaranteed traveled.

**Solution count alone is not sufficient — a puzzle also needs real branching to actually be a puzzle.** A second pass at levels 42-50 pushed the cut idea to its extreme — a full "serpentine" blocking every row-crossing except one *alternating* turn point per row-boundary — which does force a unique solution, but at the cost of forcing **zero branching**: the blocked edges alone leave only one physically drawable line, so there's no wrong path to even consider and no reasoning for the player to do (this was caught by playtesting, not by the solution-count metric, which was satisfied and gave false confidence). The fix: verify branching directly. Strip every mechanic except `blockedEdges` and re-run the solution-count enumeration — this "raw" count is how many routes the maze alone still permits. A healthy level needs raw ≫ final (e.g. raw 16 solved down to a final 1-2 by genuine dots/required/triangles/regions filtering, as in the current 42-50), never raw = final = 1 (a level where the maze alone already determines everything, making the other mechanics decorative). In practice this means leaving 2+ open crossings per row/column boundary rather than exactly 1, so the underlying graph still has real decision points for dots/required/triangles/regions to filter between.

**Constraint density must scale with grid size — grid size itself stays a free stylistic choice.** `blockedEdges` is the only mechanic that removes topology; dots/required/triangles/regions just constrain which of the still-open edges get used, and a bigger board always offers more equivalent detours around a single instance of any of them. Rough guideline: ~2-3 constraint instances for a 2x2 board, ~5-6 for 3x3, ~8-10 for 4x4 (a real step up from the ~3-4 total instances per 4x4 level in the first pass, which is exactly why those felt easy despite looking complex). A level with no `blockedEdges` in its mechanic set has no cutting tool available and needs proportionally *more* of the other constraint types to reach the same tightness (see level 49 and 44, both blockedEdges-free, both still hitting ≤3/≤6 through density alone).

**Prefer a light cut over a heavy one — `blockedEdges` should prune, not carry, the puzzle.** Levels 42, 43, 45, 47, and 48 originally leaned on a ~12-edge partial-serpentine maze (blocking all-but-one-alternating crossing per boundary) to hit their solution-count target — this technically worked, but it meant most of each puzzle's difficulty came from a visual, physical wall rather than from reasoning about dots/required/triangles/regions, which reads as "hard because of a maze" rather than "hard because of logic," and it drowned out the other mechanics' role in the level. Rebalanced: each of these now uses a single light Full Cut (4 blocked edges on a 4x4 board — one per row or column boundary, not one per alternating pair) and compensates for the reopened branching with more dot/required/triangle/region density instead. Level 46 was rebuilt without any `blockedEdges` at all, proving the point at the extreme — a Symmetry + Dots + Required + Regions combo can hit a tight count (2) purely through logical constraints. Standing guidance for future levels: reach for a light Full Cut (one blocked edge per boundary) first, and only add a second cut or thicken it if density from the other mechanics genuinely can't reach the target — never use a heavy serpentine as the default way to force a low solution count.

**Mechanic compatibility: every active mechanic must independently exclude at least one candidate — not just coexist with the others.** A third pass found that most levels 35-50, despite hitting their solution-count target *and* having real branching, still had 1-3 mechanics that were pure decoration: removing that mechanic from the puzzle didn't change the solution count at all, because a different mechanic (or the maze itself) already implied it. This happens easily when constraint placements are chosen to be "safely satisfied by the answer" rather than "actively ruling out alternatives" — e.g. a dot placed on a node the required edge already forces the path through, or a triangle cell bordering blocked edges so tightly that its count is fixed the same way for every surviving candidate. The check: for each active mechanic field, strip it and re-run the solution-count enumeration on the *rest of the puzzle unchanged* — if the count doesn't change, that mechanic contributed nothing and needs repositioning (verified on the actual remaining candidates, not just the raw maze branching — a mechanic can vary across all 16 raw paths yet still be constant among the 2-4 that survive the *other* mechanics, which is what actually matters). Fix by finding a node/edge/cell that differs among whatever currently survives the other constraints (list them out and compare), not by picking constraints independently and hoping they don't overlap. Note the corollary: once N constraints already narrow a level to exactly 1 solution, no (N+1)th constraint can be non-redundant against that final result — if a level needs 5 independently-meaningful mechanics, the underlying maze needs enough raw branching (roughly 2^5, though multi-valued constraints like triangle counts need less) to give each one real work before the field narrows to 1; the level 50 finale needed loosening from a tight 8-path maze to a 43-path one for exactly this reason. Every mechanic in every level 35-50 now independently excludes at least one candidate, verified this way.

Verification, both passes against the real engine code, never hand-derivation: (1) the solution-count enumeration above, confirming every level meets its tier's ceiling; (2) a load-bearing spot-check — solve with one mechanic's constraint stripped, confirm the alternate solution fails the full puzzle — useful for catching decorative constraints, though it's a weak signal on the fully-mazed levels (42-50) where the maze alone already forces a unique path regardless of what else is stripped, so the real evidence of tightness there is the solution count itself, not this check.

Hard design rules worth remembering when adding more levels: a triangle count of 4 is mathematically impossible (a cell's 4 edges form a cycle over 4 nodes; using all 4 forces a revisit, which the engine forbids outright — max valid count is 3) *unless* it's paired with an eliminator that cancels it, which is precisely how level 56 uses it as an unambiguous teaching device; `satisfiesRegions` does not treat `blockedEdges` as flood-fill walls, only the drawn path's own edges count; and the symmetry self-mirror node (grid center on even-sized grids, none on odd-sized grids) and opposite-corner start/exit unsolvability both still apply.

---

# 14. Algorithms Needed

## Pathfinding

Track player movement.

---

## Flood Fill

Determine puzzle regions.

Used for:

- color separation
- shape grouping

---

## Graph Traversal

Represent nodes and edges.

---

## Constraint Validation

Each mechanic validates independently — but as plain exported functions, not classes. The original sketch here used class names (`DotValidator`, `TriangleValidator`, `RegionValidator`, `RequiredEdgeValidator`) that were never built that way; the real functions are `passesAllDots`, `satisfiesTriangles`, `satisfiesRegions`, `satisfiesStars`, `includesRequiredEdges` (all in `src/engine/Validator.js`), plus `satisfiesSymmetry` (`Symmetry.js`), `satisfiesEliminators` (`Eliminators.js`), and `satisfiesPolyominoes` (`Polyominoes.js`).

Each returns:

```javascript
true
```

or

```javascript
false
```

`validateSolution` ANDs every one of them together — the puzzle succeeds only if all return true.

---

# 15. Project Architecture

**Superseded:** the original tree here had a separate `validators/` folder (`DotValidator.js`/`TriangleValidator.js`/`RegionValidator.js`/`RequiredEdgeValidator.js`), per-area `puzzles/area1.json`/`area2.json` files, and a `ui/` folder (`Menu.js`/`HUD.js`/`Transition.js`) for a menu/HUD system that was never built. The real tree:

```
src/

    engine/

        Grid.js

        Renderer.js

        Input.js

        PuzzleLoader.js

        Validator.js

        Symmetry.js

        Regions.js

        Eliminators.js

        Polyominoes.js

    puzzles/

        levels.json

    save/

        SaveManager.js

index.html

style.css

main.js
```

All mechanic validation lives as plain exported functions across `engine/*.js` (see Section 14), not in a dedicated `validators/` folder; all 120 levels live in the one `levels.json` file, not per-area files; and there is no menu/HUD/transition layer — `main.js` handles the single page directly. Although GitHub Pages serves static files, the project is still organized with each module having a single responsibility.

---

# 16. Visual Style

Inspired by:

- clean architecture
- minimal geometry
- muted colors
- soft animations

Avoid:

- flashy particles
- excessive UI
- large HUDs

Focus attention on the puzzle.

---

# 17. Audio

**Not implemented.** Nothing in the codebase plays sound — no `<audio>` element, no Web Audio usage, nothing referencing audio/sound files anywhere in `main.js`, `src/`, or `style.css`. This section was original planning and belongs with Section 18 (Future Expansion) as an idea, not a shipped feature:

- line drawing
- success chime
- failure tone
- ambient background

If ever built: music should never distract.

---

# 18. Future Expansion

Possible additions:

- Daily Puzzle
- Community Level Import
- Level Editor
- Puzzle Replay
- Hint System
- Accessibility Options
- Keyboard Controls
- Touch Gestures

All can work without a backend by storing data locally or importing/exporting JSON.

---

# 19. Milestones

## Milestone 1

- SVG grid
- Mouse drawing
- Path rendering
- Win detection

Estimated: 1 week

---

## Milestone 2

- Puzzle loading
- Save system
- Level selection
- Animations

Estimated: 1 week

---

## Milestone 3

- Dots
- Blocked edges
- Required edges

Estimated: 2 weeks

---

## Milestone 4

- Region detection
- Flood fill
- Colored regions

Estimated: 2–3 weeks

---

## Milestone 5

- Triangles
- Mixed mechanics
- Polish

Estimated: 2 weeks

---

## Milestone 6

- Sound
- UI polish
- Performance
- Mobile support

Estimated: 1–2 weeks

---

# 20. Guiding Principles

When adding a new feature, ask:

- Does this encourage observation?
- Does it introduce a genuinely new idea?
- Can players discover the rule without being told?
- Does it deepen existing mechanics instead of adding unnecessary complexity?
- Does it keep the interface calm and uncluttered?

If the answer to any of these is "no," reconsider whether the feature belongs in the game.

The goal is not to imitate *The Witness*, but to create an original puzzle game that shares its philosophy: simple rules, deep interactions, and rewarding moments of discovery.