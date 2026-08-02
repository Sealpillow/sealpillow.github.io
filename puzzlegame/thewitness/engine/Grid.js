export class Grid {
  constructor(width, height, size = 400, padding = 40) {
    this.width = width;
    this.height = height;
    this.size = size;
    this.padding = padding;
    this.cellSize = size / Math.max(width, height);
  }

  get svgSize() {
    return this.size + this.padding * 2;
  }

  nodeToPoint([col, row]) {
    return {
      x: this.padding + col * this.cellSize,
      y: this.padding + row * this.cellSize,
    };
  }

  isAdjacent(a, b) {
    const dx = Math.abs(a[0] - b[0]);
    const dy = Math.abs(a[1] - b[1]);
    return dx + dy === 1;
  }

  nodeKey([col, row]) {
    return `${col},${row}`;
  }

  edgeKey(a, b) {
    return [this.nodeKey(a), this.nodeKey(b)].sort().join('|');
  }

  *allNodes() {
    for (let row = 0; row <= this.height; row++) {
      for (let col = 0; col <= this.width; col++) {
        yield [col, row];
      }
    }
  }

  *allCells() {
    for (let row = 0; row < this.height; row++) {
      for (let col = 0; col < this.width; col++) {
        yield [col, row];
      }
    }
  }

  cellEdges(col, row) {
    return [
      [[col, row], [col + 1, row]], // top
      [[col, row + 1], [col + 1, row + 1]], // bottom
      [[col, row], [col, row + 1]], // left
      [[col + 1, row], [col + 1, row + 1]], // right
    ];
  }

  cellCenter(col, row) {
    return this.nodeToPoint([col + 0.5, row + 0.5]);
  }

  cellNeighbors(col, row) {
    const neighbors = [];
    if (col > 0) neighbors.push({ cell: [col - 1, row], edge: [[col, row], [col, row + 1]] });
    if (col < this.width - 1) neighbors.push({ cell: [col + 1, row], edge: [[col + 1, row], [col + 1, row + 1]] });
    if (row > 0) neighbors.push({ cell: [col, row - 1], edge: [[col, row], [col + 1, row]] });
    if (row < this.height - 1) neighbors.push({ cell: [col, row + 1], edge: [[col, row + 1], [col + 1, row + 1]] });
    return neighbors;
  }
}
