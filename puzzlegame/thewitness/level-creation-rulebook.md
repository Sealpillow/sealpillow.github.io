# Level Creation Rulebook - The Vision

This document is self-contained for adding or changing levels in `src/puzzles/*.json` - mechanic rules, data format, icons, ordering, difficulty targets, collection philosophy, and hazards all live here. For everything else about the project (vision, tech stack, engine architecture, build status), see `README.md`.

---

## 1. Mechanic rules & data reference

Every puzzle needs `id`, `width`, `height`, `start` (a node `[col,row]`), and `exits` (an array of nodes - any one reached is a valid finish). Everything below is optional, added only for the mechanics that level is teaching or combining.

### 1.1 Mechanics grouped by target

Every mechanic targets exactly one of four things, and that target is what actually drives its data shape and its conflict rules, not just a naming convention:

- **Node** - a single grid intersection `[col,row]`. A node may carry at most one of Turn / Straight / Horizontal / Vertical / Corner at a time - they are mutually exclusive, since each fully describes how the path must behave at that point. Dots don't compete with anything and may sit on a node alongside a directional constraint.
- **Edge** - a pair of adjacent nodes `[[c1,r1],[c2,r2]]`. Blocked and Required are mutually exclusive on the same edge - an edge can never be both forbidden and mandatory.
- **Cell** - a grid square, addressed by its top-left node `[col,row]`. Only one cell-based mechanic may occupy a given cell (see Section 7 - never stack two icons on one cell).
- **Global** - a puzzle-wide flag with no position of its own.

| Target | Mechanics |
|---|---|
| Node | Dots, Turn Nodes, Straight Nodes, Horizontal Nodes, Vertical Nodes, Corner Nodes |
| Edge | Blocked Edges, Required Edges |
| Cell | Triangles, Colored Regions, Stars, Eliminators, Polyominoes, Region Size Numbers |
| Global | Symmetry |

### 1.2 Challenge weight, pairing, and decorative risk

This is drawn from actually building and debugging the procedural standard-collection generator (`scripts/level-generator.mjs`), not just theory - the generator's own redundancy audit and failure patterns are direct evidence for what follows.

**A structural fact that explains almost everything below:** the solver's search cost is governed *only* by `blockedEdges` - every other mechanic is a pure post-filter, checked only once a candidate path already reaches an exit. This is why `blockedEdges` is the single strongest challenge lever (it's the only thing that removes topology at all), and why every other mechanic's difficulty comes from *narrowing which of the still-open routes count*, not from making the search itself harder.

**Challenge weight, roughly low to high:**

- **Weakest, easy to make decorative:** Dots, Required Edges. They just mark a node/edge already on the intended solution - if that point is already forced (e.g. it sits in a `blockedEdges` bottleneck every route must pass through anyway), the mark adds nothing. In an unaudited generation run this was ~40% of all placed dots/required-edges; the fix was checking each candidate against the raw wall-cut skeleton before committing to it (does *some* alternate route avoiding this node/edge exist at all?), not just against the fully-decorated puzzle.
- **Light-to-moderate, node-local:** Turn / Straight / Horizontal / Vertical / Corner Nodes. Real but localized - they only constrain the one node they sit on. Watch the subset relationships: every Corner Node is also a Turn Node, and every Horizontal/Vertical Node is also a Straight Node, so pairing e.g. Turn + Corner needs *two distinct* turn-shaped nodes on the path, not just one - a rarer ask than it looks.
- **Moderate, cell-local:** Triangles. Cheap to place (any cell with 1-3 traveled edges qualifies) and genuinely constraining on its own, but easy to reduce to filler - see "free-adjacent-triangle" below.
- **Strong, board-wide:** Colored Regions, Stars, Region Size Numbers. These reason about an entire region's membership or size, not a single point, so they narrow the route far more globally than any node/edge mark can.
- **Strong and deep, but fragile to construct:** Eliminators (a real backtracking ambiguity - the puzzle doesn't say which symbol gets cancelled) and Polyominoes (needs a region that's an *exact* shape/size match for a canonical piece - empirically the rarest thing to occur naturally, and the slowest for a generator to satisfy).
- **Multiplier, not a tier of its own:** Symmetry doubles the effective constraint surface, since every other active mechanic's requirement now has to hold for the mirrored path too. It amplifies whatever it's paired with - for real depth if paired with something simple, or into near-unsatisfiable territory if paired with something already tight (see below).

**Pairs well:**

- Colored Regions, Stars, Eliminators, Polyominoes, and Region Size Numbers all share the same region-partition mechanism (`computeRegions`), so any combination of them composes naturally into one coherent region-reasoning puzzle rather than two unrelated systems bolted together.
- **Eliminators + [triangle, star, or square] - vary which one, don't default to triangle.** An eliminator can cancel any symbol type - a triangle stuck at count 4 (impossible for any real path to satisfy on its own, since that would force all 4 of a cell's corners to degree-2 from just that cell's own edges, which only happens on a closed loop), a star with no partner anywhere in its region, or a plain colored square whose color conflicts with one already sitting in that same region. Cancelling the count-4 triangle is the most *mechanically* unambiguous of the three - but it's also the *only* way a count-4 triangle can ever exist on a board at all, so its mere presence, at any frequency, instantly tells an experienced player "there's an eliminator nearby" before they've reasoned about anything. Rotate across all three targets instead. **Do not make triangle-4 the default or majority case** - treat all three as equally valid, or skip the triangle-4 variant entirely if in doubt.
- **Stars + Stars, multiple colors, one region.** A star's region requirement is checked per color independently - a region can hold a blue star pair AND a white star pair AND an unrelated white/blue plain square at the same time, as long as each color's own count comes out to exactly 2. Packing 2+ differently-colored star pairs into a single region this way is a legitimate, compact way to raise a level's density without adding more distinct mechanic types or a bigger board.
- Horizontal Nodes + Vertical Nodes + Corner Nodes: mutually exclusive subsets of a path's turn/straight classification (horizontal and vertical each cover half of "straight"; corner is "turn" with an orientation label), so a single path naturally offers all three without any of them competing for the same node - this is exactly how lesson B (levels 70-71) combines them into one lesson (Section 9.3/9.2).
- Turn Nodes + Straight Nodes: the coarser version of the same idea - every interior path node is classified as exactly one or the other, never both, so combining them (lesson A, levels 41-42) needs no special handling either.
- Dots or Required Edges + any directional node family: no structural conflict, so this is the safe, reliable way to hit two distinct Node-type mechanics in one level without extra risk.
- Blocked Edges (kept light, 2-4 total entries) + almost anything: the intended backbone role - just enough cut to keep the raw route count sane, leaving the actual reasoning to whatever else is active.

**Few types, many instances - a compact alternative to "many mechanic types":** difficulty and density don't require combining more *distinct* mechanics - a level using just 2 types (e.g. Colored Regions + Stars) with 3-4 instances each on a tight board can be just as complex, and more compact, than spreading the same symbol count across 4-5 different mechanics. Two things make this work: a region can hold multiple star pairs/colors at once (the "Stars + Stars" point above), and a single mechanic's own repeated instances can share a region when its own rule allows it - e.g. two Colored-Regions groups of the *same* color can coexist in one region, since only *different* colors actually need separating. Before combining many mechanic types for difficulty, first ask whether adding more *instances* of one or two already-active mechanics gets there more cleanly.

**Decorative risk - needs deliberate placement, not just added for combo credit:**

- Dots / Required Edges on a node/edge the wall cuts already force every route through (see above - the dominant real-world redundancy source).
- Blocked Edges themselves, overused: a heavy enough wall-maze forces a near-unique path before any other mechanic is even consulted, making everything else decorative by construction - this is exactly what Section 5's branching check exists to catch.
- A "free-adjacent-triangle" - a triangle whose count is already fixed by a neighboring cut. Legitimate as light filler (Section 6 names this pattern deliberately), never as a level's sole source of difficulty.
- Region Size Numbers combined with Eliminators - forbidden per the Section 1.1 caveat below, since an eliminator cannot cancel a region-size number; pairing them just wastes the eliminator's flexibility for nothing.
- Symmetry stacked onto a directional-node pair *and* a second demanding cell mechanic simultaneously - not decorative exactly, but the compounding easily pushes a level from "hard" to "practically unsolvable to author," which read as generation attempts that took many minutes (occasionally longer) before either succeeding on a lucky configuration or failing outright.

### 1.3 Full reference

| Mechanic | Target | Rule | Field & format | Icon |
|---|---|---|---|---|
| Dots | Node | Path must visit every dot node. | `dots: [[col,row], ...]` (node coords) | filled circle on the node |
| Blocked Edges | Edge | Path can never cross these edges. | `blockedEdges: [[[c1,r1],[c2,r2]], ...]` (edge = pair of adjacent nodes) | broken red line on the grid edge |
| Required Edges | Edge | Path must include these edges. | `requiredEdges: [[[c1,r1],[c2,r2]], ...]` | highlighted gold grid line |
| Triangles | Cell | Cell must have exactly N of its 4 edges traveled. | `triangles: [[col,row,count], ...]`, count 1-3 (4 only valid paired with an eliminator - see Section 7) | 1-3 small triangles clustered in the cell |
| Colored Regions | Cell | The path must partition the grid so same-colored cells stay in one connected region; a region can't mix colors (any number of distinct colors is fine, just not mixed within one region). | `cellColors: [[col,row,color], ...]` | small colored square chip |
| Stars | Cell | Each star COLOR present in a region independently needs exactly one other same-colored cell (another star or a plain colored square) in that region - unrelated colors may freely share the same region. Multiple different star colors can coexist in one region, each pairing on its own; an unrelated plain square of yet another color is also fine, provided the separate Colored Regions rule (all plain squares in a region share one color) still holds. Verified against the real engine 2026-08-08 - a star's region is not "exclusive" to that one color. | `stars: [[col,row,color], ...]` | 5-point star, colored |
| Eliminators | Cell | Cancels exactly one other symbol (a triangle, colored square, star, or another eliminator) in its region; the puzzle doesn't say which - solved if *any* valid pairing leaves the rest satisfying their normal rules. | `eliminators: [[col,row], ...]` | orange ring with an X |
| Polyominoes | Cell | A region containing one or more piece icons must be exactly tileable by all of them at once, no gaps or overlaps. Straight pieces keep the shown orientation; slanted pieces may be rotated to any valid 90-degree turn. | `polyominoes: [[col,row,shapeName,rotationSteps,rotatable], ...]` - shapes: `domino`, `tromino-I`, `tromino-L`, `square`, `tetromino-I`/`L`/`T`/`S`; `rotationSteps` 0-3 quarter turns; `rotatable: true` ("slanted") = any rotation is a valid fit; `rotatable: false` ("straight") = must match `rotationSteps` exactly | solid block of flush unit cells with thin divider lines - straight sits axis-aligned at `rotationSteps*90deg`, slanted is tilted ~22deg regardless of `rotationSteps` |
| Turn Nodes | Node | If the path visits that node, it must turn there rather than pass straight through. | `turnNodes: [[col,row], ...]` | gold turn-node marker on the grid node |
| Straight Nodes | Node | If the path visits that node, it must pass straight through it, either horizontally or vertically. | `straightNodes: [[col,row], ...]` | pale cross marker on the grid node |
| Horizontal Nodes | Node | If the path visits that node, it must pass straight left-to-right through it. It may land on the node, but may not continue vertically through it. | `horizontalNodes: [[col,row], ...]` | pale horizontal bar marker on the grid node |
| Vertical Nodes | Node | If the path visits that node, it must pass straight top-to-bottom through it. It may land on the node, but may not continue horizontally through it. | `verticalNodes: [[col,row], ...]` | pale vertical bar marker on the grid node |
| Corner Nodes | Node | If the path visits that node, it must form one specific L-shaped turn orientation there. Supported orientations are `ur`, `ul`, `dr`, and `dl`. | `cornerNodes: [[col,row,orientation], ...]` | blue corner marker on the grid node |
| Region Size Numbers | Cell | A numbered cell contributes that many cells to its region's required total. If multiple numbers share a region, add them together; the region containing them must have exactly that many cells in any shape. Prefer compact values, usually `2-5`, and build larger totals by summing multiple numbers in the same region. | `regionSizes: [[col,row,value], ...]` | ivory number centered in the cell |
| Symmetry | Global | A second path, the 180-degree rotation of the drawn one about grid center, is derived automatically; both must be valid and must never share a node. The drawn path may start from either visible start point and may finish on either a listed exit or that exit's mirrored counterpart. Its nodes/edges also count toward Dots/Required/Triangles/Regions, so it combines with other mechanics instead of staying standalone. | `symmetry: "rotational"` (only value currently supported) | dimmed mirror start/exit markers + a distinctly colored mirror path line |

Current caveat:

- Do not combine `regionSizes` with `eliminators` yet. The validator enforces region-size numbers directly and does not let eliminators cancel them.
- Prefer `2-5` as the standard value range for individual numbers. If a solved region is larger than `5`, represent it with multiple `2-5` values that add to the full region size instead of a single large number.

---

## 2. Mechanic introduction order

Dots -> Blocked Edges -> Required Edges -> Triangles -> Colored Regions -> Stars -> Eliminators -> Polyominoes.

A later continuation adds: Turn Nodes + Straight Nodes together, then Horizontal Nodes + Vertical Nodes + Corner Nodes together, then Region Size Numbers on its own - a two-tier combined lesson for each of those 3 groups. As of the 2026-08-08 interleaved-schedule restructure these 3 lessons are no longer clustered right after level 100 - they're spread across the run as lessons A/B/C at levels 41-42/70-71/99-101, each immediately followed by a stretch of combo levels that folds the newly-taught mechanic(s) into ordinary density-drilling content rather than leaving them isolated (see Section 9.1). Mixed late-game combinations using these mechanics together with earlier ones are exactly what the post-lesson combo tiers now do, all the way to level 200.

Rationale, for when a new mechanic needs to be slotted in:
- The three simple point/edge rules (Dots, Blocked Edges, Required Edges) come first - they constrain the path directly, with no indirection.
- Triangles (reasoning about one cell), then Colored Regions (reasoning about the whole board), then Stars (a stricter regions variant), then Eliminators and Polyominoes last, since both depend on the player already understanding what a region is.

**Symmetry is intentionally absent from this order** - see Section 8 for the full reasoning (built, tested, then deliberately removed from the generator). If it's ever added to a real order again, the original design intent was for it to sit right after Required Edges, before Triangles, as an early "paradigm-shift breather" (mirroring how the actual Witness introduces it early rather than saving it as a capstone) - not as a late addition.

---

## 3. Design philosophy and authoring priorities

This section is the core reasoning standard for the project. It applies whether a level is hand-authored, generator-produced, or later revised by cleanup passes.

### 3.1 What a level is trying to do

A good level is not merely a hidden route. It is a space of plausible routes that gets narrowed by logic. The player should feel that the board initially allows several believable ideas, and that the symbols gradually force those ideas to collapse until only the valid answer remains.

That leads to three non-negotiable principles:

1. **The player must learn by interacting, not by being told.** A level should expose a rule clearly enough that the player can infer it from success and failure.
2. **The solution must come from deduction, not tracing.** If the board shape, walls, dots, and required edges already draw most of the route, the symbols are no longer carrying the puzzle.
3. **Every active mechanic must remove real alternatives.** A symbol that is true of the intended answer but does not rule anything out is decorative and should not be there.

### 3.2 Priority order when authoring

Before worrying about exact numeric difficulty targets, use this priority order:

1. **Clarity of the lesson.** The level's main idea should be legible through play.
2. **Real logical pressure.** Every active mechanic must constrain candidate paths, not merely ornament the board.
3. **Difficulty curve integrity.** A later level that feels easier than its neighbors should be moved earlier or replaced.
4. **Early recombination.** New mechanics should start mixing with older ones quickly after introduction.
5. **Structural variety.** Do not repeat the same wall skeleton, board cut, or visual symbol pattern across a whole stretch.
6. **Board size restraint.** Larger grids are justified only when they create a cleaner or deeper idea, not just because the collection is getting later.

### 3.3 How to think about a single level

The thought process for one level should be:

1. Decide the level's role: introduction, reinforcement, bridge, combination test, or spike.
2. Decide which mechanic is the star and which mechanics are supporting it.
3. Create enough raw branching that the middle of the route still has uncertainty.
4. Place each constraint to eliminate a specific family of wrong answers, not simply to sit on the intended answer.
5. Compare the board to its neighbors and ask whether it belongs at this exact point in the collection.
6. Only after the logic reads correctly, verify it with solve-count, redundancy, and branching checks.

### 3.4 How collections should scale

Collections should not be built as long isolated mechanic blocks followed by a sudden late difficulty spike. The preferred pacing is:

1. introduce a mechanic cleanly,
2. confirm the player has seen its core behavior,
3. start recombining it with older mechanics quickly,
4. increase difficulty by interaction density rather than by explanation length.

In practice this means a new mechanic usually gets only `1-2` pure introduction levels before it starts appearing alongside previously-taught rules.

### 3.5 The standard collection's current pacing

There is only one collection: `src/puzzles/levels.json`, the only one the live game loads (generated via `scripts/level-generator.mjs`). Its pacing favors longer teaching stretches, gentler onboarding, and more patient early reinforcement over a steep, aggressive difficulty ramp.

**Current scope note (superseded 2026-08-08 by the interleaved-schedule restructure - kept here as a historical marker, not current behavior):** the flexible combo phase originally restricted itself to 8 mechanics only for its entire `level_014`-`100` run, with the directional-node family and Region Size Numbers held back for a single separate lesson block afterward, never mixed into the combo levels themselves. That has since been fully resolved: those 6 mechanics are now unlocked in 3 small steps INSIDE the same 1-200 range (lessons A/B/C, each immediately followed by combo levels that actually draw from the newly-unlocked mechanics) - see Section 9.1 for the current, accurate phase-by-phase structure. Symmetry remains the one mechanic with no lesson anywhere in the live collection - not because it's still pending, but because it was deliberately built, tested, and then removed (Section 8).

### 3.6 Flexible, density-driven design (an alternative to the tiered floor system)

The campaign table further down organizes a collection around a *tiered floor* system: a fixed minimum mechanic-type count per band, tightening toward a specific solution-count target as the collection progresses. The current standard collection instead uses a *flexible, density-driven* design, developed and debugged in `scripts/level-generator.mjs`. Both are legitimate; pick based on what the level (or collection) is trying to do:

- **No fixed mechanic-type floor.** Dots/Blocked Edges/Required Edges are each independently *optional* per level, not mandatory. The cell-based mechanics (Triangles, Colored Regions, Stars, Eliminators, Polyominoes) are the deductive backbone and are the ones worth repeating instead - packing several instances of just 1-2 of them into a level is a legitimate way to raise difficulty without needing more distinct types.
- **No per-level solution-count target.** A level only needs to be genuinely solvable (the intended path is a real, verifiable solution) and pass a redundancy audit (strip each active mechanic and re-count; if the count doesn't change, that mechanic is decorative and shouldn't be there) - there's no narrow count window to hit. This trades some of the tiered system's precise difficulty-curve control for much faster, more reliable authoring/generation: chasing an exact count window was consistently the dominant source of wasted attempts when this collection was built (minutes-long stalls, occasional outright failures) - removing it fixed that directly. If a specific level genuinely needs a tight, verified solution count (e.g. a grand-finale level), apply that explicit count-checking to that level specifically rather than the whole collection.
- **Density and mechanic-type count are independent difficulty levers, and density is often the cheaper/cleaner one to push.** Growing a level's difficulty doesn't require adding more distinct mechanic types - more instances of the 1-2 already-active mechanics usually gets there with a more compact board and less structural risk. Reserve adding a 3rd+ distinct mechanic type for when the level's specific idea actually needs it, not as the default difficulty dial.
- **When mixing 3+ distinct cell mechanics in one level, watch region capacity.** Polyominoes claims an entire region outright (every cell, exact shape match) - pairing it with any region-color-sensitive mechanic (Colored Regions/Stars/Eliminators, which each only partially claim cells from the same limited region pool) means whichever one gets placed second can no longer find a wholly-free region to use. In practice, keep Polyominoes paired with Triangles only, and treat 3 simultaneous distinct cell-mechanic types as a practical ceiling before generation/authoring reliability drops off sharply (empirically, 4-5 simultaneous types meant demanding nearly every mechanic compete for the same handful of regions, causing multi-minute stalls even after every other fix here).
- **Board size and `blockedEdges` cut count both stay conservative even in the hardest bands.** A single Full Cut (blocking all-but-one of the crossing edges between two adjacent columns/rows, forcing every path through the remaining gap) already keeps the raw solver-search space tractable; boards past roughly 5x5/5x6/6x5 make even a cheap redundancy-check baseline expensive per attempt. Push difficulty via density (more instances) and cut *chance* (how often a level gets a cut at all, not how many entries per cut), not via ever-larger boards.

---

## 4. Campaign structure and difficulty targets

The original 134-level set is organized into tiers. Use it as the reference ladder for what kinds of ideas belong in each band and how tightly they should solve. Newer collections do not have to copy its exact block lengths, but they should preserve the same underlying progression from simple recognition to dense recombination.

**This table describes the tiered floor system** - a fixed minimum mechanic-type count per band, tightening toward a specific solution-count target as the collection progresses. The live standard collection currently uses a *flexible, density-driven* alternative instead: no fixed mechanic-type floor, no per-level solution-count target, difficulty raised through symbol density (more instances of fewer mechanic types) rather than combining more distinct mechanics or chasing a tight count window (Section 3.6 has the full reasoning). Use whichever system fits what's being built; this table remains the reference for the tiered approach specifically.

| Levels | Content | Solution-count target |
|---|---|---|
| 1-4 | Basic path only (small open boards before symbol introduction) | loose, no target |
| 5-58 | Each of the 9 original core mechanics introduced one at a time, a full 6-level block each, combined with only what's already been taught | loose (teaching tier - mirrors the real game's own precedent) |
| - | **All 9 original core mechanics fully introduced by level 58** | |
| 59-64 | Symmetry reintroduced, combined with 1-2 other mechanics | ~10-20, gently tightening |
| 65-80 | Fresh 2-3 mechanic combinations spanning all 9 original core mechanics, varied grid shapes/corners | <=10, tightening toward <=6 |
| 81-96 | 4-mechanic combinations on bigger boards (4x4+) | <=6, tightening toward <=3 |
| 97-112 | Heaviest main-campaign combinations | <=3 |
| 113 | Grand finale | 1-2 |
| 114-134 | Bonus hard tier - harder than the main finale, every board genuinely distinct (grid shape, corners, walls) | 1, verified against real branching (see below), not a dead maze |

When using this table for newer collections, treat it as a pattern rather than a literal script:

- Early game should teach recognition.
- Mid game should teach interaction.
- Late game should teach density, conflict resolution, and precision.
- Final bands should feel hard because many plausible routes survive deep into the solve, not because the maze itself already dictates the line.

---

## 5. Level generation and verification process

Never hand-derive a puzzle's difficulty and never trust "it has at least one solution" as a meaningful quality bar. Every serious level, whether manual or generated, should follow this process.

### 5.1 What the generator is supposed to do

The generator is not supposed to "make a valid puzzle somehow." Its job is to produce levels that follow the same reasoning standards as a careful human author. That means a generator should be understood as a structured authoring system with specific responsibilities:

1. **Assign a clear board role.** Each level should be generated as an introduction, reinforcement, bridge, combination test, or spike, not as a generic random board.
2. **Control mechanic pacing.** New mechanics should appear briefly in pure form, then start recombining quickly with older ones.
3. **Create real branching before filtering.** The raw board should still contain plausible alternatives before symbols collapse them.
4. **Avoid over-guiding the route.** The generator should not rely on long wall sketches, stacked dots, or stacked required edges to draw the answer directly.
5. **Use `blockedEdges` as a support tool, not the default skeleton.** A light cut is preferred; zero-wall boards should remain common.
6. **Preserve mechanic dignity.** Directional nodes should do their own work, support mechanics should create real tradeoffs, and cell-based mechanics should not overlap.
7. **Maintain collection shape.** Difficulty should climb, soft late outliers should be replaced or moved, and board structures should stay varied across a band.
8. **Submit every board to verification.** Generation is only the proposal stage; solve-count, redundancy, branching, and compatibility checks decide whether the board is acceptable.

In short: the generator should encode design intent, not merely output legal data.

### 5.2 Build the logical role first

Before placing symbols, define the board's job:

1. What is being taught or tested?
2. Which mechanic is primary?
3. Which older mechanics are supporting it?
4. What kind of uncertainty should survive into the middle of the solve?

This is the conceptual brief for the level. A generator should encode this as a recipe; a human author should hold it as intent. In both cases, the level is bad if the final board no longer expresses that brief.

### 5.3 Build a board that still has genuine choices

After choosing the role, draft a board that still allows multiple believable routes. The player should need the symbols to determine the route through the board, not merely to confirm a route that the topology already made obvious.

This is the most common failure mode to guard against:

- too many blocked edges create a maze that solves itself,
- too many dots/required edges draw the route directly,
- start/end placement frames too much of the middle,
- directional nodes are overused until the board becomes tracing instead of reasoning.

### 5.4 Add constraints to kill alternatives

Each symbol should be placed with a specific purpose: it should invalidate a meaningful class of wrong answers. "It is satisfied by the intended path" is not enough. The right question is not "does this symbol fit the answer?" but "which candidate routes stop working because this symbol exists?"

This applies especially to support mechanics. A support mechanic should sharpen the main idea, create a conflict, or force a tradeoff. It should not merely sit on the board as background texture.

### 5.5 Verify the board with the real solver

For every new or edited level:

1. **Solve-count** - brute-force enumerate valid paths against the real `Grid`/`Validator` engine code, up to a safety cap.
2. **Redundancy audit** - strip each active mechanic and re-count. If the count does not change, that mechanic is decorative.
3. **Branching check** - strip everything except `blockedEdges` and re-count. The raw maze count must remain meaningfully larger than the final count.
4. **Mechanic compatibility check** - confirm that each mechanic matters among the actual surviving candidates, not merely against the raw unfiltered maze.
5. **Tier fit check** - compare the resulting solve count, structure, and feel against the surrounding band of the collection.
6. **Region-balance check** - if the board's intended solution splits it into 2+ regions of meaningful size (roughly 4+ cells - a board can split into more than 2 regions even with zero `blockedEdges`, if the winding solution path touches the board's boundary at points other than just start and exit, so don't assume an open board only ever has 2), compute each qualifying region's occupied-cell density (symbol cells / region size) and confirm no region is wildly denser than another (roughly, no more than ~3x another qualifying region's density, plus a small allowance for tiny counts). A board that passes solve-count/redundancy/branching can still read as "half the board doesn't matter" if this check is skipped.

Raise the solver cap for larger boards when needed. A puzzle that hits the cap in both its full and stripped forms has produced an inconclusive measurement, not a trustworthy pass.

### 5.6 Iterate until the board matches its intent

If the level teaches the wrong thing, feels easier than its neighbors, or relies on decorative structure, revise it. A valid puzzle is not automatically a good puzzle.

The level is only acceptable when all of these are simultaneously true:

1. the intended lesson is legible,
2. the active mechanics all matter,
3. the raw board still has branching,
4. the difficulty matches its slot,
5. the board feels distinct from nearby levels.

After authoring a batch (a tier, or any meaningful chunk), re-run the full solve-count regression across every level authored *so far*, not just the new ones - this catches cross-level mistakes early. Once a full session's changes are done, regression-solve every touched collection and drive it through the real UI end-to-end (sequential unlock gating from level 1, every level solved via simulated input, no mechanic-name leak anywhere in the page text, zero console errors) before considering the work finished.

Verification reminder: if the session touched input or HUD behavior, also sanity-check the mobile thumb-scope flow: appears on path start, can be dismissed/reopened cleanly, softly follows the path while dragging, does not scroll the page during an active scope swipe, preserves the chosen follow-speed setting, rewinds cleanly when the player taps an earlier visited node, respects left/right-hand placement from the settings cog, and keeps the level-navigation grid stable on narrow screens as a consistent `2 x 5` mobile block (rows x columns) without accidental tap-triggered browser zoom.

## 6. Constraint design principles

**`blockedEdges` as a real topological cut, not decoration.** Between two adjacent grid columns (or rows) there are `height+1` (or `width+1`) crossing edges - block all but one ("Full Cut") and every simple path is *provably* forced through that single gap, for the cost of a few blocked-edge entries. Cells bounded by the newly-blocked edges get 1-2 edges fixed at zero for free - a cheap place to add a tight triangle count (never use 4 alone, see Section 7). A required edge placed at or right next to the gap is satisfied by construction; region-colored cells straddling the gap are separated for free too. This is a tool, not the default identity of a board.

**Prefer a light cut over a heavy one.** In normal authored levels, keep `blockedEdges` to about `2-4` total whenever possible, not a long wall sketch. A single light cut leaves real branching for the other mechanics to filter; a heavy maze that already forces a near-unique path on its own makes every other mechanic decorative, which the branching check (Section 5, step 4) will catch, but it's cheaper to just not build it that way. If density from other mechanics can't reach the target with a light cut, add more of those first before thickening the maze.

**Treat `blockedEdges` like one mechanic among many, not the assumed backbone.** A healthy collection should contain plenty of boards with zero blocked edges at all. If nearly every level uses them, they stop reading like a teachable rule and start reading like the default board template. Use them when a specific topological cut improves the puzzle; otherwise let symbols, regions, and node constraints carry the reasoning.

**Do not duplicate directional node restrictions with `blockedEdges`.** A `horizontalNode` already forbids the two vertical exits at that node; a `verticalNode` already forbids the two horizontal exits; a `cornerNode` already forbids its two non-matching arms. Blocking those already-forbidden edges again is redundant information, not extra difficulty. Keep the node as the logic carrier and spend `blockedEdges` elsewhere.

**Constraint density scales with grid size, but not by just adding more walls.** `blockedEdges` is the only mechanic that removes topology; everything else just constrains which of the still-open edges get used. A bigger board offers more equivalent detours, but the answer is usually more symbols or better symbol interplay, not pushing `blockedEdges` past the preferred `2-4` range. A board with no `blockedEdges` at all needs proportionally more of the other constraint types to reach the same tightness.

**Do not treat "bigger" as "later."** A 4x4 with strong interlocking logic is usually better than a 5x5 that only looks harder. Use a larger board only when the extra space creates a puzzle idea that smaller boards cannot express cleanly.

**Avoid too many point-style constraints.** Stacking many dots/required edges effectively draws a connect-the-dots picture, revealing the solution path visually rather than requiring real deduction. Prefer `blockedEdges` cuts and region/color reasoning for tightening; keep dots/required-edge counts to roughly 1-2 per level rather than stacking them for artificial difficulty.

**Let the start/end frame the route, but keep most of the route deductive.** It is fine if the opening move or finishing approach feels somewhat guided. The majority of the board's route should still preserve genuine uncertainty so the player has to use the symbols to decide between alternatives. A good puzzle may frame the beginning or ending; it should not pre-script the middle.

**Difficulty should come from interacting constraints, not from one dominant constraint family.** The strongest boards usually have several mechanics pulling the route in different directions at once: one mechanic may want a region to stay intact while another wants an edge count and a third wants a specific node behavior. That tension is where difficulty lives. If one mechanic family alone already determines the answer, the others become commentary.

**Board size should track expected symbol density, not just band/tier index.** Each cell-based mechanic instance needs roughly 1-4 cells (Triangles ~1, Stars/Colored-Regions/Eliminators ~2, Polyominoes 2-4). If a level is only placing a handful of instances, size the board so those cells cover a meaningful fraction of it - a 4x4/4x5 board with 1-3 total symbol cells reads as "mostly empty," while the same content on a 3x3/3x4 board reads as intentional. As a rough floor, aim for at least ~15-20% of a board's cells to carry some symbol; below that, either shrink the board or add more instances. This applies whether hand-authoring or generating - a board sized "because it's a later level" rather than "because this many symbols need room" is the same mistake either way.

**Spread symbols across every region a level actually creates, not just one.** A board with a `blockedEdges` cut, or even just a sufficiently winding solution path that touches the boundary at points beyond its own start and exit (a path can pinch off extra regions on its own, with zero cuts), can split into two or more regions of very different sizes. Nothing about how symbols get placed automatically distributes them evenly across those regions - left unchecked, everything can cluster into one (possibly small) region by chance while a much larger region sits almost entirely empty, which reads as "half the board doesn't matter." When authoring or generating a level with 2+ regions of meaningful size (roughly 4+ cells), deliberately place at least some symbols in each one, and check the resulting density (occupied cells / region size) isn't wildly skewed between them - as a concrete bar, no region's density should exceed roughly 3x another qualifying region's density plus a small slack for tiny counts. If it does, that's a sign to re-place the symbols (or re-draw the path) rather than accept the board as-is.

**Keep an eliminator's cancelled symbol - and every other symbol - off the cells directly touching it.** A cell sharing an edge with an eliminator (Manhattan distance 1) reads as "these two must be the pair" purely from proximity, letting a player skip the region-wide reasoning the mechanic is meant to demand - and this holds even when the adjacent symbol ISN'T the eliminator's actual target; any nearby icon is enough to bait a wrong-but-plausible guess. This is distinct from the hard "never stack two icons on one cell" rule below (Section 7) - adjacency, not just overlap, is enough to give the pairing away. When placing an eliminator (by hand or generating), check every other already-placed symbol in the level, not just the ones in its own region - prefer a cell with no symbol of any kind touching any of its 4 edges, and treat "had to fall back to an adjacent placement" as a sign to re-place rather than accept it.

**Named teaching devices worth reusing:**
- *Free-adjacent-triangle* - placing a triangle on a cell where the count is already fixed by a nearby cut, so its correctness is "free" rather than needing its own independent reasoning - good filler, not a substitute for a real constraint elsewhere in the same level.
- *Eliminator target rotation* - an eliminator's cancelled symbol should rotate across all three otherwise-unsatisfiable options (count-4 triangle, lone unmatched star, color-conflicting square) rather than defaulting to the triangle every time. Mechanically, cancelling a count-4 triangle is the most unambiguous case ("technically non-redundant" isn't in question), but it is also the *only* way that specific symbol can ever appear, so relying on it as the default teaching example trains players to spot an unrelated tell instead of reasoning about the eliminator itself. Use it as one of three, not the default.
- *Rotation-required Polyomino placement* - a multi-piece Polyomino region where at least one piece only fits when rotated proves the rotation search (and the "slanted" rendering) actually matters, rather than every piece happening to fit in its canonical orientation.
- *Shared-region multi-color stars* - two or more differently-colored Star pairs placed in the SAME region (each pairs independently) reads as denser/more deductive than the same pairs spread across separate regions, and is a good compact-board device once the board has enough regions with enough free cells to host them without collision.

---

## 7. Hazards and hard rules

- **Triangle count of 4 is impossible alone.** A cell's 4 edges form a cycle over 4 nodes; using all 4 forces a revisit, which the engine forbids outright. Max valid standalone count is 3. A count of 4 is only usable paired with an eliminator that cancels it.
- **Symmetry unsolvable-by-construction cases.** An exit that is the 180-degree rotation of the start collides with its own reflection and can never be solved - check this whenever placing start/exit on a Symmetry level. On even-sized grids, the exact grid-center node is its own reflection and must be avoided by the path.
- **Never stack two mechanic icons on the same cell.** Two symbols sharing a cell (e.g. an eliminator directly on its target triangle) is visually ambiguous and should be treated as outright invalid, not just undesirable. Place the second icon on an adjacent free cell in the same region instead.
- **Directional nodes should carry their own restriction.** Do not "help" a `horizontalNode`, `verticalNode`, or oriented `cornerNode` by also blocking the exact exits that the symbol itself already disallows. That makes the wall decorative and weakens the deduction space around the node.
- **Polyomino + `blockedEdges` collisions.** A cut edge frequently bisects the exact fence a polyomino's region needs to stay intact, making the level unsolvable. Fix by repositioning the cut away from the piece's cells, or dropping the cut for that level and relying on other mechanics for tightness.
- **`satisfiesRegions` (and every region-based mechanic) only treats the drawn path's own edges as flood-fill walls - `blockedEdges` are not walls.** A blocked edge stops the player from drawing through it, but does not by itself separate two cells into different regions; the path itself still has to be routed to do that.
- **An open board (no `blockedEdges` at all) is NOT guaranteed to split into exactly 2 regions.** A single simple path only splits a board into exactly 2 regions when it touches the board's boundary *exactly* at its two endpoints (start and exit). If the path touches or hugs the boundary at additional points along its route - which happens often on longer or more winding paths - it can pinch off additional, often much smaller, regions entirely on its own, with zero cuts. Verified empirically 2026-08-08 (a 3-region split was found on a board with no `blockedEdges` field at all). Don't assume "no cut = exactly 2 regions" when reasoning about how many region-scoped symbols (Stars, Colored Regions, Polyominoes) a board can support - check the actual regions the intended solution produces, not the cut count.

---

## 8. Known scope limits (deliberate, not bugs)

- **Default board size should stay at 4x4 or smaller unless there is a strong reason not to.** Larger grids make solve counts and redundancy checks much more expensive, and they often create fake difficulty through size alone. Treat 5x5 and above as exceptional, not standard. Do not move to 6x6 by default without first proving the solver budget and the puzzle quality both hold up.
- **Polyominoes are positive-piece tiling only.** The real Witness also has subtractive/negative pieces, but their exact interaction rule couldn't be reconstructed with confidence from available reference material, and a guessed-wrong rule would be worse than not having one. Don't add a "negative" piece without first nailing down its exact rule from a reliable source.
- **Symmetry (Global) is deliberately unused anywhere in the 300-level collection - not a bug, not an oversight, a considered decision after actually building and testing it (2026-08-08).** Two independent reasons it was tried and then rejected rather than shipped:
  - **It's disproportionately expensive to combine with anything else.** Symmetry removes `blockedEdges` as a tool entirely (a wall cut isn't automatically mirrored, so the generator can't verify a symmetric cut is fair) and the path's own mirror image quietly consumes board space as it grows (the path and its mirror can never share a node). Measured directly: a symmetry-only intro lesson generated in ~9ms; the same lesson with just ONE triangle added took ~470ms - a 50x cost increase from a single extra mechanic, the same kind of resource-contention problem that already forced `distinctCell` to cap at 3 everywhere else in this file, just worse.
  - **It doesn't match how the source material actually uses it.** In the real Witness, Global Symmetry is concentrated almost entirely in one contained area - a self-sufficient run of puzzles, not a mechanic that recurs sparingly mixed into every other biome's own mechanics. An interleaved/probabilistic design (symmetry appearing on ~15% of levels across 150+ otherwise-unrelated combo levels) doesn't reproduce that experience - it reads as a random surprise each time rather than a deliberate change of pace.
  - **The generator's own ability to produce a symmetric level has since been physically removed** (not just left dormant behind an empty tier list) - `generateIntroLevel`'s `mechanic === 'symmetry'` branch, `buildIntroContext`'s symmetry-aware start/exit logic, `'symmetry'` in `INTRO_ORDER`/`INTRO_TIERS`, and the now-unused `reflectNode` helper are all gone, specifically so a future session can't accidentally re-enable it by flipping a tier list back on without first reading this note. The ENGINE'S support for a `symmetry` field (`Validator.js`/`Regions.js`/`Symmetry.js`/`Solver.js`/`Renderer.js`) was deliberately left intact, since it's small, already-correct, harmless while nothing sets the field, and would save real rework if the concentrated-cluster design below is ever attempted.
  - If revisited, a small, CONCENTRATED cluster (its own short, low-density block, not spread thin across the collection) would be the better-motivated design - closer to the source material and cheaper to generate reliably, since it wouldn't need to fight for space against other mechanics' own density.

---

## 9. The generator's exact algorithm (for reproducing this style)

Sections 1-8 describe *what* a good level looks like and *why*. This section describes exactly *how* the current 300-level standard collection is actually produced, as one coherent reference - concrete enough to rebuild an equivalent generator from scratch, safely extend this one, or hand off to someone else who needs to reproduce the same style. If you only need the design philosophy, skip this section.

### 9.1 Overview, determinism, and how to regenerate safely

300 levels total. `generateAll()` in `scripts/level-generator.mjs` produces 293 of them in one deterministic pass (the other 7 - the lesson-slot levels described below - are copy-forwarded from previously-live content rather than kept from a fresh run's own output). As of the 2026-08-08 interleaved-schedule restructure, the 6 mechanics that used to be held back for one single node-lesson block at 101+ are instead unlocked in 3 small steps spread across levels 1-200, so no stretch of the collection goes more than ~27 levels without something new becoming eligible - the earlier design left an 87-level plateau (14-100) drilling a fixed 8-mechanic toolset before ANY new mechanic appeared, which read as a long flat stretch once the collection was played straight through. Later the same day, a multi-solution phase (201-300) was added past the original 200-level scope, introducing a second, independent axis of variety: a NEW win condition (see 9.5) rather than a new mechanic - built at 75 levels (201-275) then extended once by another 25 (276-300), the same append-only pattern `EXPANDED_BANDS` used for its own two extensions. The phases now run strictly in this order:
- **Levels 1-13**: the intro phase, one pure lesson per mechanic tier, over the original 8-mechanic set - unchanged in design from before the restructure (`generateIntroLevel`/`buildIntroRecipes`, 9.2).
- **Levels 14-40 (combo tier 0)**: `FLEXIBLE_BANDS`' first 3 bands (`flex1-3`), the original 8 mechanics only - nothing new unlocked yet (9.3).
- **Levels 41-42 (lesson A)**: `turnNodes`+`straightNodes` combined, 2 tiers (9.2).
- **Levels 43-69 (combo tier 1)**: `flex4-6`, now also drawing from `turnNodes`/`straightNodes` (9.3).
- **Levels 70-71 (lesson B)**: `horizontalNodes`+`verticalNodes`+`cornerNodes` combined, 2 tiers (9.2).
- **Levels 72-98 (combo tier 2)**: `flex7-9`, now drawing from all 5 directional-node mechanics (9.3).
- **Levels 99-101 (lesson C)**: `regionSizes` tier 0 (99), a hand-authored `requiredEdges`+`regionSizes` INSERTION (100), `regionSizes` tier 1 (101) - the same 3-level block this lesson has always been, just relocated (9.2).
- **Levels 102-200 (combo tier 3)**: `flex10` plus all of `EXPANDED_BANDS` (10 bands), all 14 non-symmetry mechanics eligible - the collection's original full-density finale, unchanged in shape from before the restructure (9.3).
- **Levels 201-300 (multi-solution phase)**: `MULTI_SOLUTION_BANDS` (11 bands), the same 14-mechanic pool as tier 3 but tuned for openness rather than narrowness, and a `requiredSolutions` field (1-3) that changes what "solved" means for these levels - see 9.5.

Every combo tier reuses the *exact same* `FLEXIBLE_BANDS`/`EXPANDED_BANDS` band definitions and per-band settings that existed before this restructure (board size, `cutChance`, `distinctCell`, `instanceRange`, etc. are all untouched) - a tier only ever widens WHICH mechanics its recipes are allowed to draw from (`cellPool`/`directionalPool`, see `buildOneComboRecipe` in 9.3), never the underlying difficulty tuning. This is deliberate: every one of those settings was already validated safe (in some cases through multiple rounds of stall-driven tuning, see 9.3's history), so reusing them outright avoids re-deriving that work while still achieving the real goal of the restructure - new mechanics actually appearing in combo levels shortly after their lesson, not just in an isolated block. `flex4-10` gained one new field (`dnChance`, ramping 0.15->0.4) purely to enable this - the field is absent on `flex1-3` on purpose, since a tier with an empty `directionalPool` must never evaluate `rng() < band.dnChance` at all (short-circuited, not skipped-and-discarded - see the determinism note below for why this distinction matters).

Lesson A/B/C's own content (the 7 levels this produces) is generated inline exactly as before - via `generateIntroLevel`/`generateNodeComboLevel`, the same machinery described in 9.2 - but a full regeneration then OVERWRITES those 7 slots with the content that was already live at the collection's old 101-107 ids, copied forward verbatim (id renumbered, everything else untouched) rather than keeping the freshly-generated output. This was a deliberate choice, not a bug workaround: the lessons' own design never needed to change, so reusing already-tested content instead of re-validating freshly-generated content in the same slot avoids real (if small) risk for zero benefit. This copy-forward is *why* the collection's lesson content and the level-107-pin below both carry forward automatically with no extra step - copying `level_107`'s old content into new `level_101` already includes whatever was pinned there.

All combo tiers and lessons share the same placement primitives (9.4). Each tier/lesson is deliberately its own pass over the shared RNG stream, run in this fixed order - see the determinism discussion below for why order matters. `scripts/generate-levels.mjs` is the Node CLI wrapper; the generator module itself is deliberately browser-safe (no `fs`/`process`) so the exact same code can also run inside a live browser page - useful in a sandbox with no Node available, by driving a temporary HTML page that imports the module directly (served via `python -m http.server`, driven with Playwright using `page.goto(url, wait_until='commit')` rather than the default `'load'`, since a long synchronous generation run blocks the load event).

**A surprising consequence of this restructure, worth remembering:** levels 1-40 are NOT byte-identical to their pre-restructure content, even though the intro phase's own code never changed. The pre-restructure `generateAll()` happened to call `buildFlexibleRecipes()` (building all 87 old flexible-phase recipes in one eager batch) BEFORE generating even level 1 - so intro levels were never actually "first in the stream," they were always preceded by that batch's `rng()` consumption. Removing that eager call (replaced by every tier's lazy `buildOneComboRecipe` calls) shifted the stream position at which level 1 itself starts generating, changing its specific output despite zero changes to `generateIntroLevel`/`buildIntroRecipes`. The lesson: **an "unrelated" phase's own internal implementation choices (eager vs. lazy recipe-building) can be silently load-bearing for a completely different, earlier phase's output**, not just for whatever comes after it - always verify empirically (regenerate and diff) rather than assuming a phase is unaffected just because its own code didn't change.

Generation is driven by a seeded PRNG (`mulberry32(20260805)`, installed via `setRng()` before calling `generateAll`), consumed sequentially across the *entire* run - every `rng()` call anywhere shifts what every later call anywhere else returns. This determinism is load-bearing, not incidental, and shapes how any regeneration must be done:

- A full regeneration with the same seed always reproduces the exact same 293 fresh generator-produced levels, byte-for-byte (the 7 lesson-slot levels - 41/42/70/71/99/100/101 - are copy-forwarded from the previously-live file rather than kept from this run's own output, per the note above).
- Any code change that alters control flow - even one that never itself calls `rng()`, like a new function parameter that changes which branch executes - shifts the downstream RNG stream from that point forward, changing every level generated after it. Changing a numeric range's *bounds* alone (e.g. `instanceRange: [2,4]` to `[1,3]`) does NOT shift the stream by itself, since the same number of `randInt()` calls happen regardless of the bounds passed in - only the values drawn differ.
- **Build ONE recipe immediately before generating its ONE level - never a whole tier's or band's recipes in one batch, even when that batch is correctly positioned after the earlier tiers.** Every combo tier's loop calls `buildOneComboRecipe(band, cellPool, directionalPool)` for exactly one recipe, then immediately generates that one level, then moves to the next - never a whole band's (or tier's) recipes in one upfront batch. This is what lets `EXPANDED_BANDS` in particular keep being extended (it already has been, twice) without reshuffling levels already locked in: building a whole batch first would consume `rng()` for every future band's recipe before the FIRST level in that tier even starts generating, so appending bands later - even at the very end - shifts where that first level's generation begins. `buildIntroRecipes` remains safe to batch-build up front since it's provably `rng()`-free (fixed data, no random rolls); `buildOneComboRecipe`-based tiers are NOT, and are never batched.
- A **partial/targeted regeneration** (just specific level numbers, leaving the rest untouched) must still reconstruct every EARLIER band's/tier's recipes in the exact same order with the SAME seed as a full run, so the target level's own recipe (mechanic composition) comes out identical - only that level's own path/placement attempt should be freshly rolled. A different seed, or skipping/reordering earlier bands "since they're not the target," silently changes the recipe too, not only the puzzle instance.
- Levels 7, 9, and 33 are hand-authored exceptions - manual edits to the live `levels.json` with no generator-side encoding at all, so ANY full regeneration silently reverts them. Level 13 IS hardcoded (`SLANTED_POLYOMINO_INTRO_LEVEL`, see 9.2) and survives regeneration automatically. Level 100 is the hand-inserted exception described above (an insertion inside lesson C, reused verbatim from the old file's `level_106` rather than regenerated - see the copy-forward note above). **Level 101 is pinned to its pre-`splitRegionSize`-fix content** (5 region-size markers of value 2 on a 3x4 board, the same content historically pinned at the old `level_107`) - carried forward automatically as part of the same lesson-C copy-forward, not a separate step. Treat every regeneration - full or partial - as incomplete until 7/9/33 are re-applied by hand and the 7 lesson-slot levels (41/42/70/71/99/100/101) are copy-forwarded from the previously-live file, and 13 is confirmed byte-identical; a plain file overwrite is never safe on its own.
- Before installing a fresh regeneration: back up the current live file, run structural checks on the new output (no unexpected top-level keys, `blockedEdges` never exceeding 4 entries, no level with zero active mechanics, triangle counts only ever 1-4 with 4 only ever paired with an eliminator, zero eliminator-adjacency violations, zero regionSizes+eliminators conflicts), confirm each newly-unlocked mechanic's first COMBO appearance (excluding the lesson levels themselves) lands at or after its tier's start (turnNodes/straightNodes >= 43, horizontalNodes/verticalNodes/cornerNodes >= 72, regionSizes >= 102), confirm every level 201+ has a `requiredSolutions` in 1-3 with `solutionPaths.length >= requiredSolutions`, and load the installed result in the actual game to confirm zero console/page errors - only then is the regeneration done.
- Every generator-produced level also carries a `solutionPaths` field - an array of distinct solving paths, computed ONCE at generation time via `collectStoredSolutions(puzzle, path, cap)`, so the debug "Show Sol." control (`main.js`) never runs any search of its own at view time. Entry 0 is always the exact path the generator itself already proved solvable via `validateSolution` during that attempt (guaranteed correct regardless of what the search below finds); the rest, if present, come from a budget-capped `findSolutionPaths` call (`src/engine/Solver.js`, 400,000-expansion cap) run once during generation and deduped against entry 0. `cap` defaults to 3 (`MAX_STORED_SOLUTIONS`) for tiers 0-3; the multi-solution phase (9.5) passes a higher cap (`MAX_MULTI_SOLUTION_SEARCH`, 10) since it needs a more honest signal of how many distinct solutions actually exist, not just enough to fill a debug cycling button. This design went through two iterations before the multi-solution phase existed: the debug control originally re-solved each puzzle from scratch on every first view (fine on the small 1-50 boards, but on the larger/denser 101-200 boards a DFS could burn its entire budget without finding a solution that was known to exist, surfacing as "no path is found" - fixed by storing just the one guaranteed path); that still left a one-time, noticeable delay on a level's first view (the extra-solution search ran synchronously before anything rendered) - fixed by moving that same search into generation time instead, so the runtime cost is paid once per level during the regen rather than once per player per level. Since `findSolutionPaths` makes no `rng()` calls, this does not shift the seeded generation stream - a regeneration with this field produces byte-identical puzzle content to one without it, just with the extra field attached (only the per-level generation TIME grows, by however long that level's search takes). The 6 hand-authored/hardcoded levels (7, 9, 13, 33, 100, 101) don't carry stored paths since they're not produced by the live generation call that sets them; `main.js` falls back to a live search only for these, which is harmless given how small all 6 boards are.

### 9.2 Intro phase and lesson algorithms (levels 1-13, and lessons A/B/C at 41-42/70-71/99-101)

`buildIntroRecipes()` walks a fixed mechanic order (`INTRO_ORDER`, matching Section 2's introduction order) and, per mechanic, emits one recipe per tier listed in `INTRO_TIERS[mechanic]` - tier `0` is the easier/smaller pass, tier `1` is slightly bigger/tighter. Most mechanics currently get both tiers (2 intro levels); a few get only one; the entire directional-node family, `regionSizes`, and `symmetry` currently get `[]` here - summing the tier counts across all 15 mechanics gives exactly 13 recipes for levels 1-13.

Lessons A/B/C reuse the same `generateIntroLevel()` machinery for `regionSizes` (unchanged - a single-mechanic recipe like any other), but the two directional-node lessons instead go through `generateNodeComboLevel(levelNumber, mechanics, tier)`, which combines 2-3 node mechanics onto ONE shared path rather than just one. This is safe without any collision handling because `classifyPath`'s node classification is a strict partition of every interior path node: each one is EITHER turn-type (`turnNodes`, plus `cornerNodes` when an orientation resolves) OR straight-type (`straightNodes`, plus EITHER `horizontalNodes` OR `verticalNodes` depending on direction) - never both, and never split across categories in a way that could double-claim a node. `NODE_LESSON_GROUPS` defines the 3 lessons this produces, each now called from its own point in `generateAll()` rather than one shared loop: `turnNodes`+`straightNodes` together (lesson A, levels 41-42), `horizontalNodes`+`verticalNodes`+`cornerNodes` together (lesson B, levels 70-71, one size tier bigger than the 2-mechanic lesson - 3 simultaneously-required distinct node types need more path complexity to naturally co-occur than 2 do), and `regionSizes` alone (lesson C, levels 99 and 101, with the hand-authored insertion at 100 between them). Symmetry remains the one mechanic with no pure intro lesson anywhere, in any tier.

A full regeneration's own freshly-generated output for these 7 slots is discarded and replaced with the content that was already live at the collection's pre-restructure 101-107 ids (see 9.1's copy-forward note) - so in practice this machinery's day-to-day job is unchanged (still what originally produced that content), it just isn't what ends up installed on every subsequent regen.

For each recipe, `generateIntroLevel(levelNumber, mechanic, tier)` retries (up to 600 attempts) until one candidate clears every step:
1. Picks a small board size (tier 0: `2x2`/`3x2`/`2x3`; tier 1: `3x3`/`3x4`/`4x3`) and minimum path length, then finds a random simple start-to-exit path via DFS (`randomSimplePath` - shuffles the candidate next-nodes at each step, sorted with a bias toward the exit by Manhattan distance plus a small random jitter, so paths wind but still reliably terminate).
2. Optionally adds a light `blockedEdges` cut or one light `requiredEdges` entry - mainly to keep an otherwise-open board's solution count bounded enough to land in the tier's target window, when the mechanic being taught isn't already narrowing things on its own.
3. Builds the ONE mechanic being taught. Node/edge mechanics are read directly off the path's own shape; cell mechanics route through the same shared placement primitives used everywhere (`addTriangles`/`addCellColors`/`addStars`/`addEliminators`/`choosePolyomino`/`addRegionSizes`, see 9.4).
4. Validates the drawn path against the assembled puzzle (`validateSolution`), then brute-force counts solutions (`countSolutions`) against a tier-specific window (tier 0: `1-30`; tier 1: `1-22`) - truncated or out-of-window results are rejected.
5. Runs the redundancy audit (`hasRedundantMechanic`): strips each active field one at a time and re-counts; if removing any single mechanic doesn't change the count, the whole attempt is rejected as decorative.

The `polyominoes` tier-1 lesson is a deliberate exception: `SLANTED_POLYOMINO_INTRO_LEVEL` is a hand-built constant, not searched for. It needs two *rotatable* ("slanted") pieces whose region shapes visibly differ from their drawn 0-degree icon, to actually prove rotation matters (rather than every piece happening to already fit its canonical orientation) - on the small tier-1 board sizes, that specific combination essentially never occurs by chance (empirically 0/600 attempts, even after growing the board via the escalation retry), so it's fixed instead of generated.

### 9.3 Combo tier algorithm (levels 14-40, 43-69, 72-98, 102-200)

`FLEXIBLE_BANDS` is the exact difficulty ladder - 10 bands, easiest to hardest, `9+9+9+9+9+9+9+9+9+6 = 87` levels total, now split across combo tiers 0-3 rather than one contiguous phase (see 9.1's tier list for exactly which bands land in which tier):

| Band | Levels | Board sizes | Min path edges | Distinct cell mechanics | Instances per mechanic | Cut chance | Required-edge chance | Dots chance | Directional-node chance |
|---|---|---|---|---|---|---|---|---|---|
| flex1 | 9 | 3x3 / 3x4 / 4x3 | 6 | 1 | 1-2 | 10% | 20% | 30% | - (tier 0, none unlocked) |
| flex2 | 9 | 3x4 / 4x3 / 4x4 | 7 | 1 | 2-4 | 15% | 25% | 35% | - |
| flex3 | 9 | 4x4 / 4x5 / 5x4 | 8 | 2 | 1-2 | 20% | 30% | 40% | - |
| flex4 | 9 | 4x4 / 4x5 / 5x4 | 8 | 2 | 2-4 | 30% | 35% | 45% | 15% (turn/straight only) |
| flex5 | 9 | 4x5 / 5x4 / 5x5 | 9 | 3 | 1 (fixed) | 40% | 40% | 50% | 20% |
| flex6 | 9 | 4x5 / 5x4 / 5x5 | 9 | 3 | 1-2 | 50% | 45% | 55% | 25% |
| flex7 | 9 | 4x5 / 5x4 / 5x5 | 10 | 3 | 1 (fixed) | 60% | 50% | 60% | 30% (all 5 directional) |
| flex8 | 9 | 5x5 / 5x6 / 6x5 | 10 | 3 | 1-2 | 70% | 55% | 65% | 35% |
| flex9 | 9 | 5x5 / 5x6 / 6x5 | 11 | 3 | 1 (fixed) | 80% | 60% | 70% | 40% |
| flex10 | 6 | 5x5 / 5x6 / 6x5 | 11 | 3 | 1-2 | 85% | 65% | 75% | 40% (all 14, incl. regionSizes) |

Board size is deliberately capped at `5x5`/`5x6`/`6x5` even in the hardest bands (never larger) - past that, an open board's raw solution count gets expensive enough that even the cheap redundancy-check baseline (see step 6 below) takes many seconds per attempt, which multiplies out badly across however many attempts a tight recipe needs. Difficulty in the harder bands comes from `cutChance` (ramped to 80-85%) and mechanic density, not bigger boards. `distinctCell` is capped at 3 even in the hardest bands - 4-5 meant demanding nearly every mechanic simultaneously compete for the same 2-3 regions a small board actually has, causing multi-minute stalls. Bands `flex1`/`flex2`/`flex4` favor a wider `instanceRange` over a higher `distinctCell` - per direct feedback (using a dense `stars`+`cellColors`-only level as the reference), a level can be just 1-2 mechanic types with several instances each and be just as complex as, and more compact than, spreading the same symbol count across more distinct types. The `dnChance` column is new as of the interleaved-schedule restructure (2026-08-08) - it's what actually lets each tier fold its newly-unlocked mechanic(s) into ordinary combo levels rather than leaving them isolated in their lesson; `flex1-3` have no such field at all (not just `0%`), since a tier with nothing unlocked yet must never even roll it (see 9.1's determinism note on why the distinction matters).

`buildOneComboRecipe(band, cellPool, directionalPool)` turns each band into individual recipes, one at a time, immediately before that recipe's level is generated (see 9.1's determinism rule for why never a whole batch). `cellPool` and `directionalPool` are the two things that change between tiers - everything else about this function is identical for every tier and every band:
1. Picks `distinctCell` mechanics at random from `cellPool` (tiers 0-2: the original 5-mechanic cell pool - `triangles`, `cellColors`, `stars`, `eliminators`, `polyominoes`; tier 3: those 5 plus `regionSizes`) - except `polyominoes` is excluded from the pool entirely once `distinctCell >= 3` (otherwise it would win a slot on nearly every high-density recipe and immediately collapse that recipe's intended diversity, see the next point), and whenever it IS picked, every other selected mechanic except `triangles` is dropped and `triangles` is backfilled if missing - `polyominoes` claims an entire region outright (every cell, exact shape match), so it only ever safely coexists with `triangles` (which only claims single cells, never a whole region). Once `regionSizes` is in the pool (tier 3 only), one further exclusion applies: it can never share a level with `eliminators` (Section 1.1's caveat) - resolved the same way, dropping `eliminators` and backfilling.
2. Rolls an instance count per mechanic within the band's `instanceRange` - except `polyominoes`, always forced to exactly 1 regardless of band (requesting 2 simultaneous exact-shape-matching regions stalled generation for minutes the one time it was tried).
3. Forces `cellColors`'s instance count up to at least 2 if `stars` isn't also selected on that level - a single `cellColors` region alone is mathematically vacuous (no second color anywhere means "no mixed colors in a region" is trivially true no matter where the path goes).
4. Independently rolls `wantCut`/`wantRequiredEdges`/`wantDots` against the band's respective chance - each is optional and unrelated to the others. If `directionalPool` is non-empty (tiers 1-3), also rolls `wantDirectionalNode` against `band.dnChance` and, if it hits, picks ONE mechanic from `directionalPool` at random - treated exactly like `wantDots`/`wantRequiredEdges` (a light, independent, optional mark), not like the lessons' 2-3-mechanic combined groups. A combo level already stacks up to 3 cell mechanics plus a cut/dot/required-edge; a whole extra 2-3-node bundle on top would be piling density on density rather than a light touch.

`attemptFlexibleLevel(levelNumber, recipe, maxAttempts)` then retries (up to 4000 attempts) until a candidate clears every step, in this exact order:
1. Picks a board size from the recipe, finds a start/exit pair with a minimum Manhattan separation (retried up to 40 times), and a random simple path (same `randomSimplePath` as the intro phase).
2. If `wantCut`: cuts exactly one Full Cut boundary (`chooseCuts`, filtered to only consider cuts with <=4 `blockedEdges` entries - a cut's entry count scales with the *perpendicular* board dimension, so an unfiltered cut on a non-square board could exceed the rulebook's 2-4 preference).
3. If `wantRequiredEdges`/`wantDots`: picks one non-redundant edge/node each. "Non-redundant" is a cheap BFS check (`skeletonHasPathAvoiding`) confirming some OTHER route through the wall-cut skeleton avoids that exact edge/node - if every route already has to use it, marking it would be decorative, so it's rejected and the whole attempt retries.
4. Computes the actual regions (`computeRegions`) and traveled edges for this specific path+cuts, then places every selected cell mechanic in the order the recipe happened to shuffle them into, sharing ONE `occupiedCells` Set and ONE `regionUsage` Map across all of them (see 9.4) so later mechanics see what earlier ones already claimed.
5. Three rejection gates, each causing an immediate retry (fresh path) on failure:
   - **Eliminator-adjacency gate**: no eliminator cell may end up Manhattan-adjacent to ANY other symbol cell anywhere in the finished puzzle.
   - **Region-balance gate**: among regions with >=4 cells, no region's occupied-cell density may exceed `3x + 0.2` of another qualifying region's density (only checked once total occupied cells across qualifying regions is >=3, so sparse levels aren't penalized for having little to balance). Known limitation: this only ever checks the ONE solving path the generator itself constructed - if a finished puzzle has other valid solving paths (common, since there's no per-level solution-count target), a different path can partition the board differently and expose an imbalance this gate never saw. Guaranteeing every alternate path also balances would mean sampling several candidate paths per attempt, not just this one; not currently implemented, and re-rolling a flagged level isn't a reliable fix either, since the new attempt has the same limitation.
   - **Solvability**: `validateSolution` against the drawn path.
6. The redundancy audit, same mechanism as intro levels but against a deliberately cheap baseline (`countSolutions` capped at 50 solutions / 50000 search expansions) - not exhaustive, just enough to catch an obviously-decorative mechanic without reintroducing the slow, low-yield exact-count chase the earlier tiered design suffered from. If the baseline itself can't be pinned down within that budget, the comparison is treated as inconclusive (assume fine) rather than retried.

`generateFlexibleLevel` wraps this with one escalation: if the attempt budget is exhausted at the recipe's own board size, every candidate size grows by 1 in each dimension (capped at a `maxBoardDimension` parameter, default 7x7 for tiers 0-2, 6 for tier 3 - see below) and the full attempt budget is tried once more before giving up for real - a recipe exhausting its budget at one specific size is rare-but-not-impossible, not evidence the combination is unsatisfiable.

Region Size Numbers and the directional-node family (Section 3.5's scope note) are each treated like the *existing* mechanic they most resemble rather than invented from scratch:
- **Region Size Numbers joins the cell-mechanic pool like `cellColors`/`stars`** (tier 3 only) - it scales with `instanceRange` and shares the same `regionUsage` bias (see 9.4's `addRegionSizes` update), not capped at 1 like `polyominoes`.
- **The directional-node family is folded in like `wantDots`/`wantRequiredEdges`** (Section 1.2 already lists these as the safe, no-conflict way to add a Node-type mechanic) - one light, independent, optional mark (`wantDirectionalNode`/`directionalNodeMechanic`, a single mechanic chosen from whichever tier's `directionalPool` is currently unlocked, one instance), NOT the lessons' 2-3-mechanic combined groups.

**Tier 3 (`flex10` + `EXPANDED_BANDS`) continues the difficulty ramp from where `flex9` left off, rather than resetting back down to re-climb, and keeps climbing across all 11 bands rather than plateauing partway through.** `EXPANDED_BANDS` is its own 10-band table (`expand1-10`, `9+9+9+8+8+10+10+10+10+10 = 93` levels), reusing `buildOneComboRecipe`/`attemptFlexibleLevel` unchanged - `expand1` starts at `flex10`'s own board sizes/`distinctCell` (5x5/5x6/6x5, 3) and at or above its `cutChance` (0.85+); `expand6-10` push `dnChance` further still (up to 0.92) while deliberately NOT pushing `cutChance`/`instanceRange` past what `expand4`/`expand5` already validated. Board size and `distinctCell` stay at their established ceilings throughout - the difficulty headroom comes from `regionSizes` density, `dnChance`, and mechanic variety, not from growing the board or stacking more distinct mechanic types than the proven-safe 3.

Several things surfaced empirically while tuning this table and are worth carrying forward as lessons - most were caught by a full regeneration either hanging or taking unreasonably long, not by inspection:
- **`splitRegionSize`'s original implementation enumerated every possible composition of a region's size before picking one at random** - fine on the small intro-phase boards (region sizes up to ~12), but exponential in the region size, so a large region on tier 3's bigger boards (up to 30 cells) could take minutes for a single call. Rewritten to build ONE random composition directly (greedy random draw, restart on the rare stuck case) - O(size) instead of exponential.
- **Pairing a big board size with too low a `cutChance` reproduces the exact "open board is expensive" cost the original tuning avoided.** An early draft paired `flex8-10`-sized boards with `flex1`-`flex2`-style low cut chances for the first 1-2 bands, specifically to ease the new mechanics in gently - individual attempts routinely took tens of seconds. Fixed by keeping size and `cutChance` paired the way `FLEXIBLE_BANDS` always does (big board -> high cut chance, never big board -> low cut chance) throughout every band, starting at `flex10`'s own already-high `cutChance` rather than a lower one.
- **At `distinctCell` 3, `instanceRange` above `[1,2]` (i.e. `[2,3]` or higher) becomes combinatorially rare to satisfy once enough LEVELS are generated at that density, independent of `cutChance`.** Up to 9 simultaneous cell-mechanic instances (3 mechanics x up to 3 each) all needing to simultaneously satisfy region-balance, eliminator-adjacency, and redundancy is a genuinely harder search target - `expand4`/`expand5` used `instanceRange: [2,3]` across just 16 levels without incident, but extending that same density to 50 MORE levels (`expand6-10`) surfaced several 1-3-*minute*-per-level outliers purely from having more chances to roll the rare slow case, regardless of `cutChance`. Fixed by keeping `expand6-10` at `instanceRange: [1,2]` (matching `expand1-3`'s proven-reliable density) and pushing `dnChance` instead - a single independent node mark that never interacts with cell-mechanic placement feasibility, so it's safe to escalate without limit.
- **Building a whole band's (or tier's) recipes in one batch before generating any of their levels is unsafe against future extension, even when the batch itself is called at the right time.** This is the bug that made extending `EXPANDED_BANDS` from 43 to 93 levels reshuffle the already-generated first 43 - fixed by generating one level immediately after building its one recipe (see 9.1's rule), which is also what made the 2026-08-08 interleaved-schedule restructure straightforward: every tier already built its recipes this way, so widening a tier's `cellPool`/`directionalPool` was a pure parameter change, not a rewrite of the batching logic itself.

### 9.4 Shared placement primitives

Every cell-mechanic placement function takes the level's already-computed `regions` (from `computeRegions`) and a shared `occupiedCells` Set, and most also take a shared `regionUsage` Map (a running per-region placed-cell tally, reset once per attempt and threaded through every mechanic call in that attempt) and a `colorOffset` (both `addCellColors` and `addStars` independently default to the first entry in `COLORS` for their own first instance - when a level selects both, the second one placed is given a fresh offset so it doesn't collide onto the exact same single color the first one used, which would otherwise leave the level with only one color in play regardless of which mechanic supposedly needed a second):

- **`sortByLeastUsed(candidates, regionUsage)`** - shuffles candidate regions, then sorts so whichever region has had the FEWEST cells claimed so far (per `regionUsage`) comes first, ties broken randomly. Without this, every mechanic independently shuffles and picks blind to what every other mechanic (or earlier instances of the same mechanic) already did - on a board with one small region and one big one, pure-random picks can easily cluster everything into the small region purely by chance, leaving the big one empty.
- **`preferIsolated(candidates, occupiedCells, minCount)`** - filters candidate cells down to ones that aren't Manhattan-adjacent (sharing a cell edge) to anything already in `occupiedCells`; falls back to the unfiltered list if fewer than `minCount` isolated candidates exist. Prevents a newly-placed symbol from landing right next to an already-placed one, which would let a player pair them by eyeballing proximity instead of reasoning about the region.
- **`addTriangles(grid, traveled, width, height, occupiedCells, count)`** - scans every cell on the board (not region-scoped) for ones with 1-3 already-traveled edges, applies `preferIsolated`, then `pickSpaced` (evenly-spaced picks from the shuffled candidate list) to choose `count` of them.
- **`addCellColors(regions, occupiedCells, regionCount, cellsPerRegion, colorOffset, regionUsage)`** - for each of `regionCount` color-groups needed: picks a color (cycling through `COLORS` starting at `colorOffset`), filters candidate regions to ones either unclaimed or already committed to that SAME color (tracked in a local `colorByRegion` map - a region can host multiple `cellColors` groups as long as they're all one color, since `satisfiesRegions` only bans *different* colors sharing a region), picks the least-used qualifying region via `sortByLeastUsed`, then picks `cellsPerRegion` isolated-preferred free cells inside it.
- **`addStars(regions, occupiedCells, pairCount, colorOffset, regionUsage)`** - for each of `pairCount` pairs: picks a color (cycling from `colorOffset`), picks the least-used region with >=2 free cells (no same-color restriction at all - a star's region can host other star colors or unrelated squares freely, since each color's own pairing is checked independently), then 2 isolated-preferred free cells.
- **`addEliminators(regions, occupiedCells, existingColorByCell, colorOffset, regionUsage)`** - tries viable regions (>=2 free cells) in least-used-first order. Within a region, picks a pair of cells that are isolated from everything else AND not adjacent to each other (falling back to a plain random pair only if the region is too small/crowded to offer one), then decides what the eliminator cancels: if the region already carries a color from an earlier-placed mechanic, a coin flip either (a) assigns the OTHER available color to one cell, creating a real conflicting square (unsatisfiable on its own since `satisfiesRegions` bans 2+ colors sharing a region), or (b) falls through to assigning a fresh, unpartnered star color to one cell (unsatisfiable since it has no partner anywhere in the region). Either way the OTHER cell becomes the eliminator that cancels it.
- **`choosePolyomino(regions, occupiedCells, regionUsage)`** - scans every region with 2-4 cells that is ENTIRELY free (nothing else has claimed any part of it) and whose normalized cell-shape signature exactly matches a rotation of a canonical piece (`SHAPE_LOOKUP`, precomputed from every rotation of every piece), picks the least-used matching region via `sortByLeastUsed`, and claims the WHOLE region at once (every cell, not a subset).
- **`addRegionSizes(regions, occupiedCells, mode, regionUsage)`** - tries regions with >=2 free cells in least-used-first order (via `sortByLeastUsed`); for the first one that can produce a valid split (`buildRegionSizeNumbers` - either the region's own total as one `2-5` value, or a random composition into multiple `2-5` values summing to it), claims those cells and stops. `regionUsage` defaults to a fresh Map so single-call intro-phase lessons behave as a simple one-shot pick; tier 3 (the only tier with `regionSizes` unlocked) passes the SAME shared `regionUsage` every other cell mechanic uses, so multiple `regionSizes` instances on one level spread across regions instead of clustering into whichever shuffles first - the same reasoning as `addCellColors`/`addStars`.

### 9.5 Multi-solution phase (levels 201-300) and the requiredSolutions win condition

Per direct request, this phase adds a second axis of variety past the original 200-level scope: instead of a new *mechanic*, it changes what "solved" means. Most levels only ever need one valid path (`requiredSolutions` absent, main.js treats that as 1); a level generated with `requiredSolutions > 1` instead needs that many DISTINCT valid paths submitted before it counts as complete - see the gameplay side below.

**Generation**: reuses `buildOneComboRecipe`/`attemptFlexibleLevel`/`generateFlexibleLevel` completely unchanged - the same functions every other combo tier uses - over `MULTI_SOLUTION_BANDS` (11 bands, `10+10+9+9+9+9+9+10+9+8+8 = 100` levels), with the same `EXPANDED_CELL_MECHANICS`/`DIRECTIONAL_NODE_MECHANICS` pools tier 3 already uses (all 14 non-symmetry mechanics eligible from the start - no lesson needed, since nothing NEW is being taught here). After a level generates, `finalizeMultiSolutionLevel(puzzle)` runs as a `postProcess` step (`runComboTier`'s optional 6th argument): it re-runs `collectStoredSolutions` with a taller cap (`MAX_MULTI_SOLUTION_SEARCH = 10`, vs. every other tier's 3) to get a more honest read of how many distinct solutions the board actually has, then sets `requiredSolutions = max(1, min(3, ceil(foundCount / 3)))` - roughly a third of however many were found, floored at 1, capped at 3 so no level ever demands exhaustively finding every last one.

**Extended once already, the same append-only way `EXPANDED_BANDS` was extended twice**: `multi9-11` (25 levels, 276-300) were appended to the END of `MULTI_SOLUTION_BANDS` after the first 8 bands (201-275) were already live - `runComboTier`'s per-level (not per-batch) recipe building meant this didn't disturb anything already generated, verified via the same diff-against-live-file check as every other extension in this file. `multi9-11` deliberately hold `cutChance`/`reqChance` FLAT at `multi7`/`multi8`'s own level (0.6/0.4) rather than climbing further - pushing them higher would narrow the board back toward one solution, undermining the phase's whole point - and continue the ramp via `dnChance` instead (0.92->0.95), mirroring exactly how `expand6-10` handled the identical problem for tier 3.

**Why `countSolutions` (SolutionCounter.js) was tried first and rejected**: the obvious way to count "how many solutions does this puzzle have" is the `countSolutions` function already used everywhere else in this file for redundancy-checking. Piloted before committing to this design - it was unreliable here: it has no goal-direction heuristic (unlike `findSolutionPaths` in `Solver.js`, which gained `sortTowardExits` earlier the same day for exactly this reason), and on these dense boards it frequently came back `truncated: true, count: 0` even though a solution is GUARANTEED to exist (the generator's own path proves it). Its existing cheap/capped use elsewhere tolerates that ("if the baseline itself can't be pinned down within budget, treat as inconclusive/assume fine") - this new use case can't, since the count directly drives player-facing difficulty. `findSolutionPaths` (already proven reliable across all 200 pre-existing levels) is what this phase reuses instead, just with a higher cap.

**Band tuning is the mirror image of every other table in this file.** Every band from `flex1` through `expand10` pushes `cutChance`/`reqChance` UP to narrow a board toward as FEW solutions as possible - a single hard-to-find solution was always the goal. `MULTI_SOLUTION_BANDS` needs the opposite: a board open enough that multiple genuinely different routes can coexist, or `requiredSolutions` always collapses to 1 and the whole mechanic never shows up. Piloted before committing to numbers: at `expand10`-style settings (`cutChance` 0.95, `reqChance` 0.78), 8 of 12 sampled levels found only 1 solution even after searching up to `MAX_MULTI_SOLUTION_SEARCH`; dropping to `cutChance` ~0.4-0.6 and `reqChance` ~0.2-0.4 raised that to 7 of 12 getting a real 2-or-3 requirement. `distinctCell`/`instanceRange` are left UNCHANGED from `expand10` throughout - this phase's difficulty is meant to come from "find several ways through", not a diluted version of the density that drives tier 3.

**Known limitation, confirmed at full scale (all 100 levels across both the original 75 and the 25-level extension), not just the 12-level pilot**: this design *accepts* whatever solution count it finds rather than *requiring* at least 2 - a level that only turns up 1 solution still generates successfully, just with `requiredSolutions = 1` (structurally identical to an ordinary tier-3 level). The actual distribution: `{1: 67, 2: 4, 3: 29}` - 67% fell back to a single required solution, 33% got a real multi-path requirement, holding steady from the original 75-level batch's `{1: 48, 2: 4, 3: 23}` (64%/36%) since `multi9-11` kept `cutChance`/`reqChance` at the same flat level rather than changing the underlying odds. If a future batch needs a HIGHER hit rate than that, the missing piece is a hard rejection gate (reject and retry with a fresh path/placement if fewer than 2 solutions are found, mirroring the existing eliminator-adjacency/region-balance gates in `attemptFlexibleLevel`) - not yet built, and expected to cost more generation time/attempts since it stacks a second hard-to-satisfy condition on top of the mechanic density.

**Gameplay side** (not generation, but load-bearing for this phase to mean anything): `main.js`'s `handleRelease` reads `puzzle.requiredSolutions` (default 1) and, for levels above 1, tracks distinct valid paths submitted so far instead of completing on the first one - `getFoundSolutions`/`addFoundSolution` in `SaveManager.js` persist that progress per puzzle (a new `solutionProgress` save field, keyed by `progressKey`) so it survives a reload. A resubmitted path that exactly matches one already found doesn't count again ("already found that solution" instead of progress). `getDefaultStatusText` shows `"X/Y solutions found"` when a multi-solution level has partial progress and isn't complete yet. Verified end-to-end via a debug-only hook (`window.__debugSubmitPath`, gated by `debugMode`, calls the real `handleRelease` directly) driving two of a level's own stored `solutionPaths` - confirmed partial progress, duplicate detection, reload persistence, and completion all work correctly.

#### Band reference table

All three combo band tables share the same shape (`name`, `count`, `sizes`, `minEdges`, `distinctCell`, `instanceRange`, `cutChance`, `reqChance`, `dotsChance`, optionally `dnChance`) and the same generation machinery (`buildOneComboRecipe`/`attemptFlexibleLevel`) - only the numbers differ. Use this as a starting point when designing a new batch, per the guidance in each row:

| Table | Levels | Mechanic pool | `cutChance` range | `reqChance` range | `distinctCell` | `instanceRange` | Design goal |
|---|---|---|---|---|---|---|---|
| `FLEXIBLE_BANDS` (`flex1-10`) | 14-40, 43-69, 72-98, 102 (flex10) | 8 core, +directional as unlocked per tier | 0.1 -> 0.85 | 0.2 -> 0.65 | 1 -> 3 | mostly 1-2, some 2-4 | Narrow toward one hard-to-find solution; ramp via density AND board size together |
| `EXPANDED_BANDS` (`expand1-10`) | 102-200 (tier 3) | all 14 non-symmetry | 0.85 -> 0.95 | 0.65 -> 0.78 | 3 (fixed) | 1-2 (1-3 for expand4/5 only) | Collection's hardest/densest tier - maximum narrowing, `dnChance` (0.4->0.92) is the main extra difficulty lever |
| `MULTI_SOLUTION_BANDS` (`multi1-11`) | 201-300 | all 14 non-symmetry | 0.4 -> 0.6 (flat from `multi7` on) | 0.2 -> 0.4 (flat from `multi7` on) | 3 (fixed) | 1-2 | Deliberately OPEN, not narrow - preserves solution diversity so `requiredSolutions` can exceed 1; `dnChance` (0.5->0.95) keeps climbing past where `cutChance`/`reqChance` level off, since node marks don't hurt solution count |

Quick decision guide for a future band table:
- **Want a single, hard-to-find solution (the classic design)**: push `cutChance` and `reqChance` up together, keep them paired with board size (never big board + low cut - see the `EXPANDED_BANDS` history below for why that stalls generation). This is what every table did before the multi-solution phase.
- **Want multiple genuinely different valid routes**: pull `cutChance` and `reqChance` DOWN instead, while leaving `distinctCell`/`instanceRange` exactly as dense as your hardest reference tier - those two are what carry the "hard to reason about" difficulty; `cutChance`/`reqChance` are what carry "hard to physically route", and it's specifically the latter that need to loosen for multiple routes to coexist.
- **`distinctCell` above 3** is not recommended regardless of goal - every band table in this file caps it there; higher demands nearly every mechanic simultaneously compete for the same 2-3 regions a board actually has, which caused multi-minute stalls the one time it was tried (see 9.3's board-size/cutChance history).
- **A brand new mechanic pool or win condition** (like this phase's `requiredSolutions`) needs a `postProcess` callback passed as `runComboTier`'s 6th argument - no changes to the band table shape, `buildOneComboRecipe`, or `attemptFlexibleLevel` itself are needed, exactly as this phase demonstrates.
- **Always append, never insert.** Any new band table's `runComboTier` call must go at the END of `generateAll()`, after every existing phase - the generator's RNG stream is sequential, so anything inserted earlier reshuffles every level generated after it (see 9.1's determinism section).

