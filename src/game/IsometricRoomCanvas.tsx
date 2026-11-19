import React, { useEffect, useRef, useState } from 'react';
import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  Texture,
  TextureStyle,
} from 'pixi.js';
import { ZoomIn, ZoomOut, Compass } from 'lucide-react';
import { CATALOG_ITEMS, getCatalogItem } from '../shared/catalog';
import {
  TILE_W,
  TILE_H,
  gridToScreen,
  screenToGrid,
  getRelativeFootprintCells,
  getItemOccupiedCells,
  getFootprintScreenMetrics,
  getFootprintBoundaryEdges,
  mirrorFacingDirection,
} from '../shared/footprint';
import {
  getAllCharacterSpritePaths,
  isIsoCharacter,
  resolveIsoCharacterFrame,
} from '../shared/characters';
import { useGameStore } from '../store/useGameStore';
import { soundEngine } from '../audio/soundEngine';
import type {
  CatalogItem,
  FacingDirection,
  PlacedItem,
  PlayerState,
  TileType,
  WallTheme,
} from '../shared/types';

const WALL_HEIGHT = 155;

const WALL_PALETTES: Record<
  WallTheme,
  { left: number; right: number; trim: number; base: number }
> = {
  lofi_purple: { left: 0x3b2c59, right: 0x2e2147, trim: 0x523e7a, base: 0x1e1530 },
  cream: { left: 0xd6c7b2, right: 0xc2b19a, trim: 0xefe5d6, base: 0x8f7e6a },
  sage: { left: 0x6b8c7c, right: 0x567365, trim: 0x8fb0a0, base: 0x3a4f45 },
  brick: { left: 0x8f4f49, right: 0x733c37, trim: 0xb36c64, base: 0x4a2522 },
};

interface PlacementCellStatus {
  gx: number;
  gy: number;
  valid: boolean;
}

interface PlacementTargetResult {
  gx: number;
  gy: number;
  flipped: boolean;
  layer: PlacedItem['layer'];
  parentSurfaceUid?: string;
  elevationPx: number;
  valid: boolean;
  hint: string;
  cells: PlacementCellStatus[];
}

function getWallItemCells(
  cat: CatalogItem,
  gx: number,
  gy: number,
  flipped: boolean
): { gx: number; gy: number; onLeftWall: boolean }[] {
  const span = Math.max(1, cat.footprint.w);
  const onLeftWall = gx < gy || (gx === gy && flipped);
  const ox = Math.max(0, Math.floor(gx));
  const oy = Math.max(0, Math.floor(gy));
  const cells: { gx: number; gy: number; onLeftWall: boolean }[] = [];
  for (let i = 0; i < span; i++) {
    cells.push(
      onLeftWall
        ? { gx: 0, gy: oy + i, onLeftWall: true }
        : { gx: ox + i, gy: 0, onLeftWall: false }
    );
  }
  return cells;
}

function computeSpritePlacement(
  cat: CatalogItem,
  gx: number,
  gy: number,
  flipped: boolean,
  layer: PlacedItem['layer'],
  elevationPx: number
): { x: number; y: number; depth: number } {
  if (layer === 'floor') {
    const m = getFootprintScreenMetrics(cat, gx, gy, flipped);
    return {
      x: m.spriteX,
      y: m.spriteY - (elevationPx || 0),
      depth: m.depthScore,
    };
  }
  if (layer === 'wall') {
    const span = Math.max(1, cat.footprint.w);
    const onLeftWall = gx < gy || (gx === gy && flipped);
    const ox = Math.max(0, Math.floor(gx));
    const oy = Math.max(0, Math.floor(gy));
    const anchorGx = onLeftWall ? 0.18 : ox + span / 2;
    const anchorGy = onLeftWall ? oy + span / 2 : 0.18;
    const pos = gridToScreen(anchorGx, anchorGy);
    return {
      x: pos.x,
      y: pos.y - (elevationPx || 0),
      depth: (anchorGx + anchorGy) * 100 - 5,
    };
  }
  const pos = gridToScreen(gx, gy);
  return {
    x: pos.x,
    y: pos.y - (elevationPx || 0),
    depth: (gx + gy) * 100,
  };
}

function getCharacterBaseScale(outfit: PlayerState['outfit']): number {
  if (isIsoCharacter(outfit)) return 0.48;
  if (outfit === 'skirt') return 0.33;
  if (outfit === 'pants') return 0.36;
  return 0.26;
}

function createRadialGlowTexture(color: number): Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const r = (color >> 16) & 255;
    const g = (color >> 8) & 255;
    const b = color & 255;
    const grad = ctx.createRadialGradient(
      size / 2,
      size / 2,
      2,
      size / 2,
      size / 2,
      size / 2
    );
    grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.85)`);
    grad.addColorStop(0.45, `rgba(${r}, ${g}, ${b}, 0.35)`);
    grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  return Texture.from(canvas);
}

export const IsometricRoomCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hoverHint, setHoverHint] = useState<string | null>(null);
  const [zoomUi, setZoomUi] = useState<number>(0.92);
  const camControlRef = useRef<{
    zoomBy: (delta: number) => void;
    resetCam: () => void;
  } | null>(null);

  useEffect(() => {
    const hostEl = containerRef.current;
    if (!hostEl) return;

    let destroyed = false;
    let app: Application | null = null;

    // Input & camera state inside Pixi loop
    const pressedKeys = new Set<string>();
    let walkTarget: { gx: number; gy: number } | null = null;
    let camZoom = 0.92;
    let camPan = { x: -105, y: 25 };
    let isPanning = false;
    let panStart = { x: 0, y: 0 };
    let isPointerDownLeft = false;
    let hoverGrid: { gx: number; gy: number } | null = null;
    let hoveredExistingItemUid: string | null = null;
    let lastPreviewEmitAt = 0;
    let lastStepSfxAt = 0;

    // Interpolation map for smooth remote avatars
    const avatarVisuals = new Map<
      string,
      {
        container: Container;
        sprite: Sprite;
        shadow: Graphics;
        focusRing: Graphics;
        uiContainer: Container;
        gx: number;
        gy: number;
        walkPhase: number;
      }
    >();

    // Cached glow textures per hex color
    const glowTextureCache = new Map<number, Texture>();
    const getGlowTexture = (color: number) => {
      let tex = glowTextureCache.get(color);
      if (!tex) {
        tex = createRadialGlowTexture(color);
        glowTextureCache.set(color, tex);
      }
      return tex;
    };

    const textureMap = new Map<string, Texture>();

    const loadSingleTexture = (url: string): Promise<Texture> => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          try {
            const tex = Texture.from(img);
            tex.source.style.scaleMode = 'nearest';
            resolve(tex);
          } catch {
            resolve(Texture.WHITE);
          }
        };
        img.onerror = () => {
          const altUrl = url.startsWith('/') ? url.slice(1) : '/' + url;
          const fallbackImg = new Image();
          fallbackImg.onload = () => {
            try {
              const tex = Texture.from(fallbackImg);
              tex.source.style.scaleMode = 'nearest';
              resolve(tex);
            } catch {
              resolve(Texture.WHITE);
            }
          };
          fallbackImg.onerror = () => {
            console.warn('[texture] Could not load image asset:', url);
            resolve(Texture.WHITE);
          };
          fallbackImg.src = altUrl;
        };
        img.src = url;
      });
    };

    const getTex = (path: string): Texture => {
      let tex = textureMap.get(path);
      if (!tex) {
        try {
          tex = Texture.from(path);
          tex.source.style.scaleMode = 'nearest';
          textureMap.set(path, tex);
        } catch {
          tex = Texture.WHITE;
        }
      }
      return tex;
    };

    const preloadAllAssets = async () => {
      const paths = new Set<string>([
        '/sprites/tiles/floor_wood_iso.png',
        '/sprites/tiles/floor_tiles.png',
        '/sprites/ui_vfx/vfx_dust_cloud.png',
        ...getAllCharacterSpritePaths(),
      ]);
      for (const item of CATALOG_ITEMS) {
        paths.add(item.sprite);
        if (item.altSprite) paths.add(item.altSprite);
      }

      const list = Array.from(paths);
      await Promise.all(
        list.map(async (p) => {
          const tex = await loadSingleTexture(p);
          if (tex && tex !== Texture.WHITE) {
            textureMap.set(p, tex);
          }
        })
      );
    };

    const boot = async () => {
      TextureStyle.defaultOptions.scaleMode = 'nearest';
      const instance = new Application();
      await instance.init({
        resizeTo: hostEl,
        backgroundColor: 0x120d1d,
        antialias: false,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      });

      if (destroyed) {
        instance.destroy(true);
        return;
      }

      app = instance;
      hostEl.appendChild(instance.canvas);
      await preloadAllAssets();
      if (destroyed) return;

      // World hierarchy
      const worldContainer = new Container();
      const backdropLayer = new Container(); // Walls + Slab + Floor tiles + Grid
      const sortLayer = new Container(); // Y-sorted furniture, surface props, ghost previews, avatars
      sortLayer.sortableChildren = true;
      const lightLayer = new Container(); // Night/sunset overlay + warm emitters
      const rainLayer = new Container(); // Animated pixel rain
      const avatarUiLayer = new Container(); // Crisp nameplates, status pills, chat bubbles

      worldContainer.addChild(
        backdropLayer,
        sortLayer,
        lightLayer,
        rainLayer,
        avatarUiLayer
      );
      instance.stage.addChild(worldContainer);

      // Persistent atmosphere graphics
      const nightTint = new Graphics();
      const glowContainer = new Container();
      lightLayer.addChild(nightTint, glowContainer);

      // Rain particles pool
      interface RainDrop {
        x: number;
        y: number;
        len: number;
        speed: number;
      }
      const rainDrops: RainDrop[] = Array.from({ length: 70 }, () => ({
        x: (Math.random() - 0.5) * 1800,
        y: (Math.random() - 0.5) * 1100,
        len: 12 + Math.random() * 14,
        speed: 520 + Math.random() * 240,
      }));
      const rainGraphics = new Graphics();
      rainLayer.addChild(rainGraphics);

      // Hover diamond cursor graphics inside backdrop
      const hoverCursor = new Graphics();
      backdropLayer.addChild(hoverCursor);

      // Ghost preview sprite container inside sortLayer
      const remoteGhostContainer = new Container();
      const localGhostSprite = new Sprite();
      localGhostSprite.anchor.set(0.5, 1.0);
      localGhostSprite.alpha = 0.72;
      localGhostSprite.visible = false;
      sortLayer.addChild(localGhostSprite, remoteGhostContainer);

      // Helper: track item hitboxes per frame for click interaction
      interface RenderedItemMeta {
        uid: string;
        sprite: Sprite;
        item: PlacedItem;
      }
      let renderedItems: RenderedItemMeta[] = [];

      const updateCameraTransform = () => {
        if (!app) return;
        worldContainer.scale.set(camZoom);
        worldContainer.x = app.screen.width / 2 + camPan.x;
        worldContainer.y = app.screen.height * 0.22 + camPan.y;
      };

      camControlRef.current = {
        zoomBy: (delta: number) => {
          camZoom = Math.max(0.55, Math.min(1.85, Number((camZoom + delta).toFixed(2))));
          setZoomUi(camZoom);
        },
        resetCam: () => {
          camZoom = 0.92;
          camPan = { x: -105, y: 25 };
          setZoomUi(0.92);
        },
      };

      // Rebuild room floor + walls + furniture whenever layout signature changes
      let lastLayoutSig = '';
      let lastBuildMode = false;

      const rebuildStaticAndFurniture = () => {
        const state = useGameStore.getState();
        const { layout, buildMode, movingItemUid } = state;

        backdropLayer.removeChildren();
        // Keep only non-avatar, non-ghost children cleanly
        for (const meta of renderedItems) {
          meta.sprite.destroy();
        }
        renderedItems = [];

        // Remove old furniture shadow graphics tagged with label
        for (let i = sortLayer.children.length - 1; i >= 0; i--) {
          const c = sortLayer.children[i];
          if (c.label === 'item_shadow') {
            sortLayer.removeChild(c);
            c.destroy();
          }
        }

        const H = layout.floorMap.length;
        const W = Math.max(...layout.floorMap.map((r) => r.length));
        const palette = WALL_PALETTES[layout.wallTheme] || WALL_PALETTES.lofi_purple;

        // 1. Back Walls (Left Wall along gx=0, Right Wall along gy=0)
        const wallsG = new Graphics();
        const cornerTop = gridToScreen(0, 0);
        const cornerLeft = gridToScreen(0, H);
        const cornerRight = gridToScreen(W, 0);

        // Left wall polygon
        wallsG.poly([
          cornerTop.x,
          cornerTop.y,
          cornerLeft.x,
          cornerLeft.y,
          cornerLeft.x,
          cornerLeft.y - WALL_HEIGHT,
          cornerTop.x,
          cornerTop.y - WALL_HEIGHT,
        ]);
        wallsG.fill({ color: palette.left });

        // Right wall polygon
        wallsG.poly([
          cornerTop.x,
          cornerTop.y,
          cornerRight.x,
          cornerRight.y,
          cornerRight.x,
          cornerRight.y - WALL_HEIGHT,
          cornerTop.x,
          cornerTop.y - WALL_HEIGHT,
        ]);
        wallsG.fill({ color: palette.right });

        // Top molding trim & baseboard
        wallsG.moveTo(cornerLeft.x, cornerLeft.y - WALL_HEIGHT);
        wallsG.lineTo(cornerTop.x, cornerTop.y - WALL_HEIGHT);
        wallsG.lineTo(cornerRight.x, cornerRight.y - WALL_HEIGHT);
        wallsG.stroke({ color: palette.trim, width: 6 });

        wallsG.moveTo(cornerLeft.x, cornerLeft.y - 10);
        wallsG.lineTo(cornerTop.x, cornerTop.y - 10);
        wallsG.lineTo(cornerRight.x, cornerRight.y - 10);
        wallsG.stroke({ color: palette.base, width: 8, alpha: 0.7 });

        backdropLayer.addChild(wallsG);

        // 2. Floor Tiles & 3D Diorama Slab
        const slabG = new Graphics();
        const tilesContainer = new Container();

        for (let gy = 0; gy < H; gy++) {
          const row = layout.floorMap[gy] || '';
          for (let gx = 0; gx < W; gx++) {
            const tile = (row[gx] || '.') as TileType;
            if (tile === '.') continue;

            const cTop = gridToScreen(gx, gy);
            const cRight = gridToScreen(gx + 1, gy);
            const cBot = gridToScreen(gx + 1, gy + 1);
            const cLeft = gridToScreen(gx, gy + 1);

            // Check south-east neighbors to draw crisp 3D edge thickness
            const hasDownLeft = (layout.floorMap[gy + 1]?.[gx] || '.') !== '.';
            const hasDownRight = (layout.floorMap[gy]?.[gx + 1] || '.') !== '.';

            if (!hasDownLeft) {
              slabG.poly([
                cLeft.x,
                cLeft.y,
                cBot.x,
                cBot.y,
                cBot.x,
                cBot.y + 14,
                cLeft.x,
                cLeft.y + 14,
              ]);
              slabG.fill({ color: 0x1a1228 });
            }
            if (!hasDownRight) {
              slabG.poly([
                cBot.x,
                cBot.y,
                cRight.x,
                cRight.y,
                cRight.x,
                cRight.y + 14,
                cBot.x,
                cBot.y + 14,
              ]);
              slabG.fill({ color: 0x241938 });
            }

            const center = gridToScreen(gx + 0.5, gy + 0.5);
            const texPath =
              tile === 'B'
                ? '/sprites/tiles/floor_tiles.png'
                : '/sprites/tiles/floor_wood_iso.png';
            const tileSprite = new Sprite(getTex(texPath));
            tileSprite.anchor.set(0.5, 0.5);
            tileSprite.position.set(center.x, center.y);
            tileSprite.scale.set(TILE_W / 250, TILE_H / 125);
            if (tile === 'C') {
              tileSprite.tint = 0xe9d5ff; // Cozy pastel carpet tone
            }
            tilesContainer.addChild(tileSprite);

            if (tile === 'C') {
              const rugOverlay = new Graphics();
              rugOverlay.poly([
                cTop.x,
                cTop.y + 4,
                cRight.x - 6,
                cRight.y,
                cBot.x,
                cBot.y - 4,
                cLeft.x + 6,
                cLeft.y,
              ]);
              rugOverlay.fill({ color: 0xf472b6, alpha: 0.12 });
              rugOverlay.stroke({ color: 0xfbcfe8, width: 1, alpha: 0.28 });
              tilesContainer.addChild(rugOverlay);
            }
          }
        }

        backdropLayer.addChild(slabG, tilesContainer);

        // 3. Build Mode Isometric Grid Overlay
        if (buildMode) {
          const gridLines = new Graphics();
          for (let x = 0; x <= W; x++) {
            const p1 = gridToScreen(x, 0);
            const p2 = gridToScreen(x, H);
            gridLines.moveTo(p1.x, p1.y);
            gridLines.lineTo(p2.x, p2.y);
          }
          for (let y = 0; y <= H; y++) {
            const p1 = gridToScreen(0, y);
            const p2 = gridToScreen(W, y);
            gridLines.moveTo(p1.x, p1.y);
            gridLines.lineTo(p2.x, p2.y);
          }
          gridLines.stroke({ color: 0x7dd3fc, width: 1, alpha: 0.24 });
          backdropLayer.addChild(gridLines);
        }

        backdropLayer.addChild(hoverCursor);

        // 4. Placed Items (Layer 2 Floor/Wall & Layer 3 Surface Props)
        glowContainer.removeChildren();

        for (const item of layout.items) {
          // Hide original item while it's picked up for moving
          if (buildMode && movingItemUid === item.uid) continue;

          const catalog = getCatalogItem(item.catalogId);
          if (!catalog) continue;

          const spritePath =
            item.toggled && catalog.altSprite ? catalog.altSprite : catalog.sprite;
          const placementPos = computeSpritePlacement(
            catalog,
            item.gx,
            item.gy,
            item.flipped,
            item.layer,
            item.elevationPx || 0
          );

          const spr = new Sprite(getTex(spritePath));
          spr.anchor.set(0.5, 1.0);
          spr.position.set(placementPos.x, placementPos.y);
          spr.scale.set(
            catalog.scale * (item.flipped ? -1 : 1),
            catalog.scale
          );

          // Depth sort priority
          let zBase = placementPos.depth;
          if (catalog.walkable) {
            zBase -= 40;
          } else if (item.layer === 'surface') {
            const parent = layout.items.find((p) => p.uid === item.parentSurfaceUid);
            const parentCat = parent ? getCatalogItem(parent.catalogId) : undefined;
            const parentDepth =
              parent && parentCat
                ? getFootprintScreenMetrics(parentCat, parent.gx, parent.gy, parent.flipped).depthScore
                : placementPos.depth;
            zBase = parentDepth + 35 + (item.elevationPx || 0) * 0.1;

            // Surface drop shadow directly beneath the prop on table top
            const propShadow = new Graphics();
            propShadow.label = 'item_shadow';
            propShadow.ellipse(placementPos.x, placementPos.y - 2, 22, 9);
            propShadow.fill({ color: 0x090512, alpha: 0.35 });
            propShadow.zIndex = zBase - 0.5;
            sortLayer.addChild(propShadow);
          } else if (item.layer !== 'wall') {
            zBase += 15;
          }

          spr.zIndex = zBase;
          sortLayer.addChild(spr);
          renderedItems.push({ uid: item.uid, sprite: spr, item });

          // Night light emitter glow
          if (catalog.lightEmitter) {
            const isLightActive =
              catalog.id === 'heat_lamp' || catalog.id === 'fridge'
                ? item.toggled
                : true;
            if (isLightActive) {
              const glow = new Sprite(getGlowTexture(catalog.lightEmitter.color));
              glow.anchor.set(0.5, 0.5);
              glow.position.set(
                placementPos.x,
                placementPos.y + (catalog.lightEmitter.offsetY ?? -40)
              );
              const size = catalog.lightEmitter.radius * 2;
              glow.width = size;
              glow.height = size;
              glow.alpha = catalog.lightEmitter.intensity * 0.22;
              glow.blendMode = 'normal';
              glowContainer.addChild(glow);
            }
          }
        }
      };

      // Helper: hit-test placed items (topmost first by zIndex)
      const pickItemAtScreen = (globalX: number, globalY: number): PlacedItem | null => {
        const sorted = [...renderedItems].sort(
          (a, b) => b.sprite.zIndex - a.sprite.zIndex
        );
        for (const meta of sorted) {
          const bounds = meta.sprite.getBounds();
          if (
            globalX >= bounds.minX &&
            globalX <= bounds.maxX &&
            globalY >= bounds.minY &&
            globalY <= bounds.maxY
          ) {
            return meta.item;
          }
        }
        return null;
      };

      // Helper: find surface item under a grid coordinate (checking exact occupied cells, e.g. L-counter arms only!)
      const findSurfaceAtGrid = (gx: number, gy: number): PlacedItem | null => {
        const items = useGameStore.getState().layout.items;
        const cellX = Math.floor(gx);
        const cellY = Math.floor(gy);
        let best: PlacedItem | null = null;
        let bestDepth = -Infinity;

        for (const item of items) {
          const cat = getCatalogItem(item.catalogId);
          if (!cat?.isSurface || item.layer !== 'floor') continue;
          const occupied = getItemOccupiedCells(cat, item.gx, item.gy, item.flipped);
          if (occupied.some((c) => c.gx === cellX && c.gy === cellY)) {
            const depth = (item.gx + item.gy) * 100;
            if (depth >= bestDepth) {
              bestDepth = depth;
              best = item;
            }
          }
        }
        return best;
      };

      const isTileWalkable = (gx: number, gy: number): boolean => {
        const floorMap = useGameStore.getState().layout.floorMap;
        const iy = Math.floor(gy);
        const ix = Math.floor(gx);
        if (iy < 0 || iy >= floorMap.length) return false;
        const row = floorMap[iy] || '';
        if (ix < 0 || ix >= row.length) return false;
        return row[ix] !== '.';
      };

      const computePlacementTarget = (
        gx: number,
        gy: number,
        catalogId: string,
        flipped: boolean
      ): PlacementTargetResult | null => {
        const cat = getCatalogItem(catalogId);
        if (!cat) return null;
        const state = useGameStore.getState();
        const floorMap = state.layout.floorMap;
        const H = floorMap.length;
        const W = Math.max(...floorMap.map((r) => r.length));

        if (cat.placement === 'surface') {
          const surface = findSurfaceAtGrid(gx, gy);
          const snapGx = Math.round(gx * 4) / 4;
          const snapGy = Math.round(gy * 4) / 4;
          if (surface) {
            const surfaceCat = getCatalogItem(surface.catalogId);
            return {
              gx: snapGx,
              gy: snapGy,
              flipped,
              layer: 'surface',
              parentSurfaceUid: surface.uid,
              elevationPx: surfaceCat?.surfaceHeightPx ?? 40,
              valid: true,
              hint: `✨ Đặt lên mặt ${surfaceCat?.name || 'bàn'}`,
              cells: [{ gx: Math.floor(snapGx), gy: Math.floor(snapGy), valid: true }],
            };
          }
          const cellX = Math.floor(snapGx);
          const cellY = Math.floor(snapGy);
          const inBounds =
            snapGx >= 0.3 &&
            snapGx <= W - 0.3 &&
            snapGy >= 0.3 &&
            snapGy <= H - 0.3 &&
            isTileWalkable(cellX, cellY);
          return {
            gx: snapGx,
            gy: snapGy,
            flipped,
            layer: 'floor',
            parentSurfaceUid: undefined,
            elevationPx: 0,
            valid: inBounds,
            hint: inBounds
              ? 'Đặt trên sàn (rê lên bàn / quầy để đặt lên mặt bàn)'
              : 'Ngoài phạm vi phòng',
            cells: [{ gx: cellX, gy: cellY, valid: inBounds }],
          };
        }

        if (cat.placement === 'wall') {
          const span = Math.max(1, cat.footprint.w);
          const attachLeftWall = gx <= gy;
          const originGx = attachLeftWall
            ? 0
            : Math.max(0, Math.min(W - span, Math.floor(gx - (span - 1) / 2)));
          const originGy = attachLeftWall
            ? Math.max(0, Math.min(H - span, Math.floor(gy - (span - 1) / 2)))
            : 0;

          const cells: PlacementCellStatus[] = [];
          for (let i = 0; i < span; i++) {
            const cx = attachLeftWall ? 0 : originGx + i;
            const cy = attachLeftWall ? originGy + i : 0;
            const cellValid = cx >= 0 && cx < W && cy >= 0 && cy < H && isTileWalkable(cx, cy);
            cells.push({ gx: cx, gy: cy, valid: cellValid });
          }

          const allValid = cells.every((c) => c.valid);
          return {
            gx: attachLeftWall ? 0 : Math.max(0.05, originGx),
            gy: attachLeftWall ? Math.max(0.05, originGy) : 0,
            flipped: attachLeftWall ? !flipped : flipped,
            layer: 'wall',
            parentSurfaceUid: undefined,
            elevationPx: 75,
            valid: allValid,
            hint: allValid
              ? attachLeftWall
                ? `Treo tường Trái (${span} ô) — [R] xoay`
                : `Treo tường Phải (${span} ô) — [R] xoay`
              : '⚠️ Phần tường này không có sàn phía dưới',
            cells,
          };
        }

        // Floor placement: snap integer grid origin & validate every footprint cell!
        const relCells = getRelativeFootprintCells(cat, flipped);
        const maxDx = Math.max(...relCells.map((c) => c.dx));
        const maxDy = Math.max(...relCells.map((c) => c.dy));
        const originGx = Math.floor(gx - maxDx / 2);
        const originGy = Math.floor(gy - maxDy / 2);

        const solidOccupied = new Set<string>();
        for (const item of state.layout.items) {
          if (item.uid === state.movingItemUid || item.layer !== 'floor') continue;
          const otherCat = getCatalogItem(item.catalogId);
          if (!otherCat || otherCat.walkable) continue;
          for (const c of getItemOccupiedCells(otherCat, item.gx, item.gy, item.flipped)) {
            solidOccupied.add(`${c.gx},${c.gy}`);
          }
        }

        const cells: PlacementCellStatus[] = relCells.map(({ dx, dy }) => {
          const cx = originGx + dx;
          const cy = originGy + dy;
          const hasFloor =
            cx >= 0 && cx < W && cy >= 0 && cy < H && isTileWalkable(cx, cy);
          const blocked = !cat.walkable && solidOccupied.has(`${cx},${cy}`);
          return { gx: cx, gy: cy, valid: hasFloor && !blocked };
        });

        const allValid = cells.every((c) => c.valid);
        return {
          gx: originGx,
          gy: originGy,
          flipped,
          layer: 'floor',
          parentSurfaceUid: undefined,
          elevationPx: 0,
          valid: allValid,
          hint: allValid
            ? `Click để đặt (${cells.length} ô) — [R] xoay hướng`
            : '⚠️ Có ô bị chồng lên đồ khác hoặc nằm ngoài sàn!',
          cells,
        };
      };

      // DOM Input Listeners on hostEl
      const canvas = instance.canvas;
      const toWorldGrid = (clientX: number, clientY: number) => {
        const rect = canvas.getBoundingClientRect();
        const canvasX = clientX - rect.left;
        const canvasY = clientY - rect.top;
        const localX = (canvasX - worldContainer.x) / camZoom;
        const localY = (canvasY - worldContainer.y) / camZoom;
        return {
          canvasX,
          canvasY,
          ...screenToGrid(localX, localY),
        };
      };

      const onContextMenu = (e: MouseEvent) => e.preventDefault();

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const step = e.deltaY > 0 ? -0.08 : 0.08;
        camZoom = Math.max(0.55, Math.min(1.85, Number((camZoom + step).toFixed(2))));
        setZoomUi(camZoom);
      };

      const onPointerDown = (e: PointerEvent) => {
        soundEngine.unlockAudio();
        const coords = toWorldGrid(e.clientX, e.clientY);
        const state = useGameStore.getState();

        // Middle click or Alt+Left or Right click (outside floor paint erase) -> Pan camera
        if (
          e.button === 1 ||
          (e.button === 0 && e.altKey) ||
          (e.button === 2 && !(state.buildMode && state.activeFloorBrush))
        ) {
          isPanning = true;
          panStart = { x: e.clientX - camPan.x, y: e.clientY - camPan.y };
          return;
        }

        if (e.button === 2 && state.buildMode && state.activeFloorBrush) {
          const tx = Math.floor(coords.gx);
          const ty = Math.floor(coords.gy);
          state.paintTile(tx, ty, '.');
          return;
        }

        if (e.button !== 0) return;
        isPointerDownLeft = true;

        // BUILD MODE CLICK
        if (state.buildMode) {
          // 1. Floor brush active
          if (state.activeFloorBrush) {
            state.paintTile(
              Math.floor(coords.gx),
              Math.floor(coords.gy),
              state.activeFloorBrush
            );
            return;
          }

          // 2. Placing newly selected item OR moving picked-up item
          const activeCatId = state.movingItemUid
            ? state.layout.items.find((i) => i.uid === state.movingItemUid)?.catalogId || null
            : state.selectedCatalogId;

          if (activeCatId) {
            const target = computePlacementTarget(
              coords.gx,
              coords.gy,
              activeCatId,
              state.placeFlipped
            );
            if (target && target.valid) {
              const existing = state.movingItemUid
                ? state.layout.items.find((i) => i.uid === state.movingItemUid)
                : undefined;

              const nextItem: PlacedItem = {
                uid:
                  existing?.uid ||
                  `item_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
                catalogId: activeCatId,
                gx: target.gx,
                gy: target.gy,
                rotation: existing?.rotation || 0,
                flipped: target.flipped,
                layer: target.layer,
                parentSurfaceUid: target.parentSurfaceUid,
                elevationPx: target.elevationPx,
                toggled: existing?.toggled || false,
              };
              state.placeOrUpdateItem(nextItem);
            } else {
              state.showToast('⚠️ Vị trí này chưa đặt được đồ!');
            }
            return;
          }

          // 3. No tool active: click an existing item to pick it up!
          const hit = pickItemAtScreen(coords.canvasX, coords.canvasY);
          if (hit) {
            state.startMovingItem(hit.uid);
          }
          return;
        }

        // NORMAL PLAY MODE CLICK: Interact with furniture / sit / walk
        const hit = pickItemAtScreen(coords.canvasX, coords.canvasY);
        if (hit) {
          const cat = getCatalogItem(hit.catalogId);
          if (cat?.seatSlots && cat.seatSlots.length > 0) {
            // Find an unoccupied slot if possible
            const allPlayers = Object.values(state.players);
            const freeSlot =
              cat.seatSlots.find(
                (slot) =>
                  !allPlayers.some(
                    (p) =>
                      p.id !== state.myPlayerId &&
                      p.seatedOnItemUid === hit.uid &&
                      p.seatSlotId === slot.id
                  )
              ) || cat.seatSlots[0];

            const metrics = getFootprintScreenMetrics(cat, hit.gx, hit.gy, hit.flipped);
            const seatGx =
              metrics.centroidGx + (hit.flipped ? freeSlot.offsetGy : freeSlot.offsetGx);
            const seatGy =
              metrics.centroidGy + (hit.flipped ? freeSlot.offsetGx : freeSlot.offsetGy);
            const seatFacing = hit.flipped
              ? mirrorFacingDirection(freeSlot.facing)
              : freeSlot.facing;
            walkTarget = null;
            state.seatAtItem(
              hit.uid,
              freeSlot.id,
              seatGx,
              seatGy,
              freeSlot.activity,
              seatFacing
            );
            return;
          }

          if (cat?.altSprite) {
            state.toggleItemInteraction(hit.uid);
            return;
          }
        }

        // Walk to clicked floor tile
        if (isTileWalkable(coords.gx, coords.gy)) {
          if (state.localPlayer.seatedOnItemUid || state.localPlayer.activity === 'sit_floor') {
            state.standUp();
          }
          walkTarget = { gx: coords.gx, gy: coords.gy };
        }
      };

      const onPointerMove = (e: PointerEvent) => {
        if (isPanning) {
          camPan = {
            x: e.clientX - panStart.x,
            y: e.clientY - panStart.y,
          };
          return;
        }

        const coords = toWorldGrid(e.clientX, e.clientY);
        hoverGrid = { gx: coords.gx, gy: coords.gy };
        const state = useGameStore.getState();

        if (state.buildMode) {
          if (isPointerDownLeft && state.activeFloorBrush) {
            state.paintTile(
              Math.floor(coords.gx),
              Math.floor(coords.gy),
              state.activeFloorBrush
            );
          }

          const activeCatId = state.movingItemUid
            ? state.layout.items.find((i) => i.uid === state.movingItemUid)?.catalogId || null
            : state.selectedCatalogId;

          if (activeCatId) {
            hoveredExistingItemUid = null;
            const target = computePlacementTarget(
              coords.gx,
              coords.gy,
              activeCatId,
              state.placeFlipped
            );
            setHoverHint(target?.hint || null);

            const now = performance.now();
            if (target && now - lastPreviewEmitAt > 85) {
              lastPreviewEmitAt = now;
              state.emitPreview({
                catalogId: activeCatId,
                gx: target.gx,
                gy: target.gy,
                flipped: target.flipped,
                elevationPx: target.elevationPx,
                layer: target.layer,
              });
            }
          } else {
            const hit = pickItemAtScreen(coords.canvasX, coords.canvasY);
            hoveredExistingItemUid = hit ? hit.uid : null;
            if (hit) {
              const cat = getCatalogItem(hit.catalogId);
              setHoverHint(`🖐️ Bấm để di chuyển / xóa: ${cat?.name || ''}`);
            } else {
              setHoverHint(
                state.activeFloorBrush
                  ? `🖌️ Click/Kéo để lát sàn (${state.activeFloorBrush})`
                  : null
              );
            }
          }
        } else {
          hoveredExistingItemUid = null;
          const hit = pickItemAtScreen(coords.canvasX, coords.canvasY);
          if (hit) {
            const cat = getCatalogItem(hit.catalogId);
            if (cat?.seatSlots?.length) {
              setHoverHint(`🪑 Bấm vào ${cat.name} để ngồi Focus/Chill`);
            } else if (cat?.altSprite) {
              setHoverHint(`✨ Bấm để bật/mở ${cat.name}`);
            } else {
              setHoverHint(null);
            }
          } else {
            setHoverHint(null);
          }
        }
      };

      const onPointerUp = () => {
        isPanning = false;
        isPointerDownLeft = false;
      };

      const onKeyDown = (e: KeyboardEvent) => {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;

        const key = e.key.toLowerCase();
        pressedKeys.add(key);

        const state = useGameStore.getState();
        if (key === 'b') {
          state.toggleBuildMode();
        } else if (key === 'g' && !state.buildMode) {
          state.sitOnFloor();
        } else if (key === 'r' && state.buildMode) {
          state.togglePlaceFlipped();
        } else if (
          (key === 'delete' || key === 'backspace') &&
          state.buildMode &&
          state.movingItemUid
        ) {
          state.removeItem(state.movingItemUid);
        } else if (key === 'escape' && state.buildMode) {
          if (state.movingItemUid) {
            state.startMovingItem(null);
          } else if (state.selectedCatalogId) {
            state.selectCatalogItem(null);
          } else {
            state.toggleBuildMode(false);
          }
        }
      };

      const onKeyUp = (e: KeyboardEvent) => {
        pressedKeys.delete(e.key.toLowerCase());
      };

      const onVisibilityChange = () => {
        if (!app) return;
        app.ticker.maxFPS = document.hidden ? 20 : 60;
      };

      canvas.addEventListener('contextmenu', onContextMenu);
      canvas.addEventListener('wheel', onWheel, { passive: false });
      canvas.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      document.addEventListener('visibilitychange', onVisibilityChange);

      // Main Pixi Game Loop
      instance.ticker.add((ticker) => {
        const dt = Math.min(ticker.deltaMS / 1000, 0.05);
        const now = Date.now();
        const state = useGameStore.getState();

        updateCameraTransform();

        // Check if static layout/buildMode changed
        const layoutSig = `${JSON.stringify(state.layout)}|${state.movingItemUid || ''}`;
        if (layoutSig !== lastLayoutSig || state.buildMode !== lastBuildMode) {
          lastLayoutSig = layoutSig;
          lastBuildMode = state.buildMode;
          rebuildStaticAndFurniture();
        }

        // 1. Local Player WASD + Click-to-Walk Movement
        let dx = 0;
        let dy = 0;
        if (pressedKeys.has('w') || pressedKeys.has('arrowup')) dy -= 1;
        if (pressedKeys.has('s') || pressedKeys.has('arrowdown')) dy += 1;
        if (pressedKeys.has('a') || pressedKeys.has('arrowleft')) dx -= 1;
        if (pressedKeys.has('d') || pressedKeys.has('arrowright')) dx += 1;

        const isRunning = pressedKeys.has('shift');
        const speed = isRunning ? 3.8 : 2.3; // grid tiles per second

        if (dx !== 0 || dy !== 0) {
          walkTarget = null;
          if (state.localPlayer.seatedOnItemUid || state.localPlayer.activity === 'sit_floor') {
            state.standUp();
          }

          // Convert screen direction to isometric grid delta:
          // sx = (gx - gy) * 60, sy = (gx + gy) * 30
          const len = Math.hypot(dx, dy);
          const ndx = dx / len;
          const ndy = dy / len;
          const dGx = ndx * 0.5 + ndy;
          const dGy = ndy - ndx * 0.5;
          const gLen = Math.hypot(dGx, dGy) || 1;

          const cur = state.localPlayer;
          const nextGx = cur.gx + (dGx / gLen) * speed * dt;
          const nextGy = cur.gy + (dGy / gLen) * speed * dt;

          const facing: FacingDirection =
            ndy < 0
              ? ndx <= 0
                ? 'nw'
                : 'ne'
              : ndx < 0
              ? 'sw'
              : 'se';

          const curWalk = isTileWalkable(cur.gx, cur.gy);
          const nextWalk = isTileWalkable(nextGx, nextGy);

          state.moveLocalPlayer({
            gx: nextWalk || !curWalk ? nextGx : cur.gx,
            gy: nextWalk || !curWalk ? nextGy : cur.gy,
            facing,
            isMoving: true,
            isRunning,
          });

          if (now - lastStepSfxAt > (isRunning ? 220 : 340)) {
            lastStepSfxAt = now;
            soundEngine.playSfx('step');
          }
        } else if (walkTarget) {
          const cur = state.localPlayer;
          const dgX = walkTarget.gx - cur.gx;
          const dgY = walkTarget.gy - cur.gy;
          const dist = Math.hypot(dgX, dgY);
          if (dist < 0.08) {
            walkTarget = null;
            state.moveLocalPlayer({
              gx: cur.gx,
              gy: cur.gy,
              facing: cur.facing,
              isMoving: false,
              isRunning: false,
            });
          } else {
            const stepGx = cur.gx + (dgX / dist) * speed * dt;
            const stepGy = cur.gy + (dgY / dist) * speed * dt;
            const screenDelta = gridToScreen(dgX, dgY);
            const facing: FacingDirection =
              screenDelta.y < 0
                ? screenDelta.x <= 0
                  ? 'nw'
                  : 'ne'
                : screenDelta.x < 0
                ? 'sw'
                : 'se';

            if (isTileWalkable(stepGx, stepGy)) {
              state.moveLocalPlayer({
                gx: stepGx,
                gy: stepGy,
                facing,
                isMoving: true,
                isRunning: false,
              });
              if (now - lastStepSfxAt > 340) {
                lastStepSfxAt = now;
                soundEngine.playSfx('step');
              }
            } else {
              walkTarget = null;
              state.moveLocalPlayer({
                gx: cur.gx,
                gy: cur.gy,
                facing,
                isMoving: false,
                isRunning: false,
              });
            }
          }
        } else if (state.localPlayer.isMoving) {
          state.moveLocalPlayer({
            gx: state.localPlayer.gx,
            gy: state.localPlayer.gy,
            facing: state.localPlayer.facing,
            isMoving: false,
            isRunning: false,
          });
        }

        // 2. Render Hover Diamond Cursor + Local Ghost Preview
        hoverCursor.clear();
        const H = state.layout.floorMap.length;
        const W = Math.max(...state.layout.floorMap.map((r) => r.length));

        if (state.buildMode && hoverGrid) {
          const activeCatId = state.movingItemUid
            ? state.layout.items.find((i) => i.uid === state.movingItemUid)?.catalogId || null
            : state.selectedCatalogId;

          if (state.activeFloorBrush) {
            const tx = Math.floor(hoverGrid.gx);
            const ty = Math.floor(hoverGrid.gy);
            if (tx >= 0 && tx < W && ty >= 0 && ty < H) {
              const pTop = gridToScreen(tx, ty);
              const pRight = gridToScreen(tx + 1, ty);
              const pBot = gridToScreen(tx + 1, ty + 1);
              const pLeft = gridToScreen(tx, ty + 1);
              hoverCursor.poly([
                pTop.x,
                pTop.y,
                pRight.x,
                pRight.y,
                pBot.x,
                pBot.y,
                pLeft.x,
                pLeft.y,
              ]);
              hoverCursor.fill({ color: 0x38bdf8, alpha: 0.35 });
              hoverCursor.stroke({ color: 0xffffff, width: 2, alpha: 0.9 });
            }
            localGhostSprite.visible = false;
          } else if (activeCatId) {
            const target = computePlacementTarget(
              hoverGrid.gx,
              hoverGrid.gy,
              activeCatId,
              state.placeFlipped
            );
            const cat = getCatalogItem(activeCatId);
            if (target && cat) {
              const placementPos = computeSpritePlacement(
                cat,
                target.gx,
                target.gy,
                target.flipped,
                target.layer,
                target.elevationPx
              );
              localGhostSprite.texture = getTex(cat.sprite);
              localGhostSprite.position.set(placementPos.x, placementPos.y);
              localGhostSprite.scale.set(
                cat.scale * (target.flipped ? -1 : 1),
                cat.scale
              );
              localGhostSprite.tint = !target.valid
                ? 0xf87171
                : target.layer === 'surface'
                ? 0x7dd3fc
                : 0x86efac;
              localGhostSprite.zIndex = placementPos.depth + 80;
              localGhostSprite.visible = true;

              if (target.layer === 'surface') {
                const r = 0.25;
                const eY = target.elevationPx;
                const pTop = gridToScreen(target.gx - r, target.gy - r);
                const pRight = gridToScreen(target.gx + r, target.gy - r);
                const pBot = gridToScreen(target.gx + r, target.gy + r);
                const pLeft = gridToScreen(target.gx - r, target.gy + r);
                hoverCursor.poly([
                  pTop.x,
                  pTop.y - eY,
                  pRight.x,
                  pRight.y - eY,
                  pBot.x,
                  pBot.y - eY,
                  pLeft.x,
                  pLeft.y - eY,
                ]);
                hoverCursor.fill({ color: 0x38bdf8, alpha: 0.42 });
                hoverCursor.stroke({ color: 0xe0f2fe, width: 2 });
              } else {
                // Draw each occupied tile in the exact footprint shape (e.g. L-shape, 1x3, 2x1, 1x1)
                for (const cell of target.cells) {
                  const pTop = gridToScreen(cell.gx, cell.gy);
                  const pRight = gridToScreen(cell.gx + 1, cell.gy);
                  const pBot = gridToScreen(cell.gx + 1, cell.gy + 1);
                  const pLeft = gridToScreen(cell.gx, cell.gy + 1);
                  hoverCursor.poly([
                    pTop.x,
                    pTop.y,
                    pRight.x,
                    pRight.y,
                    pBot.x,
                    pBot.y,
                    pLeft.x,
                    pLeft.y,
                  ]);
                  hoverCursor.fill({
                    color: cell.valid ? 0x22c55e : 0xef4444,
                    alpha: cell.valid ? 0.38 : 0.52,
                  });
                  hoverCursor.stroke({
                    color: cell.valid ? 0xffffff : 0xfca5a5,
                    width: 1,
                    alpha: 0.4,
                  });
                }

                // Draw crisp outer perimeter outline of the exact shape
                for (const edge of getFootprintBoundaryEdges(target.cells)) {
                  const p1 = gridToScreen(edge.x1, edge.y1);
                  const p2 = gridToScreen(edge.x2, edge.y2);
                  hoverCursor.moveTo(p1.x, p1.y);
                  hoverCursor.lineTo(p2.x, p2.y);
                }
                hoverCursor.stroke({
                  color: target.valid ? 0x86efac : 0xfca5a5,
                  width: 3,
                  alpha: 0.95,
                });
              }
            }
          } else {
            localGhostSprite.visible = false;
            if (hoveredExistingItemUid) {
              const hoveredItem = state.layout.items.find(
                (i) => i.uid === hoveredExistingItemUid
              );
              const hoveredCat = hoveredItem
                ? getCatalogItem(hoveredItem.catalogId)
                : undefined;
              if (hoveredItem && hoveredCat && hoveredItem.layer !== 'surface') {
                const cells =
                  hoveredItem.layer === 'wall'
                    ? getWallItemCells(
                        hoveredCat,
                        hoveredItem.gx,
                        hoveredItem.gy,
                        hoveredItem.flipped
                      )
                    : getItemOccupiedCells(
                        hoveredCat,
                        hoveredItem.gx,
                        hoveredItem.gy,
                        hoveredItem.flipped
                      );
                for (const cell of cells) {
                  const pTop = gridToScreen(cell.gx, cell.gy);
                  const pRight = gridToScreen(cell.gx + 1, cell.gy);
                  const pBot = gridToScreen(cell.gx + 1, cell.gy + 1);
                  const pLeft = gridToScreen(cell.gx, cell.gy + 1);
                  hoverCursor.poly([
                    pTop.x,
                    pTop.y,
                    pRight.x,
                    pRight.y,
                    pBot.x,
                    pBot.y,
                    pLeft.x,
                    pLeft.y,
                  ]);
                  hoverCursor.fill({ color: 0x38bdf8, alpha: 0.24 });
                }
                for (const edge of getFootprintBoundaryEdges(cells)) {
                  const p1 = gridToScreen(edge.x1, edge.y1);
                  const p2 = gridToScreen(edge.x2, edge.y2);
                  hoverCursor.moveTo(p1.x, p1.y);
                  hoverCursor.lineTo(p2.x, p2.y);
                }
                hoverCursor.stroke({ color: 0x7dd3fc, width: 2.5, alpha: 0.9 });
              }
            }
          }
        } else {
          localGhostSprite.visible = false;
        }

        // 3. Render Remote Ghost Previews
        remoteGhostContainer.removeChildren();
        for (const preview of Object.values(state.ghostPreviews)) {
          if (preview.playerId === state.myPlayerId) continue;
          const cat = getCatalogItem(preview.catalogId);
          if (!cat) continue;
          const pos = computeSpritePlacement(
            cat,
            preview.gx,
            preview.gy,
            preview.flipped,
            preview.layer,
            preview.elevationPx
          );
          const gSpr = new Sprite(getTex(cat.sprite));
          gSpr.anchor.set(0.5, 1.0);
          gSpr.position.set(pos.x, pos.y);
          gSpr.scale.set(cat.scale * (preview.flipped ? -1 : 1), cat.scale);
          gSpr.alpha = 0.48;
          gSpr.tint = 0xf472b6;
          remoteGhostContainer.addChild(gSpr);
        }

        // 4. Render & Interpolate Avatars + UI Badges
        const allPlayers = state.players;
        for (const id of Array.from(avatarVisuals.keys())) {
          if (!allPlayers[id]) {
            const v = avatarVisuals.get(id)!;
            sortLayer.removeChild(v.container);
            avatarUiLayer.removeChild(v.uiContainer);
            v.container.destroy({ children: true });
            v.uiContainer.destroy({ children: true });
            avatarVisuals.delete(id);
          }
        }

        for (const player of Object.values(allPlayers)) {
          let vis = avatarVisuals.get(player.id);
          if (!vis) {
            const container = new Container();
            const shadow = new Graphics();
            shadow.ellipse(0, 0, 16, 7);
            shadow.fill({ color: 0x090512, alpha: 0.45 });

            const focusRing = new Graphics();
            focusRing.ellipse(0, -4, 24, 11);
            focusRing.stroke({ color: 0xf472b6, width: 2, alpha: 0.75 });
            focusRing.visible = false;

            const sprite = new Sprite();
            sprite.anchor.set(0.5, 1.0);

            container.addChild(shadow, focusRing, sprite);
            sortLayer.addChild(container);

            const uiContainer = new Container();
            avatarUiLayer.addChild(uiContainer);

            vis = {
              container,
              sprite,
              shadow,
              focusRing,
              uiContainer,
              gx: player.gx,
              gy: player.gy,
              walkPhase: 0,
            };
            avatarVisuals.set(player.id, vis);
          }

          // Smooth interpolation (local snappy, remote interpolated)
          const lerpRate = player.id === state.myPlayerId ? 1 : Math.min(1, dt * 14);
          vis.gx += (player.gx - vis.gx) * lerpRate;
          vis.gy += (player.gy - vis.gy) * lerpRate;

          const screenPos = gridToScreen(vis.gx, vis.gy);
          const seatOffsetY = player.seatedOnItemUid
            ? -8
            : player.activity === 'sit_floor'
            ? 2
            : 0;
          vis.container.position.set(screenPos.x, screenPos.y + seatOffsetY);
          vis.container.zIndex = (vis.gx + vis.gy) * 100 + 26;

          const isoChar = isIsoCharacter(player.outfit);
          const baseScale = getCharacterBaseScale(player.outfit);

          if (player.isMoving) {
            vis.walkPhase += dt * (isoChar ? (player.isRunning ? 12 : 8) : player.isRunning ? 18 : 11);
          } else {
            vis.walkPhase += dt * 3.2;
          }

          const resolved = resolveIsoCharacterFrame(
            player.outfit,
            player.facing,
            player.activity,
            player.isMoving,
            Math.floor(vis.walkPhase)
          );
          const flipX = resolved.flipX ? -1 : 1;
          vis.sprite.texture = getTex(resolved.path);

          if (player.isMoving) {
            if (isoChar) {
              const stepBob = 1 + Math.abs(Math.sin(vis.walkPhase * Math.PI * 0.5)) * 0.025;
              vis.sprite.rotation = 0;
              vis.sprite.scale.set(baseScale * flipX, baseScale * stepBob);
            } else {
              const bobY = 1 + Math.sin(vis.walkPhase * 2) * (player.isRunning ? 0.08 : 0.04);
              const squashX = 1 - Math.sin(vis.walkPhase * 2) * (player.isRunning ? 0.05 : 0.025);
              vis.sprite.rotation =
                (Math.sin(vis.walkPhase) * (player.isRunning ? 6 : 3) * Math.PI) / 180;
              vis.sprite.scale.set(baseScale * squashX * flipX, baseScale * bobY);
            }
          } else {
            const breath =
              player.activity === 'focus_desk'
                ? 1 + Math.sin(vis.walkPhase * 1.6) * 0.02
                : 1 + Math.sin(vis.walkPhase) * 0.015;
            vis.sprite.rotation = 0;
            vis.sprite.scale.set(baseScale * flipX, baseScale * breath);
          }

          vis.focusRing.visible = player.activity === 'focus_desk';
          if (vis.focusRing.visible) {
            const pulse = 1 + Math.sin(now / 300) * 0.08;
            vis.focusRing.scale.set(pulse);
          }

          // Update Floating Nameplate + Status + Chat Bubble + Emote
          vis.uiContainer.position.set(screenPos.x, screenPos.y + seatOffsetY - 118);
          vis.uiContainer.removeChildren();

          const nameText = new Text({
            text: player.name,
            style: new TextStyle({
              fontSize: 11,
              fontWeight: '700',
              fill: 0xffffff,
              fontFamily: 'Inter, sans-serif',
            }),
          });
          nameText.anchor.set(0.5, 0.5);

          const badgeW = Math.max(58, nameText.width + 16);
          const badgeBg = new Graphics();
          badgeBg.roundRect(-badgeW / 2, -11, badgeW, 20, 10);
          badgeBg.fill({ color: 0x181026, alpha: 0.82 });
          badgeBg.stroke({
            color: player.tintColor || '#f472b6',
            width: 1.5,
          });
          vis.uiContainer.addChild(badgeBg, nameText);

          // Activity / Pinned Todo status pill
          if (player.statusText) {
            const st = new Text({
              text: player.statusText,
              style: new TextStyle({
                fontSize: 10,
                fontWeight: '600',
                fill: 0xfde68a,
                fontFamily: 'Inter, sans-serif',
              }),
            });
            st.anchor.set(0.5, 0.5);
            st.position.set(0, -24);
            const stW = st.width + 14;
            const stBg = new Graphics();
            stBg.roundRect(-stW / 2, -33, stW, 17, 8);
            stBg.fill({ color: 0x1e1530, alpha: 0.78 });
            vis.uiContainer.addChild(stBg, st);
          }

          // Speech Bubble
          if (player.chatBubble && player.chatBubble.expiresAt > now) {
            const chat = new Text({
              text: player.chatBubble.text,
              style: new TextStyle({
                fontSize: 11,
                fontWeight: '600',
                fill: 0x1e1b2e,
                wordWrap: true,
                wordWrapWidth: 165,
                fontFamily: 'Inter, sans-serif',
              }),
            });
            chat.anchor.set(0.5, 1);
            chat.position.set(0, -46);
            const cw = Math.max(48, chat.width + 18);
            const ch = chat.height + 12;
            const cb = new Graphics();
            cb.roundRect(-cw / 2, -46 - ch + 5, cw, ch, 10);
            cb.fill({ color: 0xffffff, alpha: 0.96 });
            cb.stroke({ color: 0xf472b6, width: 1.5 });
            vis.uiContainer.addChild(cb, chat);
          }

          // Floating Emote
          if (player.emote && player.emote.expiresAt > now) {
            const floatOffset = ((2600 - (player.emote.expiresAt - now)) / 2600) * 28;
            const emo = new Text({
              text: player.emote.icon,
              style: new TextStyle({ fontSize: 22 }),
            });
            emo.anchor.set(0.5, 0.5);
            emo.position.set(0, -52 - floatOffset);
            vis.uiContainer.addChild(emo);
          }
        }

        // 5. Atmosphere Lighting & Rain VFX
        nightTint.clear();
        if (state.layout.lightingMode === 'night') {
          nightTint.rect(-2400, -1600, 4800, 3200);
          nightTint.fill({ color: 0x0b071c, alpha: 0.36 });
          glowContainer.visible = true;
        } else if (state.layout.lightingMode === 'sunset') {
          nightTint.rect(-2400, -1600, 4800, 3200);
          nightTint.fill({ color: 0xf59e0b, alpha: 0.1 });
          glowContainer.visible = true;
        } else {
          glowContainer.visible = false;
        }

        rainGraphics.clear();
        if (state.layout.rainEnabled) {
          for (const drop of rainDrops) {
            drop.x -= drop.speed * 0.25 * dt;
            drop.y += drop.speed * dt;
            if (drop.y > 650 || drop.x < -1000) {
              drop.y = -450 - Math.random() * 200;
              drop.x = (Math.random() - 0.3) * 1800;
            }
            rainGraphics.moveTo(drop.x, drop.y);
            rainGraphics.lineTo(drop.x - drop.len * 0.25, drop.y + drop.len);
          }
          rainGraphics.stroke({ color: 0xbae6fd, width: 1.2, alpha: 0.28 });
        }
      });

      instance.canvas.dataset.ready = 'true';

      return () => {
        canvas.removeEventListener('contextmenu', onContextMenu);
        canvas.removeEventListener('wheel', onWheel);
        canvas.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        document.removeEventListener('visibilitychange', onVisibilityChange);
      };
    };

    let cleanupListeners: (() => void) | undefined;
    void boot().then((fn) => {
      cleanupListeners = fn;
    });

    return () => {
      destroyed = true;
      cleanupListeners?.();
      for (const tex of glowTextureCache.values()) {
        tex.destroy(true);
      }
      glowTextureCache.clear();
      if (app) {
        app.destroy(true, { children: true });
        app = null;
      }
    };
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#120d1d]">
      <div ref={containerRef} className="w-full h-full cursor-crosshair" />

      {/* Camera Zoom & Reset Pill */}
      <div className="fixed bottom-4 left-4 z-30 flex items-center gap-1 rounded-full bg-[#1a1228]/85 backdrop-blur-md border border-pink-300/25 px-2 py-1 shadow-lg">
        <button
          onClick={() => camControlRef.current?.zoomBy(-0.15)}
          title="Thu nhỏ (Cuộn chuột)"
          className="p-1.5 rounded-full hover:bg-white/10 text-pink-200 transition"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="text-[11px] font-semibold text-pink-100 px-1 min-w-[40px] text-center">
          {Math.round(zoomUi * 100)}%
        </span>
        <button
          onClick={() => camControlRef.current?.zoomBy(0.15)}
          title="Phóng to (Cuộn chuột)"
          className="p-1.5 rounded-full hover:bg-white/10 text-pink-200 transition"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => camControlRef.current?.resetCam()}
          title="Đưa camera về giữa (Chuột phải kéo để di chuyển góc nhìn)"
          className="p-1.5 rounded-full hover:bg-white/10 text-pink-200 transition border-l border-white/10 pl-2"
        >
          <Compass className="w-4 h-4" />
        </button>
      </div>

      {/* Contextual Hover Tooltip */}
      {hoverHint && (
        <div className="pointer-events-none fixed bottom-20 left-1/2 -translate-x-1/2 z-30 rounded-full bg-[#181026]/90 backdrop-blur-md border border-pink-300/35 px-4 py-1.5 text-xs font-medium text-pink-100 shadow-lg">
          {hoverHint}
        </div>
      )}
    </div>
  );
};
