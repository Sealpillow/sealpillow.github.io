import { isEdgeBlocked, isValidStartNode, reachesExit } from './Validator.js';

export class InputController {
  constructor(svg, grid, { onChange, onRelease } = {}) {
    this.svg = svg;
    this.grid = grid;
    this.onChange = onChange || (() => {});
    this.onRelease = onRelease || (() => {});
    this.puzzle = null;
    this.path = [];
    this.tracing = false;
    this.releaseToSubmitEnabled = true;
    this.autoSubmitOnExit = false;
    this.rollbackToVisitedEnabled = false;

    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);

    svg.addEventListener('pointerdown', this.handlePointerDown, { passive: false });
    svg.addEventListener('pointermove', this.handlePointerMove, { passive: false });
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointercancel', this.handlePointerUp);
  }

  setPuzzle(puzzle) {
    this.puzzle = puzzle;
    this.path = [];
    this.tracing = false;
  }

  setReleaseToSubmitEnabled(enabled) {
    this.releaseToSubmitEnabled = enabled;
  }

  setAutoSubmitOnExit(enabled) {
    this.autoSubmitOnExit = enabled;
  }

  setRollbackToVisitedEnabled(enabled) {
    this.rollbackToVisitedEnabled = enabled;
  }

  isTracing() {
    return this.tracing;
  }

  getPath() {
    return [...this.path];
  }

  reset() {
    this.path = [];
    this.tracing = false;
  }

  destroy() {
    this.svg.removeEventListener('pointerdown', this.handlePointerDown);
    this.svg.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerUp);
  }

  svgPoint(evt) {
    const rect = this.svg.getBoundingClientRect();
    const scaleX = this.grid.svgSize / rect.width;
    const scaleY = this.grid.svgSize / rect.height;
    return {
      x: (evt.clientX - rect.left) * scaleX,
      y: (evt.clientY - rect.top) * scaleY,
    };
  }

  nearestNode(point) {
    let closest = null;
    let bestDist = Infinity;
    for (const node of this.grid.allNodes()) {
      const p = this.grid.nodeToPoint(node);
      const dist = Math.hypot(p.x - point.x, p.y - point.y);
      if (dist < bestDist) {
        bestDist = dist;
        closest = node;
      }
    }
    return { node: closest, dist: bestDist };
  }

  pathContains(node) {
    return this.path.some((n) => n[0] === node[0] && n[1] === node[1]);
  }

  pathIndex(node) {
    return this.path.findIndex((n) => n[0] === node[0] && n[1] === node[1]);
  }

  commitNode(node) {
    if (!this.tracing || !this.puzzle) return false;

    const last = this.path[this.path.length - 1];
    if (last[0] === node[0] && last[1] === node[1]) return false;

    if (this.path.length > 1) {
      const prev = this.path[this.path.length - 2];
      if (prev[0] === node[0] && prev[1] === node[1]) {
        this.path.pop();
        this.onChange(this.path);
        return true;
      }
    }

    if (this.rollbackToVisitedEnabled) {
      const existingIndex = this.pathIndex(node);
      if (existingIndex >= 0) {
        this.path = this.path.slice(0, existingIndex + 1);
        this.onChange(this.path);
        return true;
      }
    }

    if (!this.grid.isAdjacent(last, node)) return false;
    if (isEdgeBlocked(this.grid, this.puzzle, last, node)) return false;
    if (this.pathContains(node)) return false;

    this.path.push(node);
    this.onChange(this.path);
    if (this.autoSubmitOnExit && this.path.length > 1 && reachesExit(this.grid, this.puzzle, this.path)) {
      this.finalize();
    }
    return true;
  }

  handlePointerDown(evt) {
    if (!this.puzzle) return;
    // Belt-and-suspenders alongside the board's `touch-action: none` CSS: on some mobile
    // browsers a touch that starts even slightly outside the exact SVG rect (e.g. on the
    // padded wrapper) can still get claimed by the native scroll gesture before touch-action
    // takes effect. Calling preventDefault() here stops that for any touch on the board.
    evt.preventDefault();

    if (this.tracing) {
      if (this.releaseToSubmitEnabled) {
        // A click while a path is already armed submits it, whether the player got here by
        // holding-and-dragging or by clicking once and moving the mouse freely.
        this.finalize();
        return;
      }
      const { node, dist } = this.nearestNode(this.svgPoint(evt));
      const grabRadius = this.grid.cellSize * 0.9;
      if (dist > grabRadius) return;
      this.commitNode(node);
      return;
    }

    const { node, dist } = this.nearestNode(this.svgPoint(evt));
    const grabRadius = this.grid.cellSize * 0.6;
    if (dist > grabRadius) return;
    if (!isValidStartNode(this.grid, this.puzzle, node)) return;

    this.tracing = true;
    this.path = [node];
    this.onChange(this.path);
  }

  handlePointerMove(evt) {
    if (!this.tracing) return;
    evt.preventDefault();
    const { node, dist } = this.nearestNode(this.svgPoint(evt));
    const grabRadius = this.grid.cellSize * 0.9;
    if (dist > grabRadius) return;
    this.commitNode(node);
  }

  handlePointerUp() {
    // Only auto-submit on release if the pointer actually moved past the start node while
    // held (a classic click-and-drag). A plain click with no movement leaves the path armed
    // so the player can trace it by moving the mouse without holding the button down.
    if (this.releaseToSubmitEnabled && this.tracing && this.path.length > 1) {
      this.finalize();
    }
  }

  finalize() {
    this.tracing = false;
    this.onRelease(this.path);
  }
}
