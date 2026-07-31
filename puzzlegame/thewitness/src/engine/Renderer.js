import { transformNode } from './Symmetry.js';
import { POLYOMINO_SHAPES } from './Polyominoes.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  return el;
}

// Shallow, deliberately non-90°-multiple tilt for freely-rotatable ("slanted") polyomino
// pieces — distinguishes them at a glance from axis-aligned ("straight") ones.
const POLYOMINO_SLANT_DEG = 22;

function starPoints(cx, cy, outerR, innerR) {
  const points = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    points.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return points.join(' ');
}

export class Renderer {
  constructor(svg, grid) {
    this.svg = svg;
    this.grid = grid;
    this.gridGroup = svg.querySelector('.grid-lines');
    this.symbolsGroup = svg.querySelector('.symbols');
    this.pathGroup = svg.querySelector('.player-path');
    this.mirrorGroup = svg.querySelector('.mirror-path');
    this.nodesGroup = svg.querySelector('.nodes');
  }

  setPuzzle(puzzle) {
    this.puzzle = puzzle;
    this.svg.setAttribute('viewBox', `0 0 ${this.grid.svgSize} ${this.grid.svgSize}`);
    this.drawGrid();
    this.drawSymbols();
    this.drawNodes();
    this.drawStartAndExits();
    this.drawPath([]);
    this.drawMirrorPath([]);
  }

  clearGroup(group) {
    while (group.firstChild) group.removeChild(group.firstChild);
  }

  drawGrid() {
    this.clearGroup(this.gridGroup);
    const { grid } = this;
    for (const node of grid.allNodes()) {
      const [col, row] = node;
      if (col < grid.width) this.drawEdgeLine(node, [col + 1, row]);
      if (row < grid.height) this.drawEdgeLine(node, [col, row + 1]);
    }
  }

  drawEdgeLine(a, b) {
    const { grid, puzzle } = this;
    const key = grid.edgeKey(a, b);
    const blocked = (puzzle.blockedEdges || []).some((edge) => grid.edgeKey(edge[0], edge[1]) === key);
    const required = (puzzle.requiredEdges || []).some((edge) => grid.edgeKey(edge[0], edge[1]) === key);
    const pa = grid.nodeToPoint(a);
    const pb = grid.nodeToPoint(b);

    let cls = 'grid-edge';
    if (blocked) cls += ' blocked';
    if (required) cls += ' required';

    this.gridGroup.appendChild(svgEl('line', { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, class: cls }));
    if (blocked) {
      const mx = (pa.x + pb.x) / 2;
      const my = (pa.y + pb.y) / 2;
      this.gridGroup.appendChild(svgEl('circle', { cx: mx, cy: my, r: 5, class: 'blocked-marker' }));
    }
  }

  drawSymbols() {
    this.clearGroup(this.symbolsGroup);
    for (const dot of this.puzzle.dots || []) {
      const p = this.grid.nodeToPoint(dot);
      this.symbolsGroup.appendChild(svgEl('circle', { cx: p.x, cy: p.y, r: 7, class: 'dot' }));
    }
    for (const [col, row, count] of this.puzzle.triangles || []) {
      this.drawTriangleCluster(col, row, count);
    }
    for (const [col, row, color] of this.puzzle.cellColors || []) {
      const center = this.grid.cellCenter(col, row);
      const size = this.grid.cellSize * 0.32;
      this.symbolsGroup.appendChild(
        svgEl('rect', {
          x: center.x - size / 2,
          y: center.y - size / 2,
          width: size,
          height: size,
          class: `region-chip region-${color}`,
        })
      );
    }
    for (const [col, row, color] of this.puzzle.stars || []) {
      const center = this.grid.cellCenter(col, row);
      const outerR = this.grid.cellSize * 0.22;
      this.symbolsGroup.appendChild(
        svgEl('polygon', {
          points: starPoints(center.x, center.y, outerR, outerR * 0.42),
          class: `star star-${color}`,
        })
      );
    }
    for (const [col, row] of this.puzzle.eliminators || []) {
      this.drawEliminator(col, row);
    }
    for (const [col, row, shape, rotationSteps, rotatable] of this.puzzle.polyominoes || []) {
      this.drawPolyominoIcon(col, row, shape, rotationSteps || 0, rotatable !== false);
    }
  }

  drawEliminator(col, row) {
    const center = this.grid.cellCenter(col, row);
    const r = this.grid.cellSize * 0.22;
    const arm = r * 0.55;
    this.symbolsGroup.appendChild(svgEl('circle', { cx: center.x, cy: center.y, r, class: 'eliminator-ring' }));
    this.symbolsGroup.appendChild(
      svgEl('line', {
        x1: center.x - arm,
        y1: center.y - arm,
        x2: center.x + arm,
        y2: center.y + arm,
        class: 'eliminator-mark',
      })
    );
    this.symbolsGroup.appendChild(
      svgEl('line', {
        x1: center.x + arm,
        y1: center.y - arm,
        x2: center.x - arm,
        y2: center.y + arm,
        class: 'eliminator-mark',
      })
    );
  }

  // Mirrors the source game's own visual language: the icon is one solid block (its unit
  // cells drawn flush, no gaps) with thin divider lines marking where cells join — a
  // "straight" piece (rotatable: false) sits axis-aligned in its one required orientation
  // (`rotationSteps`, 0-3 quarter turns), since that's the only shape that will tile its
  // region. A "slanted" piece (rotatable: true) is tilted by a fixed shallow angle instead —
  // any of its rotations are accepted, so the exact orientation shown doesn't matter, only
  // that it visibly isn't grid-aligned. This is the *only* rotation cue — no separate badge.
  drawPolyominoIcon(col, row, shape, rotationSteps = 0, rotatable = true) {
    const cells = POLYOMINO_SHAPES[shape];
    if (!cells) return;
    const cellSet = new Set(cells.map(([c, r]) => `${c},${r}`));
    const center = this.grid.cellCenter(col, row);
    const maxCol = Math.max(...cells.map(([c]) => c)) + 1;
    const maxRow = Math.max(...cells.map(([, r]) => r)) + 1;
    const span = Math.max(maxCol, maxRow);
    const cellPx = (this.grid.cellSize * 0.5) / span;
    const totalW = maxCol * cellPx;
    const totalH = maxRow * cellPx;
    const left = center.x - totalW / 2;
    const top = center.y - totalH / 2;

    const angle = rotatable ? POLYOMINO_SLANT_DEG : rotationSteps * 90;
    const group = svgEl('g', { transform: `rotate(${angle} ${center.x} ${center.y})` });

    for (const [c, r] of cells) {
      group.appendChild(
        svgEl('rect', {
          x: left + c * cellPx,
          y: top + r * cellPx,
          width: cellPx,
          height: cellPx,
          class: 'polyomino-fill',
        })
      );
    }

    const dividers = new Set();
    for (const [c, r] of cells) {
      const x = left + c * cellPx;
      const y = top + r * cellPx;
      if (cellSet.has(`${c + 1},${r}`)) dividers.add(`${x + cellPx},${y}|${x + cellPx},${y + cellPx}`);
      if (cellSet.has(`${c},${r + 1}`)) dividers.add(`${x},${y + cellPx}|${x + cellPx},${y + cellPx}`);
    }
    for (const seg of dividers) {
      const [[x1, y1], [x2, y2]] = seg.split('|').map((p) => p.split(',').map(Number));
      group.appendChild(svgEl('line', { x1, y1, x2, y2, class: 'polyomino-divider' }));
    }

    this.symbolsGroup.appendChild(group);
  }

  drawTriangleCluster(col, row, count) {
    const center = this.grid.cellCenter(col, row);
    const size = this.grid.cellSize * 0.14;
    const gap = size * 1.6;
    const startX = center.x - ((count - 1) * gap) / 2;
    for (let i = 0; i < count; i++) {
      const cx = startX + i * gap;
      const points = [
        [cx, center.y - size],
        [cx - size, center.y + size * 0.75],
        [cx + size, center.y + size * 0.75],
      ]
        .map(([x, y]) => `${x},${y}`)
        .join(' ');
      this.symbolsGroup.appendChild(svgEl('polygon', { points, class: 'triangle' }));
    }
  }

  drawNodes() {
    this.clearGroup(this.nodesGroup);
    const dotKeys = new Set((this.puzzle.dots || []).map((d) => this.grid.nodeKey(d)));
    for (const node of this.grid.allNodes()) {
      if (dotKeys.has(this.grid.nodeKey(node))) continue;
      const p = this.grid.nodeToPoint(node);
      this.nodesGroup.appendChild(svgEl('circle', { cx: p.x, cy: p.y, r: 6, class: 'node' }));
    }
  }

  drawStartAndExits() {
    const startPoint = this.grid.nodeToPoint(this.puzzle.start);
    this.nodesGroup.appendChild(
      svgEl('circle', { cx: startPoint.x, cy: startPoint.y, r: 10, class: 'start-node' })
    );

    for (const exit of this.puzzle.exits || []) {
      this.drawExitTick(exit, 'exit-tick');
    }

    if (this.puzzle.symmetry) {
      const mirrorStart = transformNode(this.puzzle.symmetry, this.grid, this.puzzle.start);
      const p = this.grid.nodeToPoint(mirrorStart);
      this.nodesGroup.appendChild(
        svgEl('circle', { cx: p.x, cy: p.y, r: 8, class: 'mirror-start-node' })
      );
      for (const exit of this.puzzle.exits || []) {
        const mirrorExit = transformNode(this.puzzle.symmetry, this.grid, exit);
        this.drawExitTick(mirrorExit, 'mirror-exit-tick');
      }
    }
  }

  drawExitTick(node, className) {
    const p = this.grid.nodeToPoint(node);
    const dir = this.exitDirection(node);
    const tip = { x: p.x + dir.x * 16, y: p.y + dir.y * 16 };
    this.nodesGroup.appendChild(svgEl('line', { x1: p.x, y1: p.y, x2: tip.x, y2: tip.y, class: className }));
  }

  exitDirection([col, row]) {
    if (col === 0) return { x: -1, y: 0 };
    if (col === this.grid.width) return { x: 1, y: 0 };
    if (row === 0) return { x: 0, y: -1 };
    if (row === this.grid.height) return { x: 0, y: 1 };
    return { x: 0, y: -1 };
  }

  drawPath(path, state = 'idle') {
    this.clearGroup(this.pathGroup);
    if (path.length === 0) return;
    const points = path.map((n) => this.grid.nodeToPoint(n));
    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    this.pathGroup.appendChild(svgEl('path', { d, class: `player-line ${state}` }));
    this.pathGroup.appendChild(
      svgEl('circle', { cx: points[0].x, cy: points[0].y, r: 8, class: 'path-start-cap' })
    );
  }

  drawMirrorPath(path, state = 'idle') {
    this.clearGroup(this.mirrorGroup);
    if (!this.puzzle.symmetry || path.length === 0) return;
    const mirrored = path.map((n) => transformNode(this.puzzle.symmetry, this.grid, n));
    const points = mirrored.map((n) => this.grid.nodeToPoint(n));
    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    this.mirrorGroup.appendChild(svgEl('path', { d, class: `mirror-line ${state}` }));
  }
}
