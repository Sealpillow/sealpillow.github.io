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
| Polyominoes | A region containing one or more piece icons must be exactly tileable by all of them at once, no gaps or overlaps. Straight pieces keep the shown orientation; slanted pieces may be rotated to any valid 90-degree turn. | `polyominoes: [[col,row,shapeName,rotationSteps,rotatable], ...]` - shapes: `domino`, `tromino-I`, `tromino-L`, `square`, `tetromino-I`/`L`/`T`/`S`; `rotationSteps` 0-3 quarter turns; `rotatable: true` ("slanted") = any rotation is a valid fit; `rotatable: false` ("straight") = must match `rotationSteps` exactly | solid block of flush unit cells with thin divider lines - straight sits axis-aligned at `rotationSteps*90deg`, slanted is tilted ~22deg regardless of `rotationSteps` |
| Turn Nodes | If the path visits that node, it must turn there rather than pass straight through. | `turnNodes: [[col,row], ...]` | gold turn-node marker on the grid node |
| Straight Nodes | If the path visits that node, it must pass straight through it, either horizontally or vertically. | `straightNodes: [[col,row], ...]` | pale cross marker on the grid node |
| Horizontal Nodes | If the path visits that node, it must pass straight left-to-right through it. It may land on the node, but may not continue vertically through it. | `horizontalNodes: [[col,row], ...]` | pale horizontal bar marker on the grid node |
| Vertical Nodes | If the path visits that node, it must pass straight top-to-bottom through it. It may land on the node, but may not continue horizontally through it. | `verticalNodes: [[col,row], ...]` | pale vertical bar marker on the grid node |
| Corner Nodes | If the path visits that node, it must form one specific L-shaped turn orientation there. Supported orientations are `ur`, `ul`, `dr`, and `dl`. | `cornerNodes: [[col,row,orientation], ...]` | blue corner marker on the grid node |
| Region Size Numbers | A numbered cell contributes that many cells to its region's required total. If multiple numbers share a region, add them together; the region containing them must have exactly that many cells in any shape. Prefer compact values, usually `2-5`, and build larger totals by summing multiple numbers in the same region. | `regionSizes: [[col,row,value], ...]` | ivory number centered in the cell |
| Symmetry | A second path, the 180-degree rotation of the drawn one about grid center, is derived automatically; both must be valid and must never share a node. The drawn path may start from either visible start point and may finish on either a listed exit or that exit's mirrored counterpart. Its nodes/edges also count toward Dots/Required/Triangles/Regions, so it combines with other mechanics instead of staying standalone. | `symmetry: "rotational"` (only value currently supported) | dimmed mirror start/exit markers + a distinctly colored mirror path line |

Current caveat:

- Do not combine `regionSizes` with `eliminators` yet. The validator enforces region-size numbers directly and does not let eliminators cancel them.
- Prefer `2-5` as the standard value range for individual numbers. If a solved region is larger than `5`, represent it with multiple `2-5` values that add to the full region size instead of a single large number.

---

## 2. Mechanic introduction order

Dots -> Blocked Edges -> Required Edges -> Symmetry -> Triangles -> Colored Regions -> Stars -> Eliminators -> Polyominoes.

Extended Codex continuation (`151-300`) adds: Turn Nodes -> Straight Nodes -> Horizontal Nodes -> Vertical Nodes -> Corner Nodes -> Region Size Numbers, followed by mixed late-game combinations using those newer rules together with earlier mechanics.

Rationale, for when a new mechanic needs to be slotted in:
- The three simple point/edge rules (Dots, Blocked Edges, Required Edges) come first - they constrain the path directly, with no indirection.
- Symmetry comes next as a paradigm-shift breather (mirroring how the actual Witness introduces it early rather than saving it as a capstone) before the reasoning-heavy mechanics.
- Triangles (reasoning about one cell), then Colored Regions (reasoning about the whole board), then Stars (a stricter regions variant), then Eliminators and Polyominoes last, since both depend on the player already understanding what a region is.

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

### 3.5 What differentiates the collections

The collections do **not** differ in mechanic rules. Claude and Codex share the same engine, the same validation, the same symbol meanings, and the same hard constraints. The difference is only in how the collection is paced and ordered.

- **Claude collection**: longer teaching stretches, gentler onboarding, more patient early reinforcement.
- **Codex collection**: shorter introductions, earlier combinations, earlier difficulty rise, and more aggressive replacement of soft late outliers.

---

## 4. Campaign structure and difficulty targets

The original 134-level set is organized into tiers. Use it as the reference ladder for what kinds of ideas belong in each band and how tightly they should solve. Newer collections do not have to copy its exact block lengths, but they should preserve the same underlying progression from simple recognition to dense recombination.

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

**Named teaching devices worth reusing:**
- *Free-adjacent-triangle* - placing a triangle on a cell where the count is already fixed by a nearby cut, so its correctness is "free" rather than needing its own independent reasoning - good filler, not a substitute for a real constraint elsewhere in the same level.
- *Triangle-count-4-cancelled-by-eliminator* - a triangle count of 4 is mathematically unsatisfiable on its own (see Section 7), so pairing one with an eliminator makes the eliminator's necessity completely unambiguous rather than merely "technically non-redundant." Good as an Eliminators-tier teaching level.
- *Rotation-required Polyomino placement* - a multi-piece Polyomino region where at least one piece only fits when rotated proves the rotation search (and the "slanted" rendering) actually matters, rather than every piece happening to fit in its canonical orientation.

---

## 7. Hazards and hard rules

- **Triangle count of 4 is impossible alone.** A cell's 4 edges form a cycle over 4 nodes; using all 4 forces a revisit, which the engine forbids outright. Max valid standalone count is 3. A count of 4 is only usable paired with an eliminator that cancels it.
- **Symmetry unsolvable-by-construction cases.** An exit that is the 180-degree rotation of the start collides with its own reflection and can never be solved - check this whenever placing start/exit on a Symmetry level. On even-sized grids, the exact grid-center node is its own reflection and must be avoided by the path.
- **Never stack two mechanic icons on the same cell.** Two symbols sharing a cell (e.g. an eliminator directly on its target triangle) is visually ambiguous and should be treated as outright invalid, not just undesirable. Place the second icon on an adjacent free cell in the same region instead.
- **Directional nodes should carry their own restriction.** Do not "help" a `horizontalNode`, `verticalNode`, or oriented `cornerNode` by also blocking the exact exits that the symbol itself already disallows. That makes the wall decorative and weakens the deduction space around the node.
- **Polyomino + `blockedEdges` collisions.** A cut edge frequently bisects the exact fence a polyomino's region needs to stay intact, making the level unsolvable. Fix by repositioning the cut away from the piece's cells, or dropping the cut for that level and relying on other mechanics for tightness.
- **`satisfiesRegions` (and every region-based mechanic) only treats the drawn path's own edges as flood-fill walls - `blockedEdges` are not walls.** A blocked edge stops the player from drawing through it, but does not by itself separate two cells into different regions; the path itself still has to be routed to do that.

---

## 8. Known scope limits (deliberate, not bugs)

- **Default board size should stay at 4x4 or smaller unless there is a strong reason not to.** Larger grids make solve counts and redundancy checks much more expensive, and they often create fake difficulty through size alone. Treat 5x5 and above as exceptional, not standard. Do not move to 6x6 by default without first proving the solver budget and the puzzle quality both hold up.
- **Polyominoes are positive-piece tiling only.** The real Witness also has subtractive/negative pieces, but their exact interaction rule couldn't be reconstructed with confidence from available reference material, and a guessed-wrong rule would be worse than not having one. Don't add a "negative" piece without first nailing down its exact rule from a reliable source.

