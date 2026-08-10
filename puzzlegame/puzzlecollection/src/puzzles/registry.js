import { createToggleSwitchesController } from './types/toggleSwitches.js';
import { createRotationPathController } from './types/rotationPath.js';
import { createMemorySequenceController } from './types/memorySequence.js?v=2';
import { createMirrorReflectionController } from './types/mirrorReflection.js';
import { createNumberTraceController } from './types/numberTrace.js';
import { createChimpTestController } from './types/chimpTest.js';

const registry = {
  'toggle-switches': createToggleSwitchesController,
  'rotation-path': createRotationPathController,
  'memory-sequence': createMemorySequenceController,
  'mirror-reflection': createMirrorReflectionController,
  'number-trace': createNumberTraceController,
  'chimp-test': createChimpTestController,
};

export function createPuzzleController(type, deps) {
  const factory = registry[type];
  if (!factory) {
    throw new Error(`Unknown puzzle type: ${type}`);
  }
  return factory(deps);
}
