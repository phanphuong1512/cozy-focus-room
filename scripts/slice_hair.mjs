import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = process.cwd();
const SRC_PATH = path.join(ROOT, 'assets/hair/girl-hair.png');
const OUT_DIR = path.join(ROOT, 'public/sprites/characters/hair');

const TARGET_W = 180;
const TARGET_H = 240;

// ---------------------------------------------------------------------------
// Minimal PNG Reader / Writer (RGB & RGBA)
// ---------------------------------------------------------------------------
function readPng(filePath) {
  const buf = fs.readFileSync(filePath);
  const sig = buf.subarray(0, 8);
  if (!sig.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error(`Not a PNG: ${filePath}`);
  }
  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`Unsupported PNG format (${bitDepth}bit, type ${colorType}) in ${filePath}`);
  }

  const bpp = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const stride = width * bpp;
  const rgba = Buffer.alloc(width * height * 4);

  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const rowStart = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      let val = raw[rowStart + x];
      const px = Math.floor(x / bpp);
      const ch = x % bpp;
      const a = px > 0 ? rgba[(y * width + (px - 1)) * 4 + ch] : 0;
      const b = y > 0 ? rgba[((y - 1) * width + px) * 4 + ch] : 0;
      const c = px > 0 && y > 0 ? rgba[((y - 1) * width + (px - 1)) * 4 + ch] : 0;
      if (filter === 1) val = (val + a) & 0xff;
      else if (filter === 2) val = (val + b) & 0xff;
      else if (filter === 3) val = (val + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) val = (val + paeth(a, b, c)) & 0xff;
      rgba[(y * width + px) * 4 + ch] = val;
      if (bpp === 3 && ch === 2) rgba[(y * width + px) * 4 + 3] = 255;
    }
  }

  return { width, height, rgba };
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function writePng(filePath, width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowOut = y * (width * 4 + 1);
    raw[rowOut] = 0;
    rgba.copy(raw, rowOut + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    Buffer.concat([
      sig,
      makeChunk('IHDR', ihdr),
      makeChunk('IDAT', compressed),
      makeChunk('IEND', Buffer.alloc(0)),
    ])
  );
}

// ---------------------------------------------------------------------------
// Pixel Classification & Hair Extraction
// ---------------------------------------------------------------------------
function isNearWhite(r, g, b) {
  return r > 228 && g > 228 && b > 228;
}

function isSkinPixel(r, g, b) {
  // Base mannequin beige/tan skin + chin/neck shadows:
  // Auburn hair has r-g > 65; brown/black hair has r < 95.
  return (
    r >= 120 &&
    g >= 85 &&
    b >= 60 &&
    r > g &&
    g > b &&
    r - b >= 20 &&
    r - g <= 55 &&
    g - b <= 52
  );
}

function isDarkOutline(r, g, b) {
  return r < 55 && g < 55 && b < 55;
}

function extractHairCell(src, cellX, cellY, cellW, cellH) {
  const cell = Buffer.alloc(cellW * cellH * 4);
  for (let y = 0; y < cellH; y++) {
    for (let x = 0; x < cellW; x++) {
      const si = ((cellY + y) * src.width + (cellX + x)) * 4;
      const di = (y * cellW + x) * 4;
      cell[di] = src.rgba[si];
      cell[di + 1] = src.rgba[si + 1];
      cell[di + 2] = src.rgba[si + 2];
      cell[di + 3] = 255;
    }
  }

  // 1. Measure skull crown topY and horizontal center before masking
  let minY = cellH;
  for (let y = 10; y < 160; y++) {
    for (let x = 20; x < cellW - 20; x++) {
      const i = (y * cellW + x) * 4;
      if (cell[i] < 220 || cell[i + 1] < 220 || cell[i + 2] < 220) {
        if (y < minY) minY = y;
      }
    }
  }
  let spanMinX = cellW;
  let spanMaxX = 0;
  const sy = minY + 90;
  for (let x = 20; x < cellW - 20; x++) {
    const i = (sy * cellW + x) * 4;
    if (cell[i] < 220 || cell[i + 1] < 220 || cell[i + 2] < 220) {
      if (x < spanMinX) spanMinX = x;
      if (x > spanMaxX) spanMaxX = x;
    }
  }
  const crownCenterX = (spanMinX + spanMaxX) / 2;

  // 2. Flood-fill white background ONLY from borders (keeps enclosed hair highlights intact!)
  const wasWhite = new Uint8Array(cellW * cellH);
  const visited = new Uint8Array(cellW * cellH);
  const queue = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= cellW || y >= cellH) return;
    const p = y * cellW + x;
    if (visited[p]) return;
    const i = p * 4;
    if (isNearWhite(cell[i], cell[i + 1], cell[i + 2])) {
      visited[p] = 1;
      wasWhite[p] = 1;
      cell[i + 3] = 0;
      queue.push(p);
    }
  };
  for (let x = 0; x < cellW; x++) {
    push(x, 0);
    push(x, cellH - 1);
  }
  for (let y = 0; y < cellH; y++) {
    push(0, y);
    push(cellW - 1, y);
  }
  let head = 0;
  while (head < queue.length) {
    const p = queue[head++];
    const x = p % cellW;
    const y = (p - x) / cellW;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  // Clear only pure-white neutral enclosed gaps (between strands/neck) where max-min < 12
  for (let p = 0; p < cellW * cellH; p++) {
    const i = p * 4;
    if (cell[i + 3] > 0) {
      const r = cell[i], g = cell[i + 1], b = cell[i + 2];
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      if (r > 235 && g > 235 && b > 235 && maxC - minC < 12) {
        wasWhite[p] = 1;
        cell[i + 3] = 0;
      }
    }
  }

  // 3. Remove skin + neck shadow pixels (track wasSkin mask)
  const wasSkin = new Uint8Array(cellW * cellH);
  for (let p = 0; p < cellW * cellH; p++) {
    const i = p * 4;
    if (cell[i + 3] > 0 && isSkinPixel(cell[i], cell[i + 1], cell[i + 2])) {
      wasSkin[p] = 1;
      cell[i + 3] = 0;
    }
  }

  // 4. Identify "deep hair" pixels: opaque pixels that are NOT within 3px of wasSkin
  // (works for ALL hair colors including black hair, brown hair, and auburn hair!)
  const isDeepHair = new Uint8Array(cellW * cellH);
  for (let y = 0; y < cellH; y++) {
    for (let x = 0; x < cellW; x++) {
      const p = y * cellW + x;
      if (cell[p * 4 + 3] === 0) continue;
      let nearSkin = false;
      for (let dy = -3; dy <= 3 && !nearSkin; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < cellW && ny < cellH && wasSkin[ny * cellW + nx]) {
            nearSkin = true;
            break;
          }
        }
      }
      if (!nearSkin) {
        isDeepHair[p] = 1;
      }
    }
  }

  // Remove any opaque pixel near wasSkin that has NO deep-hair pixel within radius 5
  // (cleanly strips 1-4px mannequin ear, jawline, chin, neck, and shoulder outlines/shadows!)
  const toClear = [];
  for (let y = 0; y < cellH; y++) {
    for (let x = 0; x < cellW; x++) {
      const p = y * cellW + x;
      const i = p * 4;
      if (cell[i + 3] === 0 || isDeepHair[p]) continue;
      let hasDeepHair = false;
      for (let dy = -3; dy <= 3 && !hasDeepHair; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < cellW && ny < cellH && isDeepHair[ny * cellW + nx]) {
            hasDeepHair = true;
            break;
          }
        }
      }
      if (!hasDeepHair) {
        toClear.push(i);
      }
    }
  }
  for (const i of toClear) {
    cell[i + 3] = 0;
  }

  // 5. Remove tiny isolated speckles (< 80px connected component)
  const compVisited = new Uint8Array(cellW * cellH);
  for (let p = 0; p < cellW * cellH; p++) {
    if (compVisited[p] || cell[p * 4 + 3] === 0) continue;
    const comp = [p];
    compVisited[p] = 1;
    let ch = 0;
    while (ch < comp.length) {
      const cp = comp[ch++];
      const cx = cp % cellW;
      const cy = (cp - cx) / cellW;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cellW || ny >= cellH) continue;
        const np = ny * cellW + nx;
        if (!compVisited[np] && cell[np * 4 + 3] > 0) {
          compVisited[np] = 1;
          comp.push(np);
        }
      }
    }
    if (comp.length < 80) {
      for (const cp of comp) cell[cp * 4 + 3] = 0;
    }
  }

  return { cell, crownCenterX, topY: minY };
}

function downscaleAndAlign(cell, cellW, cellH, crownCenterX, topY, centerBiasX = 0) {
  // Base head in 180x240 is at x=[49..136] (center=92.5, w=88px), y=[18..102]
  const scale = 0.325;
  const targetCenterX = 92.5;
  const targetTopY = 14; // sit ~4px above bare skull top (y=18) for natural hair volume

  const out = Buffer.alloc(TARGET_W * TARGET_H * 4, 0);
  for (let ty = 0; ty < TARGET_H; ty++) {
    for (let tx = 0; tx < TARGET_W; tx++) {
      const sx = Math.round(crownCenterX + centerBiasX + (tx - targetCenterX) / scale);
      const sy = Math.round(topY + (ty - targetTopY) / scale);
      if (sx < 0 || sy < 0 || sx >= cellW || sy >= cellH) continue;
      const si = (sy * cellW + sx) * 4;
      const di = (ty * TARGET_W + tx) * 4;
      if (cell[si + 3] > 128) {
        out[di] = cell[si];
        out[di + 1] = cell[si + 1];
        out[di + 2] = cell[si + 2];
        out[di + 3] = 255;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const src = readPng(SRC_PATH);
const cellW = Math.floor(src.width / 2);
const cellH = Math.floor(src.height / 3);

const HAIRSTYLES = [
  { row: 0, id: 'girl_long', biasSe: 0, biasNw: 0 },
  { row: 1, id: 'girl_ponytail', biasSe: 12, biasNw: -14 },
  { row: 2, id: 'girl_bob', biasSe: 0, biasNw: 0 },
];

for (const style of HAIRSTYLES) {
  for (const [col, dir, bias] of [
    [0, 'se', style.biasSe],
    [1, 'nw', style.biasNw],
  ]) {
    const { cell, crownCenterX, topY } = extractHairCell(
      src,
      col * cellW,
      style.row * cellH,
      cellW,
      cellH
    );
    const aligned = downscaleAndAlign(cell, cellW, cellH, crownCenterX, topY, bias);
    const outPath = path.join(OUT_DIR, `${style.id}_${dir}.png`);
    writePng(outPath, TARGET_W, TARGET_H, aligned);
    console.log(`Saved ${path.relative(ROOT, outPath)} (crownCenterX=${crownCenterX.toFixed(1)}, topY=${topY})`);
  }
}
