import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const CANVAS_W = 180;
const CANVAS_H = 240;
const ANCHOR_Y = 234;
const TARGET_STAND_H = 216;

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function readPng(filePath) {
  const buf = fs.readFileSync(filePath);
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 6;
  const idat = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    if (type === 'IHDR') {
      width = buf.readUInt32BE(offset + 8);
      height = buf.readUInt32BE(offset + 12);
      colorType = buf[offset + 17];
    } else if (type === 'IDAT') {
      idat.push(buf.subarray(offset + 8, offset + 8 + len));
    }
    offset += 12 + len;
  }
  const dec = zlib.inflateSync(Buffer.concat(idat));
  const bpp = colorType === 6 ? 4 : 3;
  const raw = Buffer.alloc(width * height * 4);
  let src = 0;
  const prevRow = Buffer.alloc(width * bpp);
  const curRow = Buffer.alloc(width * bpp);
  for (let y = 0; y < height; y++) {
    const filter = dec[src++];
    for (let x = 0; x < width * bpp; x++) {
      const cur = dec[src++];
      const left = x >= bpp ? curRow[x - bpp] : 0;
      const up = prevRow[x];
      const upLeft = x >= bpp ? prevRow[x - bpp] : 0;
      let val = cur;
      if (filter === 1) val = (cur + left) & 0xff;
      else if (filter === 2) val = (cur + up) & 0xff;
      else if (filter === 3) val = (cur + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) val = (cur + paeth(left, up, upLeft)) & 0xff;
      curRow[x] = val;
    }
    for (let x = 0; x < width; x++) {
      const dst = (y * width + x) * 4;
      raw[dst] = curRow[x * bpp];
      raw[dst + 1] = curRow[x * bpp + 1];
      raw[dst + 2] = curRow[x * bpp + 2];
      raw[dst + 3] = bpp === 4 ? curRow[x * bpp + 3] : 255;
    }
    curRow.copy(prevRow);
  }
  return { width, height, raw };
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function writePng(filePath, width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = 1 + width * 4;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter 0
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    Buffer.concat([sig, makeChunk('IHDR', ihdr), makeChunk('IDAT', idat), makeChunk('IEND', Buffer.alloc(0))])
  );
}

function removeWhiteBgAndGetFrames(img) {
  const { width, height, raw } = img;
  const isWhite = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = raw[i * 4];
    const g = raw[i * 4 + 1];
    const b = raw[i * 4 + 2];
    const a = raw[i * 4 + 3];
    if (a < 20) {
      isWhite[i] = 1;
    } else {
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      if (minC >= 228 && maxC - minC <= 24) isWhite[i] = 1;
    }
  }

  // BFS flood fill from borders
  const vis = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const push = (idx) => {
    if (!vis[idx] && isWhite[idx]) {
      vis[idx] = 1;
      queue[tail++] = idx;
    }
  };
  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + (width - 1));
  }
  while (head < tail) {
    const idx = queue[head++];
    const x = idx % width;
    const y = (idx - x) / width;
    if (x > 0) push(idx - 1);
    if (x < width - 1) push(idx + 1);
    if (y > 0) push(idx - width);
    if (y < height - 1) push(idx + width);
  }

  for (let i = 0; i < width * height; i++) {
    if (vis[i]) raw[i * 4 + 3] = 0;
  }

  // Find X spans
  const colHasFg = new Uint8Array(width);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      if (raw[(y * width + x) * 4 + 3] > 20) {
        colHasFg[x] = 1;
        break;
      }
    }
  }
  const spans = [];
  let inSpan = false;
  let start = 0;
  for (let x = 0; x < width; x++) {
    if (colHasFg[x] && !inSpan) {
      inSpan = true;
      start = x;
    } else if (!colHasFg[x] && inSpan) {
      inSpan = false;
      if (x - start > 40) spans.push([start, x - 1]);
    }
  }
  if (inSpan) spans.push([start, width - 1]);

  return spans.map(([sx, ex]) => {
    let minY = height;
    let maxY = 0;
    for (let y = 0; y < height; y++) {
      for (let x = sx; x <= ex; x++) {
        if (raw[(y * width + x) * 4 + 3] > 20) {
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    return { sx, ex, minY, maxY };
  });
}

function blitScaledFrame(img, box, scale, outW, outH, anchorY) {
  const { width, raw } = img;
  const bw = box.ex - box.sx + 1;
  const bh = box.maxY - box.minY + 1;
  const dw = Math.max(1, Math.round(bw * scale));
  const dh = Math.max(1, Math.round(bh * scale));
  const dstX0 = Math.round((outW - dw) / 2);
  const dstY0 = anchorY - dh;

  const out = Buffer.alloc(outW * outH * 4);
  for (let dy = 0; dy < dh; dy++) {
    const oy = dstY0 + dy;
    if (oy < 0 || oy >= outH) continue;
    const sy = Math.min(box.maxY, box.minY + Math.floor(dy / scale));
    for (let dx = 0; dx < dw; dx++) {
      const ox = dstX0 + dx;
      if (ox < 0 || ox >= outW) continue;
      const sx = Math.min(box.ex, box.sx + Math.floor(dx / scale));
      const si = (sy * width + sx) * 4;
      const di = (oy * outW + ox) * 4;
      out[di] = raw[si];
      out[di + 1] = raw[si + 1];
      out[di + 2] = raw[si + 2];
      out[di + 3] = raw[si + 3];
    }
  }
  return out;
}

const outDir = 'public/sprites/characters/base';

// 1. Measure standing height from SE.png so all poses share exact scale
const seImg = readPng('assets/base-character/SE.png');
const seBoxes = removeWhiteBgAndGetFrames(seImg);
const standH = seBoxes[0].maxY - seBoxes[0].minY + 1;
const globalScale = TARGET_STAND_H / standH;
console.log('Base stand height:', standH, '-> scale:', globalScale.toFixed(4));

const seIdle = blitScaledFrame(seImg, seBoxes[0], globalScale, CANVAS_W, CANVAS_H, ANCHOR_Y);
writePng(`${outDir}/idle_se.png`, CANVAS_W, CANVAS_H, seIdle);

// Generate 120x120 avatar headshot crop
const avatarBuf = Buffer.alloc(120 * 120 * 4);
for (let y = 0; y < 120; y++) {
  const sy = Math.min(CANVAS_H - 1, 10 + y);
  for (let x = 0; x < 120; x++) {
    const sx = Math.min(CANVAS_W - 1, 30 + x);
    const si = (sy * CANVAS_W + sx) * 4;
    const di = (y * 120 + x) * 4;
    avatarBuf[di] = seIdle[si];
    avatarBuf[di + 1] = seIdle[si + 1];
    avatarBuf[di + 2] = seIdle[si + 2];
    avatarBuf[di + 3] = seIdle[si + 3];
  }
}
writePng(`${outDir}/avatar.png`, 120, 120, avatarBuf);

// 2. NE idle
const neImg = readPng('assets/base-character/NE.png');
const neBoxes = removeWhiteBgAndGetFrames(neImg);
writePng(
  `${outDir}/idle_nw.png`,
  CANVAS_W,
  CANVAS_H,
  blitScaledFrame(neImg, neBoxes[0], globalScale, CANVAS_W, CANVAS_H, ANCHOR_Y)
);

// 3. SE walk (4 frames)
const seWalkImg = readPng('assets/base-character/SE-walk.png');
const seWalkBoxes = removeWhiteBgAndGetFrames(seWalkImg);
seWalkBoxes.slice(0, 4).forEach((box, idx) => {
  writePng(
    `${outDir}/walk_se_${idx}.png`,
    CANVAS_W,
    CANVAS_H,
    blitScaledFrame(seWalkImg, box, globalScale, CANVAS_W, CANVAS_H, ANCHOR_Y)
  );
});

// 4. NE walk (4 frames)
const neWalkImg = readPng('assets/base-character/NE-walks.png');
const neWalkBoxes = removeWhiteBgAndGetFrames(neWalkImg);
neWalkBoxes.slice(0, 4).forEach((box, idx) => {
  writePng(
    `${outDir}/walk_nw_${idx}.png`,
    CANVAS_W,
    CANVAS_H,
    blitScaledFrame(neWalkImg, box, globalScale, CANVAS_W, CANVAS_H, ANCHOR_Y)
  );
});

// 5. SE sit -> sit_typing_se, sit_chill_se, sit_floor_se
const seSitImg = readPng('assets/base-character/SE-sit.png');
const seSitBoxes = removeWhiteBgAndGetFrames(seSitImg);
const seSitBuf = blitScaledFrame(seSitImg, seSitBoxes[0], globalScale, CANVAS_W, CANVAS_H, ANCHOR_Y);
writePng(`${outDir}/sit_typing_se.png`, CANVAS_W, CANVAS_H, seSitBuf);
writePng(`${outDir}/sit_chill_se.png`, CANVAS_W, CANVAS_H, seSitBuf);
writePng(`${outDir}/sit_floor_se.png`, CANVAS_W, CANVAS_H, seSitBuf);

// 6. NE sit -> sit_typing_nw
const neSitImg = readPng('assets/base-character/NE-sit.png');
const neSitBoxes = removeWhiteBgAndGetFrames(neSitImg);
writePng(
  `${outDir}/sit_typing_nw.png`,
  CANVAS_W,
  CANVAS_H,
  blitScaledFrame(neSitImg, neSitBoxes[0], globalScale, CANVAS_W, CANVAS_H, ANCHOR_Y)
);

console.log('Successfully sliced all base character sprites to', outDir);
