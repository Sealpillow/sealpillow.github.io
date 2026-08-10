# Level Creation Rulebook - Puzzle Collection

This rulebook covers the current `Puzzle Collection` app, where levels are grouped by puzzle family instead of being authored as one maze campaign.

Use this document when adding, tuning, or reviewing levels in [src/puzzles/manifest.js](C:/Users/luata/Desktop/PuzzleGame/puzzlecollection/src/puzzles/manifest.js).

## 1. Current scope

The active in-app experience contains 6 puzzle families:

1. `toggle-switches`
2. `rotation-path`
3. `memory-sequence`
4. `mirror-reflection`
5. `number-trace`
6. `chimp-test`

Each family currently generates `50` levels through code, for `300` in-app levels total.

The selection screen also includes an external launcher for `The Witness`, but that is not part of the in-app manifest and should not be treated as a Puzzle Collection level family.

## 2. Source of truth

For the current puzzle collection, the main sources of truth are:

- [main.js](C:/Users/luata/Desktop/PuzzleGame/puzzlecollection/main.js)
- [src/puzzles/manifest.js](C:/Users/luata/Desktop/PuzzleGame/puzzlecollection/src/puzzles/manifest.js)
- [src/puzzles/registry.js](C:/Users/luata/Desktop/PuzzleGame/puzzlecollection/src/puzzles/registry.js)
- [src/puzzles/types/](C:/Users/luata/Desktop/PuzzleGame/puzzlecollection/src/puzzles/types)

Level content is not authored as SVG files for the active puzzle families. Instead, each family is created by data builders in `src/puzzles/manifest.js`.

## 3. Collection structure

Every in-app puzzle family should behave like its own mini-campaign.

Rules:

- A puzzle type should have its own level collection.
- Solving a level should unlock the next level only inside the same type.
- Opening a puzzle type should drill straight into that type's current playable level.
- The lower navigation should only show levels from the current type.
- The selection screen should show puzzle types only, not mixed level cards.

Current UI rules:

- Puzzle type pagination: `4` cabinets per page
- In-type level pagination: `10` levels per page

## 4. Family design goals

### Toggle Switches

Core rule:
Clicking a switch flips itself and linked neighboring nodes. The puzzle clears when every node is ON.

Design goals:

- The board should feel readable at a glance.
- Early levels should teach adjacency and chain reactions cleanly.
- Harder levels should come from interaction density, not visual clutter.
- Avoid boards that solve trivially from random clicking.

Current custom limits:

- Width `3-4`
- Height `2-4`

### Rotation Path

Core rule:
Rotate pieces until one valid path connects the left entry marker to the right exit marker.

Design goals:

- The `IN` and `OUT` markers should always make the objective obvious.
- Empty cells should help shape the route instead of becoming noise.
- Later levels can become wider and taller, but should still preserve a readable route idea.
- Difficulty should come from ambiguity in orientation, not from hiding the goal.

Current custom limits:

- Width `4-7`
- Height `3-5`

### Memory Sequence

Core rule:
The player watches a sequence and repeats the full sequence correctly.

Design goals:

- The watch phase must be visually obvious.
- The repeat phase should feel calm and clean rather than noisy.
- Difficulty should scale through sequence length, round count, and pad count.
- Boards should remain visually readable even at the largest layout.

Current custom limits:

- Width `2-3`
- Height `2-3`
- Rounds `2-6`

### Mirror Reflection

Core rule:
Rotate mirrors until the beam reaches the target.

Design goals:

- The beam path should update immediately after each move.
- Larger boards should not simply mean more mirrors everywhere.
- As the board grows, use fewer mirrors and more blockers to create cleaner but harder routing.
- Source, beam path, blockers, and target should stay legible at all sizes.

Current custom limits:

- Width `5-7`
- Height `5-7`

### Number Trace

Core rule:
The player sees numbered positions briefly, then must tap them back in ascending order after they disappear.

Design goals:

- The preview phase must be short but fair.
- Difficulty should come from memory load and spatial recall.
- Larger grids should not automatically force maximum target counts.
- The board must stay clean enough that the player can chunk positions.

Current custom limits:

- Width `3-5`
- Height `3-5`
- Target count `3-9`
- Preview time `700-2200 ms`

### Chimpanzee Test

Core rule:
Numbers are visible until the player taps `1`. Then the rest hide and must be finished in ascending order.

Design goals:

- The first click should feel like the commitment point.
- Difficulty should come from storing the layout before pressing `1`.
- Number count should scale carefully with grid size.
- Avoid boards where crowded placement makes the puzzle unfair instead of challenging.

Current custom limits:

- Width `3-6`
- Height `3-6`
- Number count `4-12`

## 5. Level generation rules

All standard levels are currently generated in code, not hand-authored one by one.

That means:

- If you change a family's progression, update the builder function in `src/puzzles/manifest.js`.
- If you change a family's interaction rules, update both the manifest assumptions and the matching controller in `src/puzzles/types/`.
- Keep the level ids stable unless there is a good reason to change them.
- Keep `LEVELS_PER_TYPE` aligned with the intended collection size.

Examples of builder responsibilities:

- `buildTogglePuzzle()`
- `buildRotationPuzzle()`
- `buildMemorySequence()`
- `buildMirrorPuzzle()`
- `buildNumberTracePuzzle()`
- `buildChimpTestPuzzle()`

## 6. Difficulty progression guidance

Use progression that feels deliberate inside each family.

Good progression signals:

- Small board -> medium board -> large board
- Lower information load -> higher information load
- Fewer meaningful choices -> more meaningful choices
- Shorter recall chain -> longer recall chain
- Cleaner routing -> more ambiguous routing

Avoid:

- Sudden spikes with no onboarding
- Pure size inflation without a new decision burden
- Hard levels that are visually messy instead of conceptually interesting
- Repeating the exact same lesson for too many levels in a row

## 7. Custom puzzle rules

Each puzzle family has its own custom modal because the inputs differ by mechanic.

Rules for custom puzzle work:

- Do not force one generic custom modal across all puzzle types.
- Keep custom options aligned with the actual mechanic needs.
- Clamp every custom input to safe ranges in code.
- Custom puzzles should feel like valid variants of their family, not debug junk.

Current custom builders:

- `createCustomTogglePuzzle`
- `createCustomRotationPuzzle`
- `createCustomMemoryPuzzle`
- `createCustomMirrorPuzzle`
- `createCustomNumberTracePuzzle`
- `createCustomChimpPuzzle`

## 8. Save and progression rules

Progression is stored by puzzle type in [src/save/SaveManager.js](C:/Users/luata/Desktop/PuzzleGame/puzzlecollection/src/save/SaveManager.js).

Rules:

- Unlocks are per type, not global across all families.
- Completed levels are tracked by level id.
- A new family should fit into the `unlockedByType` structure cleanly.
- Debug mode should not permanently rewrite the intended collection flow.

Current save key:

- `puzzle-cabinet-save-v1`

## 9. Debug mode rules

Debug mode is enabled through `?debug=1`.

Expected behavior:

- All levels are treated as unlocked.
- Opening a type should begin at level 1 for that type.
- `?type=<type>` should open a specific family.
- `?puzzle=<index>` should open a specific global puzzle entry.

When changing navigation or progression, re-check debug behavior so it does not accidentally drop players into the last unlocked level when the intention is to test from the start.

## 10. Adding a new puzzle family

When adding a new in-app family:

1. Add metadata in `TYPE_META` in [main.js](C:/Users/luata/Desktop/PuzzleGame/puzzlecollection/main.js).
2. Add its generated levels or builder logic in [src/puzzles/manifest.js](C:/Users/luata/Desktop/PuzzleGame/puzzlecollection/src/puzzles/manifest.js).
3. Add its controller to [src/puzzles/registry.js](C:/Users/luata/Desktop/PuzzleGame/puzzlecollection/src/puzzles/registry.js).
4. Create a dedicated controller file under [src/puzzles/types/](C:/Users/luata/Desktop/PuzzleGame/puzzlecollection/src/puzzles/types).
5. Add a custom modal only if the family supports custom generation.
6. Verify the selection screen, collection drill-in flow, and per-type navigation.
7. Verify save progression and debug URLs.

If the new family is external only, like `The Witness`, keep it outside the in-app manifest and treat it as a launcher card instead of a normal collection.

## 11. Verification checklist

Before considering level changes done, verify:

- The puzzle type appears correctly on the selection screen.
- Selecting that type opens the correct collection directly.
- The lower nav only shows levels from that family.
- Pagination labels still make sense.
- Restart and pause still work.
- Solving a level unlocks the next one in the same family.
- Custom mode still opens the correct family-specific modal.
- `?debug=1` still unlocks all levels.
- `?type=<type>` and `?puzzle=<index>` still behave correctly.

## 12. Legacy file warning

The current Puzzle Collection experience is defined by `main.js`, `src/puzzles/manifest.js`, and `src/puzzles/types/`.

When updating levels or rules, use those files as the source of truth for the live app.
