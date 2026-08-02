import fs from 'node:fs';
import { Grid } from '../src/engine/Grid.js';
import { computeRegions } from '../src/engine/Regions.js';
import { findSolutionPath } from '../src/engine/Solver.js';
import { validateSolution } from '../src/engine/Validator.js';

const INPUT_PATH = new URL('../src/puzzles/codex-levels.json', import.meta.url);
const OUTPUT_PATH = new URL('../src/puzzles/codex-levels.json', import.meta.url);

function cellKey([col, row]) {
  return `${col},${row}`;
}

function groupNumberedRegions(level, regions) {
  const groups = [];
  for (const region of regions) {
    const numbered = (level.regionSizes || []).filter(([col, row]) =>
      region.some(([regionCol, regionRow]) => regionCol === col && regionRow === row)
    );
    if (numbered.length > 0) groups.push({ region, numbered });
  }
  return groups;
}

function collectOccupiedCells(level) {
  const occupied = new Set();
  for (const [col, row] of level.triangles || []) occupied.add(`${col},${row}`);
  for (const [col, row] of level.cellColors || []) occupied.add(`${col},${row}`);
  for (const [col, row] of level.stars || []) occupied.add(`${col},${row}`);
  for (const [col, row] of level.eliminators || []) occupied.add(`${col},${row}`);
  for (const [col, row] of level.polyominoes || []) occupied.add(`${col},${row}`);
  return occupied;
}

function splitIntoTwoToFive(total, requireMultiple = false) {
  if (total < 2) return null;

  const memo = new Map();
  function dfs(remaining, needMultiple) {
    const key = `${remaining}:${needMultiple}`;
    if (memo.has(key)) return memo.get(key);
    if (remaining === 0) return [[]];

    const partitions = [];
    for (const value of [5, 4, 3, 2]) {
      if (value > remaining) continue;
      if (remaining - value === 1) continue;
      for (const rest of dfs(remaining - value, false)) {
        const candidate = [value, ...rest];
        if (needMultiple && candidate.length < 2) continue;
        partitions.push(candidate);
      }
    }

    memo.set(key, partitions);
    return partitions;
  }

  const partitions = dfs(total, requireMultiple);
  if (partitions.length === 0) return null;

  partitions.sort((a, b) => {
    if (a.length !== b.length) return b.length - a.length;
    const spreadA = Math.max(...a) - Math.min(...a);
    const spreadB = Math.max(...b) - Math.min(...b);
    if (spreadA !== spreadB) return spreadA - spreadB;
    return a.join(',').localeCompare(b.join(','));
  });

  return partitions[0];
}

function chooseReplacementRegions(level, regions, existingGroups, occupiedCells) {
  const targetCount = existingGroups.length;
  const preserved = existingGroups.filter(({ region }) => region.length >= 2);
  if (preserved.length >= targetCount) return preserved.slice(0, targetCount);

  const used = new Set(preserved.map(({ region }) => JSON.stringify(region)));
  const extras = regions
    .filter((region) => region.length >= 2)
    .map((region) => ({
      region,
      numbered: [],
      freeCount: region.filter((cell) => !occupiedCells.has(cellKey(cell))).length,
    }))
    .filter(({ region, freeCount }) => freeCount >= 1 && !used.has(JSON.stringify(region)))
    .sort((a, b) => a.region.length - b.region.length);

  const chosen = [...preserved];
  for (const extra of extras) {
    if (chosen.length >= targetCount) break;
    chosen.push({ region: extra.region, numbered: [] });
  }
  return chosen;
}

function rewriteLevelRegionSizes(level) {
  const path = findSolutionPath(level, 800000);
  if (!path) throw new Error(`No solution found for ${level.id}`);

  const grid = new Grid(level.width, level.height);
  const regions = computeRegions(grid, level, path);
  const existingGroups = groupNumberedRegions(level, regions);
  const occupiedCells = collectOccupiedCells(level);
  const targetGroups = chooseReplacementRegions(level, regions, existingGroups, occupiedCells);

  if (targetGroups.length !== existingGroups.length) {
    throw new Error(`Could not find enough replacement regions for ${level.id}`);
  }

  const newEntries = [];
  for (const group of targetGroups) {
    const region = group.region;
    const freeCells = region
      .filter((cell) => !occupiedCells.has(cellKey(cell)))
      .sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]));

    const existingCells = group.numbered
      .map(([col, row]) => [col, row])
      .filter((cell) => freeCells.some((candidate) => candidate[0] === cell[0] && candidate[1] === cell[1]));

    const requireMultiple = region.length > 5;
    const numbers =
      region.length <= 5 && !requireMultiple
        ? [region.length]
        : splitIntoTwoToFive(region.length, requireMultiple);
    if (!numbers) throw new Error(`Could not partition region size ${region.length} in ${level.id}`);
    if (freeCells.length < numbers.length) {
      throw new Error(`Not enough free cells for ${level.id} region size ${region.length}`);
    }

    const chosenCells = [];
    for (const cell of existingCells) {
      if (chosenCells.length >= numbers.length) break;
      chosenCells.push(cell);
    }
    for (const cell of freeCells) {
      if (chosenCells.length >= numbers.length) break;
      if (chosenCells.some(([col, row]) => col === cell[0] && row === cell[1])) continue;
      chosenCells.push(cell);
    }

    for (let i = 0; i < numbers.length; i++) {
      newEntries.push([chosenCells[i][0], chosenCells[i][1], numbers[i]]);
    }
  }

  const rewritten = { ...level, regionSizes: newEntries };
  if (!validateSolution(grid, rewritten, path)) {
    throw new Error(`Rewritten region sizes no longer validate for ${level.id}`);
  }
  return rewritten;
}

function main() {
  const levels = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
  const rewritten = levels.map((level) =>
    level.regionSizes?.length ? rewriteLevelRegionSizes(level) : level
  );

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(rewritten, null, 2) + '\n');

  const values = [...new Set(
    rewritten.flatMap((level) => (level.regionSizes || []).map(([, , value]) => value))
  )].sort((a, b) => a - b);
  console.log(`Normalized region sizes to values: ${values.join(', ')}`);
}

main();

