# Puzzle Collection

`Puzzle Collection` is a browser-based puzzle hub built as a single static app. Instead of one maze campaign, it now groups multiple puzzle families into separate level collections, each with its own progression, pagination, and custom puzzle flow.

## Current puzzle families

The in-app collection currently ships with 6 puzzle families and 50 levels per family:

1. `Toggle Switches`
2. `Rotation Path`
3. `Memory Sequence`
4. `Mirror Reflection`
5. `Number Trace`
6. `Chimpanzee Test`

That gives the app 300 in-app levels total.

The selection screen also includes a standalone launcher card for `The Witness`, but that app lives in its own separate project and is not part of the in-app level manifest or save progression.

## How the app behaves

- The home screen is a cabinet selector, not a flat global level list.
- The selection screen paginates puzzle types at 4 cabinets per page.
- Clicking a puzzle type drills straight into that type's collection.
- While inside a collection, the lower navigation shows only that collection's levels.
- Level pagination inside a collection shows 10 levels per page.
- Solves and unlocks are tracked per puzzle type.
- In debug mode, every level is unlocked and opening a type starts from level 1.

## Puzzle family overview

### Toggle Switches

Click switches until every lamp is ON. Each switch flips itself and linked neighbors.

- Built from adjacency-based switch networks.
- Early levels use smaller boards.
- Custom mode supports width `3-4` and height `2-4`.

### Rotation Path

Rotate path pieces until a single route connects the left-side `IN` marker to the right-side `OUT` marker.

- Uses empty cells, straight pieces, and elbow pieces.
- Progression increases board size and route complexity.
- Custom mode supports width `4-7` and height `3-5`.

### Memory Sequence

Watch a flashing sequence, then repeat it exactly from the start of the round.

- Uses a clean single-color tile style.
- Boards grow from 4 pads up to 9 pads.
- Custom mode supports width `2-3`, height `2-3`, and `2-6` rounds.

### Mirror Reflection

Rotate mirrors so the beam travels from the source to the target.

- Larger boards intentionally use fewer mirrors and more blockers to increase difficulty.
- The beam updates live after every move.
- Custom mode supports width `5-7` and height `5-7`.

### Number Trace

The game shows numbered positions briefly, then hides them. The player must tap them back in ascending order.

- Includes configurable preview timing.
- Uses larger boards and more target positions in later levels.
- Custom mode supports width `3-5`, height `3-5`, trace count `3-9`, and preview time `700-2200 ms`.

### Chimpanzee Test

Numbers stay visible until the player taps `1`. After that, the remaining numbers hide and must be finished in ascending order.

- Inspired by chimp-style memory tests.
- Difficulty scales through larger boards and higher number counts.
- Custom mode supports width `3-6`, height `3-6`, and number count `4-12`.

## Running the project

This project is a static HTML/CSS/JS app.

### Option 1: open directly

Open [index.html](C:/Users/luata/Desktop/PuzzleGame/puzzlecollection/index.html) in a browser.

### Option 2: serve locally

If your browser blocks module loading from `file://`, serve the folder locally with any simple static server.

Example:

```powershell
cd C:\Users\luata\Desktop\PuzzleGame\puzzlecollection
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Debug and deep-link params

The app reads URL params from [main.js](C:/Users/luata/Desktop/PuzzleGame/puzzlecollection/main.js):

- `?debug=1`
  Unlocks all levels.
- `?type=rotation-path`
  Opens a specific puzzle family.
- `?puzzle=120`
  Opens a specific global puzzle index from the manifest.

Examples:

- `index.html?debug=1`
- `index.html?debug=1&type=memory-sequence`
- `index.html?puzzle=0`

## Save data

Progress is stored in `localStorage` through [src/save/SaveManager.js](C:/Users/luata/Desktop/PuzzleGame/puzzlecollection/src/save/SaveManager.js).

- Save key: `puzzle-cabinet-save-v1`
- Completed levels are tracked by level id.
- Unlock progression is tracked per puzzle type in `unlockedByType`.

Normal flow unlocks the next level only within the same puzzle family.

## Project structure

- [index.html](C:/Users/luata/Desktop/PuzzleGame/puzzlecollection/index.html): main shell, overlays, custom puzzle modals
- [main.js](C:/Users/luata/Desktop/PuzzleGame/puzzlecollection/main.js): app flow, selection UI, pagination, debug params, custom puzzle launching
- [style.css](C:/Users/luata/Desktop/PuzzleGame/puzzlecollection/style.css): app styling
- [src/puzzles/manifest.js](C:/Users/luata/Desktop/PuzzleGame/puzzlecollection/src/puzzles/manifest.js): generated level collections and custom puzzle builders
- [src/puzzles/registry.js](C:/Users/luata/Desktop/PuzzleGame/puzzlecollection/src/puzzles/registry.js): puzzle-type controller registry
- [src/puzzles/types/](C:/Users/luata/Desktop/PuzzleGame/puzzlecollection/src/puzzles/types): individual puzzle controllers
- [src/save/SaveManager.js](C:/Users/luata/Desktop/PuzzleGame/puzzlecollection/src/save/SaveManager.js): save/load/unlock logic

If you continue evolving `Puzzle Collection`, treat `main.js`, `style.css`, `src/puzzles/manifest.js`, and `src/puzzles/types/` as the primary gameplay implementation.
