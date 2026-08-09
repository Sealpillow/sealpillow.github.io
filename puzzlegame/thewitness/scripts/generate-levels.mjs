// CLI entry point for (re)generating the standard level collection (levels 1-200).
// Usage: node scripts/generate-levels.mjs [--seed N]
//
// All actual generation logic lives in level-generator.mjs (browser-safe, no fs/process)
// so the same code can run headless outside Node if ever needed.
import { writeFileSync } from 'node:fs';
import { setRng, mulberry32, generateAll } from './level-generator.mjs';

const OUTPUT_PATH = new URL('../src/puzzles/levels.json', import.meta.url);
const SEED = process.env.SEED ? Number(process.env.SEED) : 20260805;

setRng(mulberry32(SEED));

const levels = generateAll({
  onProgress: ({ levelNumber, phase, level }) => {
    console.log(`generated level_${String(levelNumber).padStart(3, '0')} (${phase})`);
  },
});

writeFileSync(OUTPUT_PATH, `${JSON.stringify(levels, null, 2)}\n`, 'utf8');
console.log(`Wrote ${levels.length} levels to ${OUTPUT_PATH.pathname}`);
