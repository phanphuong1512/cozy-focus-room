import type { CustomAvatarConfig } from './types';

const W = 180;
const H = 240;
const OUTLINE = '#2b1810';

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return [243, 210, 179];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function shadeHex(hex: string, factor: number): string {
  const [r, g, b] = hexToRgb(hex);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `rgb(${clamp(r * factor)}, ${clamp(g * factor)}, ${clamp(b * factor)})`;
}

// Helper to draw crisp 3px-grid pixel blocks matching the base character pixel scale
function px(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  gw: number,
  gh: number,
  color: string
) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(gx * 3), Math.round(gy * 3), Math.round(gw * 3), Math.round(gh * 3));
}

export interface AvatarFrameContext {
  isBack: boolean;
  isSitting: boolean;
  walkFrame: number; // 0..3 or -1 if idle
}

export function parseFrameContext(framePath: string): AvatarFrameContext {
  const isBack = framePath.includes('_nw');
  const isSitting = framePath.includes('sit_');
  const m = framePath.match(/walk_(?:se|nw)_(\d)/);
  const walkFrame = m ? Number(m[1]) : -1;
  return { isBack, isSitting, walkFrame };
}

/**
 * Composites a full 180x240 pixel-art character frame onto a canvas
 * using the base mannequin image + user's CustomAvatarConfig.
 */
export function renderCustomAvatarToCanvas(
  baseImg: HTMLImageElement,
  config: CustomAvatarConfig,
  frameCtx: AvatarFrameContext,
  targetCanvas?: HTMLCanvasElement,
  hairImg?: HTMLImageElement | null
): HTMLCanvasElement {
  const canvas = targetCanvas || document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, W, H);

  // 1. Draw base mannequin and natively recolor skin, top, bottoms & shoes by body zone
  // (preserving every original pixel outline and isometric shading instead of drawing blocky overlays)
  ctx.drawImage(baseImg, 0, 0, W, H);
  const defaultSkin = '#f3d2b3';
  const [sr, sg, sb] = hexToRgb(defaultSkin);
  const [skinR, skinG, skinB] = hexToRgb(config.skinTone);
  const [topR, topG, topB] = hexToRgb(config.topColor);
  const [botR, botG, botB] = hexToRgb(config.bottomColor);
  const [shoeR, shoeG, shoeB] = hexToRgb(config.shoeColor);

  const imgData = ctx.getImageData(0, 0, W, H);
  const data = imgData.data;
  const torsoEnd = frameCtx.isSitting ? 156 : 162;
  const legEnd = frameCtx.isSitting ? 196 : 214;
  const recolorSkin = config.skinTone.toLowerCase() !== defaultSkin;

  for (let py = 0; py < H; py++) {
    for (let pxX = 0; pxX < W; pxX++) {
      const i = (py * W + pxX) * 4;
      if (data[i + 3] < 20) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      // Preserve dark outlines
      if (r < 85 && g < 68 && b < 64) continue;

      // Determine target palette color for this pixel's body zone
      let target: [number, number, number] | null = null;
      if (py <= 108) {
        if (recolorSkin) target = [skinR, skinG, skinB];
      } else if (py <= torsoEnd) {
        const isHand = py >= 150 && (pxX < 65 || pxX > 120);
        const isTshirtArm = config.topStyle === 'tshirt' && py >= 132 && (pxX < 66 || pxX > 119);
        if (isHand || isTshirtArm) {
          if (recolorSkin) target = [skinR, skinG, skinB];
        } else {
          target = [topR, topG, topB];
        }
      } else if (py <= legEnd) {
        const isHand = py <= 180 && (pxX < 65 || pxX > 119);
        if (isHand) {
          if (recolorSkin) target = [skinR, skinG, skinB];
        } else if (config.topStyle === 'dress' && py <= 185) {
          target = [topR, topG, topB];
        } else {
          target = [botR, botG, botB];
        }
      } else {
        target = [shoeR, shoeG, shoeB];
      }

      if (target) {
        data[i] = Math.max(0, Math.min(255, Math.round((r / sr) * target[0])));
        data[i + 1] = Math.max(0, Math.min(255, Math.round((g / sg) * target[1])));
        data[i + 2] = Math.max(0, Math.min(255, Math.round((b / sb) * target[2])));
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);

  // Head & body anchor offsets (in 3px grid units: 60x80 grid!)
  const hx = frameCtx.isSitting ? 29.5 : 31;
  const hy = 21;
  const bx = frameCtx.isSitting ? 29.5 : 31;
  const by = 38;

  const topDark = shadeHex(config.topColor, 0.72);
  const topLight = shadeHex(config.topColor, 1.15);
  const hairHex = config.hairColor === 'original' ? '#5c3a21' : config.hairColor;
  const hairDark = shadeHex(hairHex, 0.7);
  const hairLight = shadeHex(hairHex, 1.2);

  // 2. Subtle clothing surface details (inside mannequin torso silhouette, no blocky boxes)
  if (!frameCtx.isBack) {
    if (config.topStyle === 'hoodie') {
      px(ctx, bx - 2, by + 2, 1, 4, '#f8fafc');
      px(ctx, bx + 2, by + 2, 1, 4, '#f8fafc');
      px(ctx, bx - 4, by + 9, 8, 3, topDark);
    } else if (config.topStyle === 'cardigan') {
      px(ctx, bx - 1, by + 1, 3, 12, '#f8fafc');
      px(ctx, bx, by + 3, 1, 1, OUTLINE);
      px(ctx, bx, by + 7, 1, 1, OUTLINE);
      px(ctx, bx, by + 11, 1, 1, OUTLINE);
    } else if (config.topStyle === 'sweater') {
      px(ctx, bx - 4, by + 1, 8, 2, topLight);
      px(ctx, bx - 5, by + 12, 10, 2, topLight);
    }
  }

  // 4. Face (Eyes & Blush) - only when facing forward (SE/SW)
  if (!frameCtx.isBack) {
    const ey = hy + 1;
    const exL = hx - 2;
    const exR = hx + 5;

    if (config.blush) {
      px(ctx, exL - 2, ey + 3, 2, 1, '#fb7185');
      px(ctx, exR + 1, ey + 3, 2, 1, '#fb7185');
    }

    if (config.eyeStyle === 'cute') {
      // Big expressive eyes with white sparkle
      px(ctx, exL, ey, 2, 3, '#1e1b4b');
      px(ctx, exL, ey, 1, 1, '#ffffff');
      px(ctx, exR, ey, 2, 3, '#1e1b4b');
      px(ctx, exR, ey, 1, 1, '#ffffff');
    } else if (config.eyeStyle === 'happy') {
      px(ctx, exL, ey + 1, 2, 1, '#1e1b4b');
      px(ctx, exL - 1, ey + 2, 1, 1, '#1e1b4b');
      px(ctx, exR, ey + 1, 2, 1, '#1e1b4b');
      px(ctx, exR + 2, ey + 2, 1, 1, '#1e1b4b');
    } else if (config.eyeStyle === 'cool') {
      px(ctx, exL - 1, ey, 3, 1, '#1e1b4b');
      px(ctx, exL, ey + 1, 2, 2, '#1e1b4b');
      px(ctx, exR, ey, 3, 1, '#1e1b4b');
      px(ctx, exR, ey + 1, 2, 2, '#1e1b4b');
    } else if (config.eyeStyle === 'sleepy') {
      px(ctx, exL, ey + 1, 3, 1, '#1e1b4b');
      px(ctx, exL + 1, ey + 2, 1, 1, '#312e81');
      px(ctx, exR, ey + 1, 3, 1, '#1e1b4b');
      px(ctx, exR + 1, ey + 2, 1, 1, '#312e81');
    } else if (config.eyeStyle === 'wink') {
      px(ctx, exL, ey, 2, 3, '#1e1b4b');
      px(ctx, exL, ey, 1, 1, '#ffffff');
      px(ctx, exR, ey + 1, 3, 1, '#1e1b4b');
    }
  }

  // 5. Hair Layer
  if (hairImg) {
    const dx = frameCtx.isSitting ? -4 : 0;
    if (config.hairColor === 'original') {
      ctx.drawImage(hairImg, dx, 0, W, H);
    } else {
      const hairCanvas = document.createElement('canvas');
      hairCanvas.width = W;
      hairCanvas.height = H;
      const hctx = hairCanvas.getContext('2d')!;
      hctx.imageSmoothingEnabled = false;
      hctx.drawImage(hairImg, 0, 0, W, H);
      const imgData = hctx.getImageData(0, 0, W, H);
      const data = imgData.data;
      const [tr, tg, tb] = hexToRgb(hairHex);
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 20) continue;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        // Preserve dark outer outlines
        if (r < 32 && g < 32 && b < 32) continue;
        // Luminance-preserving tint so highlights & shadows remain crisp
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 140;
        const factor = Math.max(0.35, Math.min(1.45, lum));
        data[i] = Math.max(0, Math.min(255, Math.round(tr * factor)));
        data[i + 1] = Math.max(0, Math.min(255, Math.round(tg * factor)));
        data[i + 2] = Math.max(0, Math.min(255, Math.round(tb * factor)));
      }
      hctx.putImageData(imgData, 0, 0);
      ctx.drawImage(hairCanvas, dx, 0);
    }
  } else if (config.hairStyle !== 'none') {
    if (frameCtx.isBack) {
      // Back of head hair coverage
      px(ctx, hx - 12, hy - 14, 24, 18, OUTLINE);
      px(ctx, hx - 11, hy - 13, 22, 16, hairHex);
      px(ctx, hx - 9, hy - 11, 18, 3, hairLight);
      px(ctx, hx - 11, hy, 22, 4, hairDark);
    } else {
      // Top cap + bangs
      px(ctx, hx - 12, hy - 15, 24, 10, OUTLINE);
      px(ctx, hx - 11, hy - 14, 22, 8, hairHex);
      px(ctx, hx - 7, hy - 12, 14, 2, hairLight);
      // Side locks framing face
      px(ctx, hx - 12, hy - 7, 5, 11, OUTLINE);
      px(ctx, hx - 11, hy - 7, 3, 10, hairHex);
      // Front bangs
      px(ctx, hx - 8, hy - 6, 18, 4, OUTLINE);
      px(ctx, hx - 7, hy - 6, 16, 3, hairHex);
    }

    if (config.hairStyle === 'spiky') {
      px(ctx, hx - 10, hy - 18, 4, 4, hairHex);
      px(ctx, hx - 2, hy - 19, 5, 5, hairHex);
      px(ctx, hx + 6, hy - 17, 4, 4, hairHex);
    } else if (config.hairStyle === 'bob') {
      px(ctx, hx - 13, hy - 2, 5, 14, OUTLINE);
      px(ctx, hx - 12, hy - 2, 3, 13, hairHex);
      if (frameCtx.isBack) {
        px(ctx, hx - 11, hy + 2, 22, 8, hairHex);
      }
    } else if (config.hairStyle === 'long') {
      px(ctx, hx - 13, hy - 2, 5, 22, OUTLINE);
      px(ctx, hx - 12, hy - 2, 3, 20, hairHex);
      if (frameCtx.isBack) {
        px(ctx, hx - 11, hy + 2, 22, 18, OUTLINE);
        px(ctx, hx - 10, hy + 2, 20, 17, hairHex);
      }
    } else if (config.hairStyle === 'ponytail') {
      px(ctx, hx - 15, hy - 10, 5, 14, OUTLINE);
      px(ctx, hx - 14, hy - 9, 3, 12, hairHex);
      px(ctx, hx - 13, hy - 10, 2, 2, '#f472b6');
    } else if (config.hairStyle === 'bun') {
      px(ctx, hx - 5, hy - 20, 10, 6, OUTLINE);
      px(ctx, hx - 4, hy - 19, 8, 4, hairHex);
      px(ctx, hx - 2, hy - 18, 4, 1, hairLight);
    }
  }

  // 6. Accessories
  if (config.accessory === 'headphones') {
    px(ctx, hx - 11, hy - 16, 22, 3, OUTLINE);
    px(ctx, hx - 10, hy - 15, 20, 2, '#38bdf8');
    // Ear cups
    px(ctx, hx - 14, hy - 4, 5, 8, OUTLINE);
    px(ctx, hx - 13, hy - 3, 3, 6, '#38bdf8');
    if (!frameCtx.isBack) {
      px(ctx, hx + 11, hy - 4, 3, 7, OUTLINE);
      px(ctx, hx + 11, hy - 3, 2, 5, '#0284c7');
    }
  } else if (config.accessory === 'cat_ears') {
    px(ctx, hx - 10, hy - 20, 5, 6, OUTLINE);
    px(ctx, hx - 9, hy - 19, 3, 4, '#f472b6');
    px(ctx, hx + 5, hy - 20, 5, 6, OUTLINE);
    px(ctx, hx + 6, hy - 19, 3, 4, '#f472b6');
  } else if (config.accessory === 'cap') {
    px(ctx, hx - 12, hy - 16, 24, 8, OUTLINE);
    px(ctx, hx - 11, hy - 15, 22, 6, '#fb7185');
    if (!frameCtx.isBack) {
      px(ctx, hx - 2, hy - 10, 17, 3, OUTLINE);
      px(ctx, hx - 1, hy - 9, 15, 2, '#e11d48');
    }
  } else if (config.accessory === 'beanie') {
    px(ctx, hx - 12, hy - 17, 24, 9, OUTLINE);
    px(ctx, hx - 11, hy - 16, 22, 7, '#fbbf24');
    px(ctx, hx - 12, hy - 11, 24, 3, '#d97706');
    px(ctx, hx - 3, hy - 20, 6, 4, OUTLINE);
    px(ctx, hx - 2, hy - 19, 4, 2, '#fef3c7');
  } else if (config.accessory === 'glasses' && !frameCtx.isBack) {
    const ey = hy + 1;
    px(ctx, hx - 4, ey - 1, 5, 4, OUTLINE);
    px(ctx, hx - 3, ey, 3, 2, 'rgba(186, 230, 253, 0.45)');
    px(ctx, hx + 1, ey, 3, 1, OUTLINE);
    px(ctx, hx + 4, ey - 1, 5, 4, OUTLINE);
    px(ctx, hx + 5, ey, 3, 2, 'rgba(186, 230, 253, 0.45)');
  } else if (config.accessory === 'bow') {
    px(ctx, hx - 12, hy - 14, 7, 5, OUTLINE);
    px(ctx, hx - 11, hy - 13, 5, 3, '#f472b6');
  }

  return canvas;
}
