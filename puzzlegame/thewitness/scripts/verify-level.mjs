// Standalone level verification tool for authoring puzzle collections.
//
// Supports:
// - single-puzzle verification
// - collection-wide verification
// - focused blocked-edge audits
// - optional JSON / Markdown report output
//
// Examples:
//   node scripts/verify-level.mjs src/puzzles/chatgpt-levels.json
//   node scripts/verify-level.mjs src/puzzles/chatgpt-levels.json --mode blocked-edges
//   node scripts/verify-level.mjs src/puzzles/chatgpt-levels.json --mode blocked-edges --only chatgpt_level_120
//   node scripts/verify-level.mjs src/puzzles/chatgpt-levels.json --json-out out.json --md-out out.md

import { readFileSync, writeFileSync } from 'node:fs';
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

const DEFAULTS = {
  mode: 'full',
  cap: 1000,
  branchingCap: 1500,
  maxExpansions: 400000,
};

// maxExpansions is a hard safety budget on DFS calls, independent of the solution cap - an
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

  const exitKeys = new Set((puzzle.exits || []).map((exit) => grid.nodeKey(exit)));
  if (puzzle.symmetry) {
    for (const exit of puzzle.exits || []) {
      exitKeys.add(grid.nodeKey(transformNode(puzzle.symmetry, grid, exit)));
    }
  }

  function neighborsOf([col, row]) {
    const candidates = [[col + 1, row], [col - 1, row], [col, row + 1], [col, row - 1]];
    return candidates.filter(
      ([nextCol, nextRow]) =>
        nextCol >= 0 && nextCol <= puzzle.width && nextRow >= 0 && nextRow <= puzzle.height
    );
  }

  function shouldStop() {
    return hitCap || truncated;
  }

  for (const start of startCandidates) {
    if (shouldStop()) break;
    const path = [start];
    const seen = new Set([grid.nodeKey(start)]);

    (function dfs() {
      if (shouldStop()) return;
      expansions++;
      if (expansions > maxExpansions) {
        truncated = true;
        return;
      }

      const current = path[path.length - 1];
      if (path.length >= 2 && exitKeys.has(grid.nodeKey(current))) {
        if (validateSolution(grid, puzzle, path)) {
          count++;
          if (count >= cap) {
            hitCap = true;
            return;
          }
        }
      }

      for (const next of neighborsOf(current)) {
        if (shouldStop()) return;
        const key = grid.nodeKey(next);
        if (seen.has(key)) continue;
        if (isEdgeBlocked(grid, puzzle, current, next)) continue;
        seen.add(key);
        path.push(next);
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
  const rawPuzzle = {
    id: puzzle.id,
    width: puzzle.width,
    height: puzzle.height,
    start: puzzle.start,
    exits: puzzle.exits,
    blockedEdges: puzzle.blockedEdges || [],
  };
  return countSolutions(rawPuzzle, cap, maxExpansions);
}

export function verifyPuzzle(
  puzzle,
  { cap = DEFAULTS.cap, branchingCap = DEFAULTS.branchingCap, maxExpansions = DEFAULTS.maxExpansions } = {}
) {
  const baseline = countSolutions(puzzle, cap, maxExpansions);
  const audit = redundancyAudit(puzzle, cap, maxExpansions);
  const branching = branchingCheck(puzzle, branchingCap, Math.max(maxExpansions, 600000));

  const issues = [];
  for (const [field, result] of Object.entries(audit.perMechanic)) {
    if (result.truncated) {
      issues.push(
        `inconclusive: stripping "${field}" hit the expansion budget at ${result.count} (lower bound only) - ` +
          're-run with a higher maxExpansions to get a real redundancy verdict'
      );
    } else if (result.count === baseline.count) {
      issues.push(`redundant: stripping "${field}" leaves solution count unchanged (${baseline.count})`);
    }
  }

  if ((puzzle.blockedEdges || []).length > 0 && !baseline.truncated && !branching.truncated && branching.count === baseline.count) {
    issues.push(`no real branching: raw maze-only count (${branching.count}) equals final count (${baseline.count})`);
  }
  if (baseline.count === 0) issues.push('UNSOLVABLE: zero valid solutions found');
  if (baseline.truncated) {
    issues.push(
      'TRUNCATED: hit the DFS expansion safety budget before finishing - solution count is a lower bound, not exact. ' +
        'Board is likely too open for this solver cap; add more blockedEdges/constraints or raise maxExpansions.'
    );
  }

  return { id: puzzle.id, baseline, audit, branching, issues };
}

export function verifyBlockedEdges(
  puzzle,
  { cap = DEFAULTS.cap, branchingCap = DEFAULTS.branchingCap, maxExpansions = DEFAULTS.maxExpansions } = {}
) {
  const blockedEdges = puzzle.blockedEdges || [];
  if (blockedEdges.length === 0) {
    return {
      id: puzzle.id,
      size: `${puzzle.width}x${puzzle.height}`,
      blockedEdges: 0,
      skipped: true,
      issues: [],
    };
  }

  const baseline = countSolutions(puzzle, cap, maxExpansions);
  const stripped = { ...puzzle };
  delete stripped.blockedEdges;
  const noBlocked = countSolutions(stripped, cap, maxExpansions);
  const raw = branchingCheck(puzzle, branchingCap, Math.max(maxExpansions, 450000));

  const redundantBlockedEdges =
    !baseline.truncated && !noBlocked.truncated && baseline.count === noBlocked.count;
  const mazeDominant =
    !baseline.truncated && !raw.truncated && baseline.count === raw.count;

  const issues = [];
  if (baseline.truncated || noBlocked.truncated || raw.truncated) {
    issues.push('inconclusive: one or more blocked-edge checks hit the expansion budget');
  }
  if (redundantBlockedEdges) {
    issues.push(
      `redundant blockedEdges: full count ${baseline.count} equals no-blocked count ${noBlocked.count}`
    );
  }
  if (mazeDominant) {
    issues.push(`maze-dominant blockedEdges: raw count ${raw.count} equals final count ${baseline.count}`);
  }

  return {
    id: puzzle.id,
    size: `${puzzle.width}x${puzzle.height}`,
    blockedEdges: blockedEdges.length,
    baseline,
    noBlocked,
    raw,
    redundantBlockedEdges,
    mazeDominant,
    issues,
  };
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const parsed = {
    file: null,
    mode: DEFAULTS.mode,
    cap: DEFAULTS.cap,
    branchingCap: DEFAULTS.branchingCap,
    maxExpansions: DEFAULTS.maxExpansions,
    only: [],
    jsonOut: null,
    mdOut: null,
  };

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];

    if (!arg.startsWith('--') && parsed.file === null) {
      parsed.file = arg;
      continue;
    }

    if (arg === '--mode') {
      parsed.mode = args[++index];
      continue;
    }
    if (arg === '--cap') {
      parsed.cap = parseInt(args[++index], 10);
      continue;
    }
    if (arg === '--branching-cap') {
      parsed.branchingCap = parseInt(args[++index], 10);
      continue;
    }
    if (arg === '--max-expansions') {
      parsed.maxExpansions = parseInt(args[++index], 10);
      continue;
    }
    if (arg === '--only') {
      parsed.only.push(...args[++index].split(',').map((part) => part.trim()).filter(Boolean));
      continue;
    }
    if (arg === '--json-out') {
      parsed.jsonOut = args[++index];
      continue;
    }
    if (arg === '--md-out') {
      parsed.mdOut = args[++index];
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!parsed.file) {
    throw new Error(
      'Usage: node scripts/verify-level.mjs <file.json> [--mode full|blocked-edges] ' +
        '[--cap N] [--branching-cap N] [--max-expansions N] [--only id[,id2]] ' +
        '[--json-out path] [--md-out path]'
    );
  }
  if (!['full', 'blocked-edges'].includes(parsed.mode)) {
    throw new Error(`Unsupported mode: ${parsed.mode}`);
  }

  return parsed;
}

function loadPuzzles(file) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  return Array.isArray(data) ? data : [data];
}

function filterPuzzles(puzzles, only) {
  if (!only.length) return puzzles;
  return puzzles.filter((puzzle) => only.includes(puzzle.id));
}

function note(result) {
  if (result.truncated) return ' (TRUNCATED - lower bound only, see ISSUE)';
  if (result.hitCap) return ' (CAPPED)';
  return '';
}

function runFullVerification(puzzles, options) {
  const reports = puzzles.map((puzzle) => verifyPuzzle(puzzle, options));
  const issueCount = reports.reduce((count, report) => count + report.issues.length, 0);
  return {
    mode: 'full',
    summary: {
      totalPuzzles: reports.length,
      puzzlesWithIssues: reports.filter((report) => report.issues.length > 0).length,
      totalIssues: issueCount,
    },
    reports,
    hasIssues: issueCount > 0,
  };
}

function runBlockedEdgeAudit(puzzles, options) {
  const reports = puzzles.map((puzzle) => verifyBlockedEdges(puzzle, options));
  const audited = reports.filter((report) => !report.skipped);
  const redundant = audited.filter((report) => report.redundantBlockedEdges);
  const mazeDominant = audited.filter((report) => report.mazeDominant);
  const inconclusive = audited.filter((report) =>
    report.issues.some((issue) => issue.startsWith('inconclusive'))
  );

  return {
    mode: 'blocked-edges',
    summary: {
      totalPuzzles: reports.length,
      withBlockedEdges: audited.length,
      redundantBlockedEdges: redundant.length,
      mazeDominant: mazeDominant.length,
      inconclusive: inconclusive.length,
    },
    reports,
    hasIssues: redundant.length > 0 || mazeDominant.length > 0 || inconclusive.length > 0,
  };
}

function printFullResult(result) {
  console.log(`Mode: ${result.mode}`);
  console.log(`Puzzles checked: ${result.summary.totalPuzzles}`);
  console.log(`Puzzles with issues: ${result.summary.puzzlesWithIssues}`);
  console.log(`Total issues: ${result.summary.totalIssues}`);

  for (const report of result.reports) {
    console.log(`\n=== ${report.id || '(no id)'} ===`);
    console.log(`solutions: ${report.baseline.count}${note(report.baseline)}`);
    console.log(`raw branching (blockedEdges only): ${report.branching.count}${note(report.branching)}`);
    for (const [field, entry] of Object.entries(report.audit.perMechanic)) {
      console.log(`  strip ${field}: ${entry.count}${note(entry)}`);
    }
    if (report.issues.length) {
      for (const issue of report.issues) console.log(`  ISSUE: ${issue}`);
    } else {
      console.log('  OK: no redundancy, real branching present');
    }
  }
}

function printBlockedEdgeResult(result) {
  console.log(`Mode: ${result.mode}`);
  console.log(`Puzzles checked: ${result.summary.totalPuzzles}`);
  console.log(`With blockedEdges: ${result.summary.withBlockedEdges}`);
  console.log(`Redundant blockedEdges: ${result.summary.redundantBlockedEdges}`);
  console.log(`Maze-dominant blockedEdges: ${result.summary.mazeDominant}`);
  console.log(`Inconclusive: ${result.summary.inconclusive}`);

  const flagged = result.reports.filter((report) => report.issues.length > 0);
  if (!flagged.length) {
    console.log('\nOK: no blocked-edge issues found');
    return;
  }

  for (const report of flagged) {
    console.log(`\n=== ${report.id || '(no id)'} ===`);
    console.log(`size: ${report.size}`);
    console.log(`blockedEdges: ${report.blockedEdges}`);
    console.log(`solutions: ${report.baseline.count}${note(report.baseline)}`);
    console.log(`raw branching: ${report.raw.count}${note(report.raw)}`);
    console.log(`without blockedEdges: ${report.noBlocked.count}${note(report.noBlocked)}`);
    for (const issue of report.issues) console.log(`  ISSUE: ${issue}`);
  }
}

function renderFullMarkdown(result, sourceFile) {
  const lines = [
    '# Level Verification Report',
    '',
    `Source: \`${sourceFile}\``,
    `Mode: \`${result.mode}\``,
    '',
    '## Summary',
    '',
    `- Puzzles checked: \`${result.summary.totalPuzzles}\``,
    `- Puzzles with issues: \`${result.summary.puzzlesWithIssues}\``,
    `- Total issues: \`${result.summary.totalIssues}\``,
    '',
  ];

  for (const report of result.reports) {
    lines.push(`## ${report.id || '(no id)'}`);
    lines.push('');
    lines.push(`- Solutions: \`${report.baseline.count}\`${note(report.baseline)}`);
    lines.push(`- Raw branching: \`${report.branching.count}\`${note(report.branching)}`);
    lines.push('');
    lines.push('| Mechanic stripped | Count |');
    lines.push('|---|---:|');
    for (const [field, entry] of Object.entries(report.audit.perMechanic)) {
      lines.push(`| \`${field}\` | \`${entry.count}${note(entry)}\` |`);
    }
    lines.push('');
    if (report.issues.length) {
      lines.push('Issues:');
      report.issues.forEach((issue) => lines.push(`- ${issue}`));
    } else {
      lines.push('- OK: no redundancy, real branching present');
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function renderBlockedEdgeMarkdown(result, sourceFile) {
  const flagged = result.reports.filter((report) => report.issues.length > 0);
  const lines = [
    '# Blocked-Edge Audit Report',
    '',
    `Source: \`${sourceFile}\``,
    `Mode: \`${result.mode}\``,
    '',
    '## Summary',
    '',
    `- Puzzles checked: \`${result.summary.totalPuzzles}\``,
    `- With blockedEdges: \`${result.summary.withBlockedEdges}\``,
    `- Redundant blockedEdges: \`${result.summary.redundantBlockedEdges}\``,
    `- Maze-dominant blockedEdges: \`${result.summary.mazeDominant}\``,
    `- Inconclusive: \`${result.summary.inconclusive}\``,
    '',
    '## Flagged Levels',
    '',
    '| Level | Size | Blocked edges | Solutions | Raw branching | Without blocked edges | Issues |',
    '|---|---:|---:|---:|---:|---:|---|',
  ];

  if (!flagged.length) {
    lines.push('| None | - | - | - | - | - | - |');
  } else {
    for (const report of flagged) {
      lines.push(
        `| \`${report.id}\` | \`${report.size}\` | ${report.blockedEdges} | ${report.baseline.count} | ${report.raw.count} | ${report.noBlocked.count} | ${report.issues.join('; ')} |`
      );
    }
  }

  return `${lines.join('\n')}\n`;
}

function writeReports(result, sourceFile, jsonOut, mdOut) {
  if (jsonOut) {
    writeFileSync(jsonOut, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }

  if (mdOut) {
    const markdown =
      result.mode === 'blocked-edges'
        ? renderBlockedEdgeMarkdown(result, sourceFile)
        : renderFullMarkdown(result, sourceFile);
    writeFileSync(mdOut, markdown, 'utf8');
  }
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  const puzzles = filterPuzzles(loadPuzzles(args.file), args.only);
  if (puzzles.length === 0) {
    console.error('No puzzles matched the requested filters.');
    process.exit(1);
  }

  const options = {
    cap: args.cap,
    branchingCap: args.branchingCap,
    maxExpansions: args.maxExpansions,
  };

  const result =
    args.mode === 'blocked-edges'
      ? runBlockedEdgeAudit(puzzles, options)
      : runFullVerification(puzzles, options);

  if (args.mode === 'blocked-edges') {
    printBlockedEdgeResult(result);
  } else {
    printFullResult(result);
  }

  writeReports(result, args.file, args.jsonOut, args.mdOut);
  process.exit(result.hasIssues ? 1 : 0);
}

if (process.argv[1] && process.argv[1].endsWith('verify-level.mjs')) {
  main();
}
