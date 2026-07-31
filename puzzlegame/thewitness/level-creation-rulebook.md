# Level Creation Rulebook - The Vision

This document is self-contained for adding or changing levels in `src/puzzles/*.json` - mechanic rules, data format, icons, ordering, difficulty targets, collection philosophy, and hazards all live here. For everything else about the project (vision, tech stack, engine architecture, build status), see `README.md`.

---

## 1. Mechanic rules & data reference

Every puzzle needs `id`, `width`, `height`, `start` (a node `[col,row]`), and `exits` (an array of nodes - any one reached is a valid finish). Everything below is optional, added only for the mechanics that level is teaching or combining.

| Mechanic | Rule | Field & format | Icon |
|---|---|---|---|
| Dots | Path must visit every dot node. | `dots: [[col,row], ...]` (node coords) | filled circle on the node |
| Blocked Edges | Path can never cross these edges. | `blockedEdges: [[[c1,r1],[c2,r2]], ...]` (edge = pair of adjacent nodes) | broken red line on the grid edge |
| Required Edges | Path must include these edges. | `requiredEdges: [[[c1,r1],[c2,r2]], ...]` | highlighted gold grid line |
| Triangles | Cell must have exactly N of its 4 edges traveled. | `triangles: [[col,row,count], ...]`, count 1-3 (4 only valid paired with an eliminator - see Section 7) | 1-3 small triangles clustered in the cell |
| Colored Regions | The path must partition the grid so same-colored cells stay in one connected region; a region can't mix colors (any number of distinct colors is fine, just not mixed within one region). | `cellColors: [[col,row,color], ...]` | small colored square chip |
| Stars | A star must pair with exactly one other same-colored cell (another star or a plain colored square) in its region; no other color may be present in that region. | `stars: [[col,row,color], ...]` | 5-point star, colored |
| Eliminators | Cancels exactly one other symbol (a triangle, colored square, star, or another eliminator) in its region; the puzzle doesn't say which - solved if *any* valid pairing leaves the rest satisfying their normal rules. | `eliminators: [[col,row], ...]` | orange ring with an X |
| Polyominoes | A region containing one or more piece icons must be exactly tileable by all of them at once, no gaps or overlaps. | `polyominoes: [[col,row,shapeName,rotationSteps,rotatable], ...]` - shapes: `domino`, `tromino-I`, `tromino-L`, `square`, `tetromino-I`/`L`/`T`/`S`; `rotationSteps` 0-3 quarter turns; `rotatable: true` ("slanted") = any rotation is a valid fit; `rotatable: false` ("straight") = must match `rotationSteps` exactly | solid block of flush unit cells with thin divider lines - straight sits axis-aligned at `rotationSteps*90deg`, slanted is tilted ~22deg regardless of `rotationSteps` |
| Symmetry | A second path, the 180-degree rotation of the drawn one about grid center, is derived automatically; both must be valid and must never share a node. The drawn path may start from either visible start point and may finish on either a listed exit or that exit's mirrored counterpart. Its nodes/edges also count toward Dots/Required/Triangles/Regions, so it combines with other mechanics instead of staying standalone. | `symmetry: "rotational"` (only value currently supported) | dimmed mirror start/exit markers + a distinctly colored mirror path line |

---

## 2. Mechanic introduction order

Dots -> Blocked Edges -> Required Edges -> Symmetry -> Triangles -> Colored Regions -> Stars -> Eliminators -> Polyominoes.

Rationale, for when a new mechanic needs to be slotted in:
- The three simple point/edge rules (Dots, Blocked Edges, Required Edges) come first - they constrain the path directly, with no indirection.
- Symmetry comes next as a paradigm-shift breather (mirroring how the actual Witness introduces it early rather than saving it as a capstone) before the reasoning-heavy mechanics.
- Triangles (reasoning about one cell), then Colored Regions (reasoning about the whole board), then Stars (a stricter regions variant), then Eliminators and Polyominoes last, since both depend on the player already understanding what a region is.

A new mechanic should get only a brief teaching block before it starts appearing in combination with others. Current pacing guidance is `1-2` pure introduction levels, followed quickly by boards that reuse previously-taught mechanics so difficulty starts scaling earlier and player engagement stays high.

---

## 3. Collection philosophy, priorities, and thought process

Before worrying about exact tier numbers, use this priority order when authoring:

1. **Clarity of the lesson.** The player should be able to infer what the level is asking through experimentation.
2. **Real logical pressure.** Every active mechanic must eliminate real candidate paths; decorative symbols are not allowed.
3. **Smooth difficulty rise.** A later level that feels easier than the surrounding stretch should be reordered earlier or replaced.
4. **Early recombination.** New mechanics should start mixing with older ones quickly instead of sitting in long isolated blocks.
5. **Structural variety.** Do not lean on the same wall skeleton or symbol arrangement across a whole band of levels.
6. **Board size restraint.** Increase grid size only when it creates better logic, not just because the collection is getting later.

The authoring thought process for a single level should be:

1. Decide the level's role: introduction, reinforcement, bridge level, or difficulty spike.
2. Decide which mechanic is the star and which older mechanics are there to support it.
3. Draft a board with enough raw branching that the final answer comes from deduction, not from a dead maze.
4. Add constraints that rule out specific alternatives, not just constraints that happen to be true on the intended path.
5. Compare the level against its neighbors in the collection and ask whether it belongs there.
6. Only then run the solve-count, redundancy, and branching checks.

### Collection-specific guidance

- **Claude collection**: longer teaching blocks, more patient onboarding, slower early ramp.
- **ChatGPT collection**: short introductions (`1-2` pure levels), earlier combinations, earlier difficulty climb, later cleanup by reordering or replacing any soft outliers.
- **Shared rule for both**: the mechanic rules are identical. Differences between collections are about pacing, sequencing, density, and authored/generated taste - not about different game logic.

---

## 4. Tier structure & difficulty targets

The original 134-level set is organized into tiers. When adding a level, place it in the tier matching its intent, and hit that tier's solution-count target (see `Design loop` below for how to measure this).

| Levels | Content | Solution-count target |
|---|---|---|
| 1-4 | Basic path only (grid ramps 1x1 -> 2x2 -> 3x3) | loose, no target |
| 5-58 | Each of the 9 mechanics introduced one at a time, a full 6-level block each, combined with only what's already been taught | loose (teaching tier - mirrors the real game's own precedent) |
| - | **All 9 mechanics fully introduced by level 58** | |
| 59-64 | Symmetry reintroduced, combined with 1-2 other mechanics | ~10-20, gently tightening |
| 65-80 | Fresh 2-3 mechanic combinations spanning all 9 mechanics, varied grid shapes/corners | <=10, tightening toward <=6 |
| 81-96 | 4-mechanic combinations on bigger boards (4x4+) | <=6, tightening toward <=3 |
| 97-112 | Heaviest main-campaign combinations | <=3 |
| 113 | Grand finale | 1-2 |
| 114-134 | Bonus hard tier - harder than the main finale, every board genuinely distinct (grid shape, corners, walls) | 1, verified against real branching (see below), not a dead maze |

**Honest status of the current set:** the 65-134 range was fully reworked once already to fix severe skeleton repetition (76 of 120 levels originally shared a wall layout with 2+ others). That rework prioritized grid variety and zero redundancy over hitting the exact numeric ceilings above - many combination-tier levels currently land looser than their target (loose counts in the dozens to low hundreds are common in 65-112, not the exception). Zero-redundancy is the non-negotiable bar; the numeric ceiling is an aspiration to tighten toward when touching a level again, not a blocker for new content.

**Current collection guidance:** newer collections do not need to preserve the old long teaching blocks. The preferred pacing is a short ramp: introduce a mechanic in `1-2` pure levels, then start recombining it with earlier rules almost immediately. The goal is to avoid a flat early game and let genuine difficulty scaling begin much sooner than the legacy 134-level structure did. If a later band still contains noticeably easier boards, those should be reordered earlier or replaced rather than tolerated as a "breather" by accident.

---

## 5. The design loop for one level

Never hand-derive a puzzle's difficulty or trust "at least one solution exists." For every new or edited level:

1. **Draft** - pick grid size, start/exit, and constraint placements using the techniques in Section 6.
2. **Solve-count** - brute-force DFS-enumerate every valid path against the real `Grid`/`Validator` engine code, up to a safety cap (raise the cap, e.g. to 800-1000, for larger boards - a result that hits the cap on both a full and a stripped puzzle gives a false "redundant" reading, not a real one).
3. **Redundancy audit** - for every active mechanic, strip it and re-run the count. If it doesn't change, that mechanic is decorative and needs repositioning to somewhere it actually rules out a candidate.
4. **Branching check** - strip everything except `blockedEdges` and re-count. This "raw" count must meaningfully exceed the final count (raw >> final), never raw = final = 1 - otherwise the maze alone determines the answer and the other mechanics are decorative, even though the redundancy audit alone wouldn't have caught it (this is a distinct check, not a rephrasing of #3).
5. **Mechanic compatibility** - a mechanic can pass the redundancy audit against the *raw* maze yet still be constant among the 2-4 candidates that survive every *other* mechanic, which is what actually matters. Compare the puzzle's actual surviving candidates directly, not just the raw branching count, when placements were chosen to be "safely satisfied by the answer" rather than "actively ruling something out."
6. **Iterate** placement until the tier's target, zero redundancy, and real branching are all satisfied.

After authoring a batch (a tier, or any meaningful chunk), re-run the full solve-count regression across every level authored *so far*, not just the new ones - this catches cross-level mistakes early. Once a full session's changes are done, regression-solve every touched collection and drive it through the real UI end-to-end (sequential unlock gating from level 1, every level solved via simulated input, no mechanic-name leak anywhere in the page text, zero console errors) before considering the work finished.

Verification reminder: if the session touched input or HUD behavior, also sanity-check the mobile thumb-scope flow: appears on path start, can be dismissed/reopened cleanly, softly follows the path while dragging, does not scroll the page during an active scope swipe, preserves the chosen follow-speed setting, rewinds cleanly when the player taps an earlier visited node, and respects left/right-hand placement from the settings cog.

## 6. Core techniques

**`blockedEdges` as a real topological cut, not decoration.** Between two adjacent grid columns (or rows) there are `height+1` (or `width+1`) crossing edges - block all but one ("Full Cut") and every simple path is *provably* forced through that single gap, for the cost of a few blocked-edge entries. Cells bounded by the newly-blocked edges get 1-2 edges fixed at zero for free - a cheap place to add a tight triangle count (never use 4 alone, see Section 7). A required edge placed at or right next to the gap is satisfied by construction; region-colored cells straddling the gap are separated for free too.

**Prefer a light cut over a heavy one.** A single Full Cut per boundary (not a serpentine blocking every alternating crossing) leaves real branching for the other mechanics to filter - a heavy maze that already forces a near-unique path on its own makes every other mechanic decorative, which the branching check (Section 5, step 4) will catch, but it's cheaper to just not build it that way. If density from other mechanics can't reach the target with a light cut, add more of those first before thickening the maze.

**Constraint density scales with grid size.** `blockedEdges` is the only mechanic that removes topology; everything else just constrains which of the still-open edges get used, and a bigger board always offers more equivalent detours around a single instance of any of them. Rough guideline: ~2-3 constraint instances for a 2x2 board, ~5-6 for 3x3, ~8-10 for 4x4. A board with no `blockedEdges` at all needs proportionally more of the other constraint types to reach the same tightness.

**Do not treat "bigger" as "later."** A 4x4 with strong interlocking logic is usually better than a 5x5 that only looks harder. Use a larger board only when the extra space creates a puzzle idea that smaller boards cannot express cleanly.

**Avoid too many point-style constraints.** Stacking many dots/required edges effectively draws a connect-the-dots picture, revealing the solution path visually rather than requiring real deduction. Prefer `blockedEdges` cuts and region/color reasoning for tightening; keep dots/required-edge counts to roughly 1-2 per level rather than stacking them for artificial difficulty.

**Named teaching devices worth reusing:**
- *Free-adjacent-triangle* - placing a triangle on a cell where the count is already fixed by a nearby cut, so its correctness is "free" rather than needing its own independent reasoning - good filler, not a substitute for a real constraint elsewhere in the same level.
- *Triangle-count-4-cancelled-by-eliminator* - a triangle count of 4 is mathematically unsatisfiable on its own (see Section 7), so pairing one with an eliminator makes the eliminator's necessity completely unambiguous rather than merely "technically non-redundant." Good as an Eliminators-tier teaching level.
- *Rotation-required Polyomino placement* - a multi-piece Polyomino region where at least one piece only fits when rotated proves the rotation search (and the "slanted" rendering) actually matters, rather than every piece happening to fit in its canonical orientation.

---

## 7. Hazards and hard rules

- **Triangle count of 4 is impossible alone.** A cell's 4 edges form a cycle over 4 nodes; using all 4 forces a revisit, which the engine forbids outright. Max valid standalone count is 3. A count of 4 is only usable paired with an eliminator that cancels it.
- **Symmetry unsolvable-by-construction cases.** An exit that is the 180-degree rotation of the start collides with its own reflection and can never be solved - check this whenever placing start/exit on a Symmetry level. On even-sized grids, the exact grid-center node is its own reflection and must be avoided by the path.
- **Never stack two mechanic icons on the same cell.** Two symbols sharing a cell (e.g. an eliminator directly on its target triangle) is visually ambiguous and should be treated as outright invalid, not just undesirable. Place the second icon on an adjacent free cell in the same region instead.
- **Polyomino + `blockedEdges` collisions.** A cut edge frequently bisects the exact fence a polyomino's region needs to stay intact, making the level unsolvable. Fix by repositioning the cut away from the piece's cells, or dropping the cut for that level and relying on other mechanics for tightness.
- **`satisfiesRegions` (and every region-based mechanic) only treats the drawn path's own edges as flood-fill walls - `blockedEdges` are not walls.** A blocked edge stops the player from drawing through it, but does not by itself separate two cells into different regions; the path itself still has to be routed to do that.

---

## 8. Known scope limits (deliberate, not bugs)

- **Default board size should stay at 4x4 or smaller unless there is a strong reason not to.** Larger grids make solve counts and redundancy checks much more expensive, and they often create fake difficulty through size alone. Treat 5x5 and above as exceptional, not standard. Do not move to 6x6 by default without first proving the solver budget and the puzzle quality both hold up.
- **Polyominoes are positive-piece tiling only.** The real Witness also has subtractive/negative pieces, but their exact interaction rule couldn't be reconstructed with confidence from available reference material, and a guessed-wrong rule would be worse than not having one. Don't add a "negative" piece without first nailing down its exact rule from a reliable source.
