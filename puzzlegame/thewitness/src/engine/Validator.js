import { combinedTraveledNodes, combinedTraveledEdges, computeRegions } from './Regions.js';
import { satisfiesEliminators, findInvalidEliminatorSymbols } from './Eliminators.js';
import { satisfiesPolyominoes, findInvalidPolyominoCells } from './Polyominoes.js';
import { mirrorPath, satisfiesSymmetry, transformNode } from './Symmetry.js';

const nodeConstraintCache = new WeakMap();

export function isEdgeBlocked(grid, puzzle, a, b) {
  const key = grid.edgeKey(a, b);
  return (puzzle.blockedEdges || []).some((edge) => grid.edgeKey(edge[0], edge[1]) === key);
}

export function isValidStartNode(grid, puzzle, node) {
  const startKeys = new Set([grid.nodeKey(puzzle.start)]);
  if (puzzle.symmetry) {
    startKeys.add(grid.nodeKey(transformNode(puzzle.symmetry, grid, puzzle.start)));
  }
  return startKeys.has(grid.nodeKey(node));
}

export function isValidPath(grid, puzzle, path) {
  if (path.length < 2) return false;
  if (!isValidStartNode(grid, puzzle, path[0])) return false;

  const seen = new Set([grid.nodeKey(path[0])]);
  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1];
    const curr = path[i];
    if (!grid.isAdjacent(prev, curr)) return false;
    if (isEdgeBlocked(grid, puzzle, prev, curr)) return false;
    const key = grid.nodeKey(curr);
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

export function reachesExit(grid, puzzle, path) {
  const [lc, lr] = path[path.length - 1];
  const exitKeys = new Set((puzzle.exits || []).map(([ec, er]) => `${ec},${er}`));
  if (puzzle.symmetry) {
    for (const exit of puzzle.exits || []) {
      const [mc, mr] = transformNode(puzzle.symmetry, grid, exit);
      exitKeys.add(`${mc},${mr}`);
    }
  }
  return exitKeys.has(`${lc},${lr}`);
}

export function passesAllDots(grid, puzzle, path) {
  const dots = puzzle.dots || [];
  if (dots.length === 0) return true;
  const visited = combinedTraveledNodes(grid, puzzle, path);
  return dots.every((dot) => visited.has(grid.nodeKey(dot)));
}

function nodeBehaviorForSegment(prev, next) {
  if (!prev || !next) return null;
  if (prev[0] === next[0]) return 'vertical';
  if (prev[1] === next[1]) return 'horizontal';
  return 'turn';
}

function buildVisitedNodeBehaviors(grid, puzzle, path) {
  const behaviors = new Map();
  const paths = [path];
  if (puzzle.symmetry) paths.push(mirrorPath(puzzle.symmetry, grid, path));

  for (const currentPath of paths) {
    for (let i = 1; i < currentPath.length - 1; i++) {
      const key = grid.nodeKey(currentPath[i]);
      const behavior = nodeBehaviorForSegment(currentPath[i - 1], currentPath[i + 1]);
      if (behavior) behaviors.set(key, behavior);
    }
  }

  return behaviors;
}

function directionBetween([fromCol, fromRow], [toCol, toRow]) {
  if (toCol > fromCol) return 'right';
  if (toCol < fromCol) return 'left';
  if (toRow > fromRow) return 'down';
  if (toRow < fromRow) return 'up';
  return null;
}

function isHorizontalDirection(direction) {
  return direction === 'left' || direction === 'right';
}

function isVerticalDirection(direction) {
  return direction === 'up' || direction === 'down';
}

function getCornerOrientationDirections(orientation) {
  return {
    ur: ['up', 'right'],
    ul: ['up', 'left'],
    dr: ['down', 'right'],
    dl: ['down', 'left'],
  }[orientation] || null;
}

function getNodeConstraintMap(puzzle) {
  let cached = nodeConstraintCache.get(puzzle);
  if (cached) return cached;

  const constraints = new Map();
  for (const node of puzzle.turnNodes || []) {
    constraints.set(`${node[0]},${node[1]}`, { type: 'turn' });
  }
  for (const node of puzzle.straightNodes || []) {
    constraints.set(`${node[0]},${node[1]}`, { type: 'straight' });
  }
  for (const node of puzzle.horizontalNodes || []) {
    constraints.set(`${node[0]},${node[1]}`, { type: 'horizontal' });
  }
  for (const node of puzzle.verticalNodes || []) {
    constraints.set(`${node[0]},${node[1]}`, { type: 'vertical' });
  }
  for (const [col, row, orientation] of puzzle.cornerNodes || []) {
    constraints.set(`${col},${row}`, { type: 'corner', orientation });
  }

  nodeConstraintCache.set(puzzle, constraints);
  return constraints;
}

function getNodeConstraint(puzzle, node) {
  return getNodeConstraintMap(puzzle).get(`${node[0]},${node[1]}`) || null;
}

function nodeDirectionsForState(prev, curr, next) {
  const directions = [];
  if (prev) {
    const incoming = directionBetween(curr, prev);
    if (incoming) directions.push(incoming);
  }
  if (next) {
    const outgoing = directionBetween(curr, next);
    if (outgoing) directions.push(outgoing);
  }
  return directions;
}

function nodeConstraintAllowsState(constraint, prev, curr, next) {
  if (!constraint) return true;

  const directions = nodeDirectionsForState(prev, curr, next);
  if (directions.length === 0) return true;

  switch (constraint.type) {
    case 'horizontal':
      if (!directions.every(isHorizontalDirection)) return false;
      if (!prev || !next) return true;
      return nodeBehaviorForSegment(prev, next) === 'horizontal';
    case 'vertical':
      if (!directions.every(isVerticalDirection)) return false;
      if (!prev || !next) return true;
      return nodeBehaviorForSegment(prev, next) === 'vertical';
    case 'straight':
      if (!prev || !next) return true;
      return nodeBehaviorForSegment(prev, next) !== 'turn';
    case 'turn':
      if (!prev || !next) return true;
      return nodeBehaviorForSegment(prev, next) === 'turn';
    case 'corner': {
      const required = getCornerOrientationDirections(constraint.orientation);
      if (!required) return false;
      if (directions.length < 2) return directions.every((direction) => required.includes(direction));
      return cornerNodeMatches(new Set(directions), constraint.orientation);
    }
    default:
      return true;
  }
}

function mirroredNodeState(grid, symmetry, prev, curr, next) {
  return {
    prev: prev ? transformNode(symmetry, grid, prev) : null,
    curr: transformNode(symmetry, grid, curr),
    next: next ? transformNode(symmetry, grid, next) : null,
  };
}

function isConstrainedNodeStateAllowed(grid, puzzle, prev, curr, next) {
  return nodeConstraintAllowsState(getNodeConstraint(puzzle, curr), prev, curr, next);
}

export function isNodeTransitionAllowed(grid, puzzle, path, next) {
  if (!path.length) return true;

  const last = path[path.length - 1];
  const prev = path.length > 1 ? path[path.length - 2] : null;
  if (!isConstrainedNodeStateAllowed(grid, puzzle, prev, last, next)) return false;

  if (!puzzle.symmetry) return true;

  const mirroredLastState = mirroredNodeState(grid, puzzle.symmetry, prev, last, next);
  if (!isConstrainedNodeStateAllowed(
    grid,
    puzzle,
    mirroredLastState.prev,
    mirroredLastState.curr,
    mirroredLastState.next
  )) {
    return false;
  }
  return true;
}

function buildVisitedNodeDirections(grid, puzzle, path) {
  const directions = new Map();
  const paths = [path];
  if (puzzle.symmetry) paths.push(mirrorPath(puzzle.symmetry, grid, path));

  for (const currentPath of paths) {
    for (let i = 1; i < currentPath.length - 1; i++) {
      const prev = currentPath[i - 1];
      const curr = currentPath[i];
      const next = currentPath[i + 1];
      const key = grid.nodeKey(curr);
      const incoming = directionBetween(curr, prev);
      const outgoing = directionBetween(curr, next);
      if (!incoming || !outgoing) continue;
      directions.set(key, new Set([incoming, outgoing]));
    }
  }

  return directions;
}

function cornerNodeMatches(directions, orientation) {
  if (!directions || directions.size !== 2) return false;
  const required = getCornerOrientationDirections(orientation);
  if (!required) return false;
  return required.every((direction) => directions.has(direction));
}

export function satisfiesTurnNodes(grid, puzzle, path) {
  const turnNodes = puzzle.turnNodes || [];
  if (turnNodes.length === 0) return true;
  const behaviors = buildVisitedNodeBehaviors(grid, puzzle, path);
  return turnNodes.every((node) => behaviors.get(grid.nodeKey(node)) === 'turn');
}

export function satisfiesStraightNodes(grid, puzzle, path) {
  const straightNodes = puzzle.straightNodes || [];
  if (straightNodes.length === 0) return true;
  const behaviors = buildVisitedNodeBehaviors(grid, puzzle, path);
  return straightNodes.every((node) => {
    const behavior = behaviors.get(grid.nodeKey(node));
    return behavior === 'horizontal' || behavior === 'vertical';
  });
}

export function satisfiesHorizontalNodes(grid, puzzle, path) {
  const horizontalNodes = puzzle.horizontalNodes || [];
  if (horizontalNodes.length === 0) return true;
  const behaviors = buildVisitedNodeBehaviors(grid, puzzle, path);
  return horizontalNodes.every((node) => behaviors.get(grid.nodeKey(node)) === 'horizontal');
}

export function satisfiesVerticalNodes(grid, puzzle, path) {
  const verticalNodes = puzzle.verticalNodes || [];
  if (verticalNodes.length === 0) return true;
  const behaviors = buildVisitedNodeBehaviors(grid, puzzle, path);
  return verticalNodes.every((node) => behaviors.get(grid.nodeKey(node)) === 'vertical');
}

export function satisfiesCornerNodes(grid, puzzle, path) {
  const cornerNodes = puzzle.cornerNodes || [];
  if (cornerNodes.length === 0) return true;
  const directions = buildVisitedNodeDirections(grid, puzzle, path);
  return cornerNodes.every(([col, row, orientation]) =>
    cornerNodeMatches(directions.get(`${col},${row}`), orientation)
  );
}

export function includesRequiredEdges(grid, puzzle, path) {
  const required = puzzle.requiredEdges || [];
  if (required.length === 0) return true;
  const traveled = combinedTraveledEdges(grid, puzzle, path);
  return required.every((edge) => traveled.has(grid.edgeKey(edge[0], edge[1])));
}

export function satisfiesTriangles(grid, puzzle, path) {
  const triangles = puzzle.triangles || [];
  if (triangles.length === 0) return true;
  const traveled = combinedTraveledEdges(grid, puzzle, path);
  return triangles.every(([col, row, count]) => {
    const touching = grid.cellEdges(col, row).filter(([a, b]) => traveled.has(grid.edgeKey(a, b)));
    return touching.length === count;
  });
}

export function satisfiesRegions(grid, puzzle, path) {
  const cellColors = puzzle.cellColors || [];
  if (cellColors.length === 0) return true;
  const colorByCell = new Map(cellColors.map(([col, row, color]) => [`${col},${row}`, color]));

  for (const region of computeRegions(grid, puzzle, path)) {
    const colorsInRegion = new Set(
      region.map(([c, r]) => colorByCell.get(`${c},${r}`)).filter((color) => color !== undefined)
    );
    if (colorsInRegion.size > 1) return false;
  }
  return true;
}

// A star pairs with exactly one other cell of the same color within its region — either another
// star or a plain colored square. This is checked per star-color independently: an unrelated
// cell of a DIFFERENT color in the same region doesn't concern this star at all (that color's own
// squares-uniformity is satisfiesRegions' job, run alongside this, not this function's). Multiple
// different star colors can coexist in one region too, as long as each independently pairs to 2.
export function satisfiesStars(grid, puzzle, path) {
  const stars = puzzle.stars || [];
  if (stars.length === 0) return true;
  const starByCell = new Map(stars.map(([col, row, color]) => [`${col},${row}`, color]));
  const colorByCell = new Map((puzzle.cellColors || []).map(([col, row, color]) => [`${col},${row}`, color]));

  for (const region of computeRegions(grid, puzzle, path)) {
    const starColorsInRegion = new Set(
      region.map(([c, r]) => starByCell.get(`${c},${r}`)).filter((color) => color !== undefined)
    );
    for (const starColor of starColorsInRegion) {
      let matching = 0;
      for (const [c, r] of region) {
        const key = `${c},${r}`;
        const cellColor = starByCell.has(key) ? starByCell.get(key) : colorByCell.get(key);
        if (cellColor === starColor) matching++;
      }
      if (matching !== 2) return false;
    }
  }
  return true;
}

export function satisfiesRegionSizes(grid, puzzle, path) {
  const entries = puzzle.regionSizes || [];
  if (entries.length === 0) return true;
  const valueByCell = new Map(entries.map(([col, row, value]) => [`${col},${row}`, value]));

  for (const region of computeRegions(grid, puzzle, path)) {
    const numberedCells = region
      .map(([col, row]) => {
        const key = `${col},${row}`;
        return valueByCell.has(key) ? { key, value: valueByCell.get(key) } : null;
      })
      .filter((entry) => entry !== null);
    if (numberedCells.length === 0) continue;

    const requiredSize = numberedCells.reduce((sum, entry) => sum + entry.value, 0);
    if (region.length !== requiredSize) return false;
  }
  return true;
}

// Eliminators exempt a triangle/color/star from its normal rule, which satisfiesTriangles/
// satisfiesRegions/satisfiesStars can't account for on their own (triangles in particular have
// no notion of "region" at all). When a puzzle has no eliminators this is identical to running
// the three independent checks, so every existing non-eliminator level is completely unaffected.
function satisfiesRegionMechanics(grid, puzzle, path) {
  if ((puzzle.eliminators || []).length > 0) return satisfiesEliminators(grid, puzzle, path);
  return (
    satisfiesTriangles(grid, puzzle, path) &&
    satisfiesRegions(grid, puzzle, path) &&
    satisfiesStars(grid, puzzle, path)
  );
}

function createFailureSet() {
  return {
    dots: new Set(),
    requiredEdges: new Set(),
    triangles: new Set(),
    cellColors: new Set(),
    stars: new Set(),
    regionSizes: new Set(),
    eliminators: new Set(),
    polyominoes: new Set(),
    turnNodes: new Set(),
    straightNodes: new Set(),
    horizontalNodes: new Set(),
    verticalNodes: new Set(),
    cornerNodes: new Set(),
  };
}

function serializeFailures(failures) {
  return Object.fromEntries(
    Object.entries(failures).map(([key, values]) => [key, [...values]])
  );
}

function mergeFailures(target, source) {
  for (const [key, values] of Object.entries(source)) {
    if (!target[key]) continue;
    values.forEach((value) => target[key].add(value));
  }
}

function findMissingDots(grid, puzzle, path) {
  const visited = combinedTraveledNodes(grid, puzzle, path);
  return new Set(
    (puzzle.dots || [])
      .filter((dot) => !visited.has(grid.nodeKey(dot)))
      .map((dot) => grid.nodeKey(dot))
  );
}

function findMissingRequiredEdges(grid, puzzle, path) {
  const traveled = combinedTraveledEdges(grid, puzzle, path);
  return new Set(
    (puzzle.requiredEdges || [])
      .filter((edge) => !traveled.has(grid.edgeKey(edge[0], edge[1])))
      .map((edge) => grid.edgeKey(edge[0], edge[1]))
  );
}

function findInvalidTriangles(grid, puzzle, path, traveled = combinedTraveledEdges(grid, puzzle, path)) {
  const invalid = new Set();
  for (const [col, row, count] of puzzle.triangles || []) {
    const touching = grid.cellEdges(col, row).filter(([a, b]) => traveled.has(grid.edgeKey(a, b)));
    if (touching.length !== count) invalid.add(`${col},${row}`);
  }
  return invalid;
}

function findInvalidRegionColors(grid, puzzle, path, regions = computeRegions(grid, puzzle, path)) {
  const invalid = new Set();
  const colorByCell = new Map((puzzle.cellColors || []).map(([col, row, color]) => [`${col},${row}`, color]));

  for (const region of regions) {
    const used = region
      .map(([col, row]) => {
        const key = `${col},${row}`;
        return colorByCell.has(key) ? [key, colorByCell.get(key)] : null;
      })
      .filter((entry) => entry !== null);
    if (new Set(used.map(([, color]) => color)).size <= 1) continue;
    used.forEach(([key]) => invalid.add(key));
  }

  return invalid;
}

function findInvalidStars(grid, puzzle, path, regions = computeRegions(grid, puzzle, path)) {
  const invalid = new Set();
  const starByCell = new Map((puzzle.stars || []).map(([col, row, color]) => [`${col},${row}`, color]));
  const colorByCell = new Map((puzzle.cellColors || []).map(([col, row, color]) => [`${col},${row}`, color]));

  for (const region of regions) {
    const colorLike = region
      .map(([col, row]) => {
        const key = `${col},${row}`;
        if (starByCell.has(key)) return { key, color: starByCell.get(key), isStar: true };
        if (colorByCell.has(key)) return { key, color: colorByCell.get(key), isStar: false };
        return null;
      })
      .filter((entry) => entry !== null);
    const stars = colorLike.filter((entry) => entry.isStar);
    if (stars.length === 0) continue;

    const starColors = new Set(stars.map((entry) => entry.color));
    for (const starColor of starColors) {
      const matchingEntries = colorLike.filter((entry) => entry.color === starColor);
      if (matchingEntries.length !== 2) {
        matchingEntries.forEach((entry) => invalid.add(entry.key));
      }
    }
  }

  return invalid;
}

function findInvalidRegionSizes(grid, puzzle, path, regions = computeRegions(grid, puzzle, path)) {
  const invalid = new Set();
  const valueByCell = new Map((puzzle.regionSizes || []).map(([col, row, value]) => [`${col},${row}`, value]));

  for (const region of regions) {
    const numberedKeys = region.filter(([col, row]) => valueByCell.has(`${col},${row}`));
    if (numberedKeys.length === 0) continue;

    const requiredSize = numberedKeys.reduce((sum, [col, row]) => sum + valueByCell.get(`${col},${row}`), 0);
    if (region.length !== requiredSize) {
      numberedKeys.forEach(([col, row]) => invalid.add(`${col},${row}`));
    }
  }

  return invalid;
}

function findInvalidTurnNodes(grid, puzzle, path, behaviors = buildVisitedNodeBehaviors(grid, puzzle, path)) {
  return new Set(
    (puzzle.turnNodes || [])
      .filter((node) => behaviors.get(grid.nodeKey(node)) !== 'turn')
      .map((node) => grid.nodeKey(node))
  );
}

function findInvalidStraightNodes(grid, puzzle, path, behaviors = buildVisitedNodeBehaviors(grid, puzzle, path)) {
  return new Set(
    (puzzle.straightNodes || [])
      .filter((node) => {
        const behavior = behaviors.get(grid.nodeKey(node));
        return behavior !== 'horizontal' && behavior !== 'vertical';
      })
      .map((node) => grid.nodeKey(node))
  );
}

function findInvalidHorizontalNodes(grid, puzzle, path, behaviors = buildVisitedNodeBehaviors(grid, puzzle, path)) {
  return new Set(
    (puzzle.horizontalNodes || [])
      .filter((node) => behaviors.get(grid.nodeKey(node)) !== 'horizontal')
      .map((node) => grid.nodeKey(node))
  );
}

function findInvalidVerticalNodes(grid, puzzle, path, behaviors = buildVisitedNodeBehaviors(grid, puzzle, path)) {
  return new Set(
    (puzzle.verticalNodes || [])
      .filter((node) => behaviors.get(grid.nodeKey(node)) !== 'vertical')
      .map((node) => grid.nodeKey(node))
  );
}

function findInvalidCornerNodes(grid, puzzle, path, directions = buildVisitedNodeDirections(grid, puzzle, path)) {
  return new Set(
    (puzzle.cornerNodes || [])
      .filter(([col, row, orientation]) => !cornerNodeMatches(directions.get(`${col},${row}`), orientation))
      .map(([col, row]) => `${col},${row}`)
  );
}

export function analyzeSolution(grid, puzzle, path) {
  const failures = createFailureSet();
  const validPath = isValidPath(grid, puzzle, path);
  const exited = validPath && reachesExit(grid, puzzle, path);
  if (!validPath || !exited) {
    return {
      valid: false,
      failures: serializeFailures(failures),
    };
  }

  failures.dots = findMissingDots(grid, puzzle, path);
  failures.requiredEdges = findMissingRequiredEdges(grid, puzzle, path);

  if ((puzzle.eliminators || []).length > 0) {
    mergeFailures(failures, findInvalidEliminatorSymbols(grid, puzzle, path));
  } else {
    const regions = computeRegions(grid, puzzle, path);
    const traveled = combinedTraveledEdges(grid, puzzle, path);
    failures.triangles = findInvalidTriangles(grid, puzzle, path, traveled);
    failures.cellColors = findInvalidRegionColors(grid, puzzle, path, regions);
    failures.stars = findInvalidStars(grid, puzzle, path, regions);
    failures.regionSizes = findInvalidRegionSizes(grid, puzzle, path, regions);
  }

  if ((puzzle.eliminators || []).length > 0) {
    const regions = computeRegions(grid, puzzle, path);
    failures.regionSizes = findInvalidRegionSizes(grid, puzzle, path, regions);
  }

  failures.polyominoes = findInvalidPolyominoCells(grid, puzzle, path);
  const nodeBehaviors = buildVisitedNodeBehaviors(grid, puzzle, path);
  failures.turnNodes = findInvalidTurnNodes(grid, puzzle, path, nodeBehaviors);
  failures.straightNodes = findInvalidStraightNodes(grid, puzzle, path, nodeBehaviors);
  failures.horizontalNodes = findInvalidHorizontalNodes(grid, puzzle, path, nodeBehaviors);
  failures.verticalNodes = findInvalidVerticalNodes(grid, puzzle, path, nodeBehaviors);
  const nodeDirections = buildVisitedNodeDirections(grid, puzzle, path);
  failures.cornerNodes = findInvalidCornerNodes(grid, puzzle, path, nodeDirections);

  const valid =
    failures.dots.size === 0 &&
    failures.requiredEdges.size === 0 &&
    failures.triangles.size === 0 &&
    failures.cellColors.size === 0 &&
    failures.stars.size === 0 &&
    failures.regionSizes.size === 0 &&
    failures.eliminators.size === 0 &&
    failures.polyominoes.size === 0 &&
    failures.turnNodes.size === 0 &&
    failures.straightNodes.size === 0 &&
    failures.horizontalNodes.size === 0 &&
    failures.verticalNodes.size === 0 &&
    failures.cornerNodes.size === 0 &&
    satisfiesSymmetry(grid, puzzle, path);

  return {
    valid,
    failures: serializeFailures(failures),
  };
}

export function validateSolution(grid, puzzle, path) {
  return analyzeSolution(grid, puzzle, path).valid;
}
