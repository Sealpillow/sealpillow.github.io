// Standalone level verification tool for authoring src/puzzles/claude-levels.json by hand,
// per level-creation-rulebook.md's design loop: solve-count, redundancy audit, branching check.
//
// Usage:
//   node scripts/verify-level.mjs path/to/candidate.json        (single puzzle object)
//   node scripts/verify-level.mjs path/to/candidates.json       (array of puzzle objects)
//
// Prints, per puzzle: solution count (capped), a redundancy audit (strip each active mechanic
// field, one at a time, and recount), and a branching check (strip everything except
// blockedEdges/start/exits and recount).

import { readFileSync } from 'node:fs';
import { Grid } from '../src/engine/Grid.js';
import { validateSolution, isEdgeBlocked } from '../src/engine/Validator.js';
import { transformNode } from '../src/engine/Symmetry.js';

const MECHANIC_FIELDS = [
  'dots',
  'blockedEdges',
  'requiredEdges',
  'triangles',
  'cellColors',
  'stars',
  'eliminators',
  'polyominoes',
  'symmetry',
];

// maxExpansions is a hard safety budget on DFS calls, independent of the solution cap — an
// open board with few blockedEdges has an astronomically large self-avoiding-walk count long
// before `cap` solutions are ever found, so without this a wide-open 6x6+ grid can run for a
// very long time (or effectively hang) enumerating dead-end paths that never reach an exit.
export function countSolutions(puzzle, cap = 1000, maxExpansions = 400000) {
  const grid = new Grid(puzzle.width, puzzle.height);
  let count = 0;
  let hitCap = false;
  let truncated = false;
  let expansions = 0;

  const startCandidates = [puzzle.start];
  if (puzzle.symmetry) {
    const mirrored = transformNode(puzzle.symmetry, grid, puzzle.start);
    if (grid.nodeKey(mirrored) !== grid.nodeKey(puzzle.start)) startCandidates.push(mirrored);
  }

  const exitKeys = new Set((puzzle.exits || []).map((e) => grid.nodeKey(e)));
  if (puzzle.symmetry) {
    for (const e of puzzle.exits || []) exitKeys.add(grid.nodeKey(transformNode(puzzle.symmetry, grid, e)));
  }

  function neighborsOf([c, r]) {
    const candidates = [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]];
    return candidates.filter(([nc, nr]) => nc >= 0 && nc <= puzzle.width && nr >= 0 && nr <= puzzle.height);
  }

  function stop() {
    return hitCap || truncated;
  }

  for (const start of startCandidates) {
    if (stop()) break;
    const path = [start];
    const seen = new Set([grid.nodeKey(start)]);

    (function dfs() {
      if (stop()) return;
      expansions++;
      if (expansions > maxExpansions) {
        truncated = true;
        return;
      }
      const cur = path[path.length - 1];
      if (path.length >= 2 && exitKeys.has(grid.nodeKey(cur))) {
        if (validateSolution(grid, puzzle, path)) {
          count++;
          if (count >= cap) {
            hitCap = true;
            return;
          }
        }
      }
      for (const nb of neighborsOf(cur)) {
        if (stop()) return;
        const key = grid.nodeKey(nb);
        if (seen.has(key)) continue;
        if (isEdgeBlocked(grid, puzzle, cur, nb)) continue;
        seen.add(key);
        path.push(nb);
        dfs();
        path.pop();
        seen.delete(key);
      }
    })();
  }

  return { count, hitCap, truncated };
}

export function redundancyAudit(puzzle, cap = 1000, maxExpansions = 400000) {
  const baseline = countSolutions(puzzle, cap, maxExpansions);
  const results = {};
  for (const field of MECHANIC_FIELDS) {
    if (field === 'symmetry') {
      if (!puzzle.symmetry) continue;
      const stripped = { ...puzzle };
      delete stripped.symmetry;
      results.symmetry = { ...countSolutions(stripped, cap, maxExpansions), stripped: true };
      continue;
    }
    const value = puzzle[field];
    if (!value || (Array.isArray(value) && value.length === 0)) continue;
    const stripped = { ...puzzle };
    delete stripped[field];
    results[field] = { ...countSolutions(stripped, cap, maxExpansions), stripped: true };
  }
  return { baseline, perMechanic: results };
}

export function branchingCheck(puzzle, cap = 1500, maxExpansions = 600000) {
  const raw = {
    id: puzzle.id,
    width: puzzle.width,
    height: puzzle.height,
    start: puzzle.start,
    exits: puzzle.exits,
    blockedEdges: puzzle.blockedEdges || [],
  };
  return countSolutions(raw, cap, maxExpansions);
}

export function verifyPuzzle(puzzle, { cap = 1000, branchingCap = 1500, maxExpansions = 400000 } = {}) {
  const baseline = countSolutions(puzzle, cap, maxExpansions);
  const audit = redundancyAudit(puzzle, cap, maxExpansions);
  const branching = branchingCheck(puzzle, branchingCap, Math.max(maxExpansions, 600000));

  const flatIssues = [];
  for (const [field, result] of Object.entries(audit.perMechanic)) {
    if (result.truncated) {
      // A truncated strip-result is a lower bound, not exact — and since removing a mechanic
      // (fewer constraints) can only add solutions relative to baseline, never remove them,
      // a truncated count that happens to equal (or fall short of) baseline is inconclusive,
      // not proof of redundancy. Only flag when the search actually finished.
      flatIssues.push(
        `inconclusive: stripping "${field}" hit the expansion budget at ${result.count} (lower bound only) — ` +
          `re-run with a higher maxExpansions to get a real redundancy verdict`
      );
    } else if (result.count === baseline.count) {
      flatIssues.push(`redundant: stripping "${field}" leaves solution count unchanged (${baseline.count})`);
    }
  }
  if ((puzzle.blockedEdges || []).length > 0 && branching.count === baseline.count) {
    flatIssues.push(`no real branching: raw maze-only count (${branching.count}) equals final count (${baseline.count})`);
  }
  if (baseline.count === 0) flatIssues.push('UNSOLVABLE: zero valid solutions found');
  if (baseline.truncated) {
    flatIssues.push(
      'TRUNCATED: hit the DFS expansion safety budget before finishing — solution count is a ' +
        'lower bound, not exact. Board is likely too open for this solver cap; add more ' +
        'blockedEdges/constraints or raise maxExpansions.'
    );
  }

  return { id: puzzle.id, baseline, audit, branching, issues: flatIssues };
}

function note(result) {
  if (result.truncated) return ' (TRUNCATED — lower bound only, see ISSUE)';
  if (result.hitCap) return ' (CAPPED)';
  return '';
}

function main() {
  const file = process.argv[2];
  const cap = process.argv[3] ? parseInt(process.argv[3], 10) : undefined;
  const maxExpansions = process.argv[4] ? parseInt(process.argv[4], 10) : undefined;
  if (!file) {
    console.error('Usage: node scripts/verify-level.mjs <file.json> [cap] [maxExpansions]');
    process.exit(1);
  }
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const puzzles = Array.isArray(data) ? data : [data];
  const opts = {};
  if (cap) opts.cap = cap;
  if (maxExpansions) opts.maxExpansions = maxExpansions;

  let anyIssues = false;
  for (const puzzle of puzzles) {
    const report = verifyPuzzle(puzzle, opts);
    console.log(`\n=== ${report.id || '(no id)'} ===`);
    console.log(`solutions: ${report.baseline.count}${note(report.baseline)}`);
    console.log(`raw branching (blockedEdges only): ${report.branching.count}${note(report.branching)}`);
    for (const [field, result] of Object.entries(report.audit.perMechanic)) {
      console.log(`  strip ${field}: ${result.count}${note(result)}`);
    }
    if (report.issues.length) {
      anyIssues = true;
      for (const issue of report.issues) console.log(`  ISSUE: ${issue}`);
    } else {
      console.log('  OK: no redundancy, real branching present');
    }
  }
  process.exit(anyIssues ? 1 : 0);
}

if (process.argv[1] && process.argv[1].endsWith('verify-level.mjs')) {
  main();
}
