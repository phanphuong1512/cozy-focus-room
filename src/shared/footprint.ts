import type { CatalogItem, FacingDirection, GridCell } from './types';

export const TILE_W = 120;
export const TILE_H = 60;

export function gridToScreen(gx: number, gy: number): { x: number; y: number } {
  return {
    x: (gx - gy) * (TILE_W / 2),
    y: (gx + gy) * (TILE_H / 2),
  };
}

export function screenToGrid(sx: number, sy: number): { gx: number; gy: number } {
  const gx = (sx / (TILE_W / 2) + sy / (TILE_H / 2)) / 2;
  const gy = (sy / (TILE_H / 2) - sx / (TILE_W / 2)) / 2;
  return { gx, gy };
}

/** Returns occupied tile offsets relative to the item's top-left origin cell. */
export function getRelativeFootprintCells(
  cat: CatalogItem,
  flipped: boolean
): GridCell[] {
  let base: GridCell[];
  if (cat.footprintCells && cat.footprintCells.length > 0) {
    base = cat.footprintCells;
  } else {
    base = [];
    const w = Math.max(1, cat.footprint.w);
    const h = Math.max(1, cat.footprint.h);
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        base.push({ dx, dy });
      }
    }
  }

  if (!flipped) return base;
  // Horizontal flip in 2:1 isometric space swaps the +gx and +gy tile axes cleanly.
  return base.map(({ dx, dy }) => ({ dx: dy, dy: dx }));
}

export function getItemOccupiedCells(
  cat: CatalogItem,
  originGx: number,
  originGy: number,
  flipped: boolean
): { gx: number; gy: number }[] {
  const ox = Math.floor(originGx);
  const oy = Math.floor(originGy);
  return getRelativeFootprintCells(cat, flipped).map(({ dx, dy }) => ({
    gx: ox + dx,
    gy: oy + dy,
  }));
}

export interface FootprintScreenMetrics {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  spriteX: number;
  spriteY: number;
  centroidGx: number;
  centroidGy: number;
  depthScore: number;
}

export function getFootprintScreenMetrics(
  cat: CatalogItem,
  originGx: number,
  originGy: number,
  flipped: boolean
): FootprintScreenMetrics {
  const cells = getItemOccupiedCells(cat, originGx, originGy, flipped);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let sumGx = 0;
  let sumGy = 0;

  for (const { gx, gy } of cells) {
    sumGx += gx + 0.5;
    sumGy += gy + 0.5;
    const corners = [
      gridToScreen(gx, gy),
      gridToScreen(gx + 1, gy),
      gridToScreen(gx + 1, gy + 1),
      gridToScreen(gx, gy + 1),
    ];
    for (const c of corners) {
      if (c.x < minX) minX = c.x;
      if (c.x > maxX) maxX = c.x;
      if (c.y < minY) minY = c.y;
      if (c.y > maxY) maxY = c.y;
    }
  }

  const count = Math.max(1, cells.length);
  const centroidGx = sumGx / count;
  const centroidGy = sumGy / count;
  const offX = cat.offsetX ?? 0;
  const offY = cat.offsetY ?? 0;

  return {
    minX,
    maxX,
    minY,
    maxY,
    spriteX: (minX + maxX) / 2 + (flipped ? -offX : offX),
    spriteY: maxY + offY,
    centroidGx,
    centroidGy,
    depthScore: (centroidGx + centroidGy) * 100,
  };
}

export interface GridEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Extracts only the outer perimeter edges around arbitrary sets of grid cells. */
export function getFootprintBoundaryEdges(
  cells: { gx: number; gy: number }[]
): GridEdge[] {
  const occupied = new Set(cells.map((c) => `${c.gx},${c.gy}`));
  const edges: GridEdge[] = [];

  for (const { gx, gy } of cells) {
    if (!occupied.has(`${gx},${gy - 1}`)) {
      edges.push({ x1: gx, y1: gy, x2: gx + 1, y2: gy });
    }
    if (!occupied.has(`${gx + 1},${gy}`)) {
      edges.push({ x1: gx + 1, y1: gy, x2: gx + 1, y2: gy + 1 });
    }
    if (!occupied.has(`${gx},${gy + 1}`)) {
      edges.push({ x1: gx + 1, y1: gy + 1, x2: gx, y2: gy + 1 });
    }
    if (!occupied.has(`${gx - 1},${gy}`)) {
      edges.push({ x1: gx, y1: gy + 1, x2: gx, y2: gy });
    }
  }
  return edges;
}

export function mirrorFacingDirection(facing: FacingDirection): FacingDirection {
  switch (facing) {
    case 'se':
      return 'sw';
    case 'sw':
      return 'se';
    case 'nw':
      return 'ne';
    case 'ne':
      return 'nw';
    case 'left':
      return 'right';
    case 'right':
      return 'left';
    default:
      return facing;
  }
}

export function formatFootprintLabel(cat: CatalogItem): string {
  if (cat.placement === 'surface') return 'Để bàn';
  if (cat.placement === 'wall') return `Tường ${cat.footprint.w} ô`;
  if (
    cat.footprintCells &&
    cat.footprintCells.length !== cat.footprint.w * cat.footprint.h
  ) {
    return `Chữ L (${cat.footprintCells.length} ô)`;
  }
  const area = cat.footprint.w * cat.footprint.h;
  if (area === 1) return '1×1 ô';
  return `${cat.footprint.w}×${cat.footprint.h} (${area} ô)`;
}
