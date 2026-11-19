import express from 'express';
import http from 'http';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { Server } from 'socket.io';
import { createDefaultRoomLayout, createPersonalRoomLayout } from '../src/shared/catalog.ts';
import pg from 'pg';
const { Pool } = pg;
import type {
  GhostPreview,
  PlacedItem,
  PlayerState,
  PomodoroState,
  RoomLayout,
} from '../src/shared/types.ts';

const PORT = Number(process.env.PORT || 3001);
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), 'server', 'data');
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');

const DATABASE_URL = (process.env.DATABASE_URL || '').trim();
let dbPool: pg.Pool | null = null;

if (DATABASE_URL) {
  try {
    dbPool = new Pool({
      connectionString: DATABASE_URL,
      ssl:
        DATABASE_URL.includes('railway.internal') ||
        DATABASE_URL.includes('localhost') ||
        DATABASE_URL.includes('127.0.0.1')
          ? false
          : { rejectUnauthorized: false },
    });
    console.log('[db] PostgreSQL pool configured with DATABASE_URL.');
  } catch (err) {
    console.error('[db] Error configuring PostgreSQL pool:', err);
  }
}

interface RoomRuntime {
  layout: RoomLayout;
  players: Record<string, PlayerState>;
  pomodoro: PomodoroState;
}

const rooms = new Map<string, RoomRuntime>();

function createDefaultPomodoro(): PomodoroState {
  return {
    isRunning: false,
    mode: 'focus',
    remainingSec: 25 * 60,
    totalSec: 25 * 60,
    syncedWithRoom: true,
    updatedAt: Date.now(),
  };
}

function loadRoomsFromDisk() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(ROOMS_FILE)) {
      const raw = fs.readFileSync(ROOMS_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, RoomLayout>;
      for (const [code, layout] of Object.entries(parsed)) {
        rooms.set(code, {
          layout,
          players: {},
          pomodoro: createDefaultPomodoro(),
        });
      }
    }
  } catch (err) {
    console.error('[server] Failed to load rooms.json:', err);
  }
}

async function initDatabaseAndLoadRooms() {
  loadRoomsFromDisk();

  if (dbPool) {
    try {
      const client = await dbPool.connect();
      try {
        console.log('[db] Connected to PostgreSQL on Railway!');
        await client.query(`
          CREATE TABLE IF NOT EXISTS rooms (
            code VARCHAR(32) PRIMARY KEY,
            layout JSONB NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );
        `);
        console.log('[db] Table "rooms" ready.');

        const result = await client.query('SELECT code, layout FROM rooms');
        for (const row of result.rows) {
          const code = String(row.code);
          const layout = row.layout as RoomLayout;
          rooms.set(code, {
            layout,
            players: {},
            pomodoro: createDefaultPomodoro(),
          });
        }
        console.log(`[db] Restored ${result.rows.length} rooms from PostgreSQL.`);
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('[db] Failed to initialize PostgreSQL:', err);
    }
  }

  if (!rooms.has('GENERAL')) {
    const defaultGen = createDefaultRoomLayout('GENERAL', 'host-local');
    rooms.set('GENERAL', {
      layout: defaultGen,
      players: {},
      pomodoro: createDefaultPomodoro(),
    });
    persistRoom('GENERAL', defaultGen);
  }
}

function saveRoomsToDisk(targetCode?: string) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const serialized: Record<string, RoomLayout> = {};
    for (const [code, runtime] of rooms.entries()) {
      serialized[code] = runtime.layout;
    }
    fs.writeFileSync(ROOMS_FILE, JSON.stringify(serialized, null, 2), 'utf-8');
  } catch (err) {
    console.error('[server] Failed to save rooms.json:', err);
  }

  // Also sync to PostgreSQL if connected
  if (targetCode) {
    const room = rooms.get(targetCode);
    if (room) saveRoomToDatabase(targetCode, room.layout);
  } else {
    for (const [code, runtime] of rooms.entries()) {
      saveRoomToDatabase(code, runtime.layout);
    }
  }
}

async function saveRoomToDatabase(code: string, layout: RoomLayout) {
  if (!dbPool) return;
  try {
    await dbPool.query(
      `INSERT INTO rooms (code, layout, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (code)
       DO UPDATE SET layout = $2, updated_at = NOW();`,
      [code, JSON.stringify(layout)]
    );
  } catch (err) {
    console.error(`[db] Failed to save room ${code} to PostgreSQL:`, err);
  }
}

function persistRoom(code: string, layout?: RoomLayout) {
  saveRoomsToDisk();
  const room = rooms.get(code);
  const targetLayout = layout || room?.layout;
  if (targetLayout) {
    saveRoomToDatabase(code, targetLayout).catch(() => {});
  }
}

function getOrCreateRoom(
  roomCode: string,
  hostKey: string,
  ownerName?: string,
  isPersonal?: boolean
): RoomRuntime {
  const cleanCode = roomCode.trim().toUpperCase().slice(0, 24) || 'GENERAL';
  let runtime = rooms.get(cleanCode);
  if (!runtime) {
    const isPersonalRoom =
      Boolean(isPersonal) ||
      cleanCode.startsWith('ROOM_') ||
      cleanCode.startsWith('MY_') ||
      cleanCode.startsWith('P_');

    const layout = isPersonalRoom
      ? createPersonalRoomLayout(cleanCode, hostKey, ownerName || 'Chủ phòng')
      : createDefaultRoomLayout(cleanCode, hostKey);

    runtime = {
      layout,
      players: {},
      pomodoro: createDefaultPomodoro(),
    };
    rooms.set(cleanCode, runtime);
    persistRoom(cleanCode, layout);
  } else if (runtime.layout.hostId === 'host-local' && hostKey) {
    runtime.layout.hostId = hostKey;
    persistRoom(cleanCode);
  }
  return runtime;
}

initDatabaseAndLoadRooms();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({
    app: 'Cozy Focus Room Multiplayer Server',
    ok: true,
    health: '/api/health',
  });
});

app.get('/api/health', (_req, res) => {
  let totalPlayers = 0;
  for (const room of rooms.values()) {
    totalPlayers += Object.keys(room.players).length;
  }
  res.json({
    ok: true,
    rooms: rooms.size,
    players: totalPlayers,
    database: dbPool ? 'postgresql' : 'file_fallback',
    uptimeSec: Math.round(process.uptime()),
  });
});

app.all('/api/prune-ghosts', (_req, res) => {
  const active = io.sockets.sockets;
  let removed = 0;
  for (const [code, room] of rooms.entries()) {
    for (const pid of Object.keys(room.players)) {
      if (!active.has(pid) || room.players[pid]?.name === 'tmp_probe') {
        console.log(`[server] Pruned ghost player ${room.players[pid]?.name} (${pid}) from #${code}`);
        delete room.players[pid];
        socketRoomMap.delete(pid);
        io.to(code).emit('player:left', { playerId: pid });
        removed++;
      }
    }
  }
  res.json({ ok: true, removed });
});

app.get('/api/room-details', (_req, res) => {
  const result: Record<string, any> = {};
  for (const [code, room] of rooms.entries()) {
    result[code] = {
      playerCount: Object.keys(room.players).length,
      players: Object.entries(room.players).map(([id, p]) => {
        const sock = io.sockets.sockets.get(id);
        return {
          id,
          name: p.name,
          outfit: p.outfit,
          ip: sock?.handshake.address || (sock?.request.headers['x-forwarded-for'] as string) || 'unknown',
          connectedAt: sock?.handshake.time,
        };
      }),
    };
  }
  res.json(result);
});

app.all('/api/kick-player', (req, res) => {
  const targetName = (req.query.name || req.body?.name || '').toString().trim();
  const targetId = (req.query.id || req.body?.id || '').toString().trim();
  let kicked = 0;
  for (const [code, room] of rooms.entries()) {
    for (const [pid, player] of Object.entries(room.players)) {
      if (
        (targetName && player.name.toLowerCase() === targetName.toLowerCase()) ||
        (targetId && pid === targetId)
      ) {
        console.log(`[server] API kick player ${player.name} (${pid}) from #${code}`);
        const sock = io.sockets.sockets.get(pid);
        delete room.players[pid];
        socketRoomMap.delete(pid);
        io.to(code).emit('player:left', { playerId: pid });
        if (sock) {
          sock.emit('room:kicked', { reason: 'Bạn đã được mời ra khỏi phòng.' });
          sock.disconnect(true);
        }
        kicked++;
      }
    }
  }
  res.json({ ok: true, kicked });
});

const GOOGLE_CLIENT_ID =
  (process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '').trim() ||
  '743759840913-cr689blpjcct1t6cb6e6cibjusdgavc7.apps.googleusercontent.com';

interface PendingAuthEntry {
  status: 'pending' | 'success' | 'error';
  user?: {
    uid: string;
    name: string;
    email: string;
    avatarUrl: string;
  };
  error?: string;
  expiresAt: number;
}

const pendingAuths = new Map<string, PendingAuthEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pendingAuths.entries()) {
    if (v.expiresAt < now) pendingAuths.delete(k);
  }
}, 60_000);

app.get('/auth/google/start', (req, res) => {
  const state = String(req.query.state || '').trim();
  if (!state) {
    res.status(400).send('Missing state parameter');
    return;
  }

  pendingAuths.set(state, {
    status: 'pending',
    expiresAt: Date.now() + 5 * 60 * 1000,
  });

  const host = req.get('host');
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  const redirectUri = `${proto}://${host}/auth/google/callback`;

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('prompt', 'select_account');

  res.redirect(authUrl.toString());
});

app.get('/auth/google/callback', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Đăng nhập Cozy Focus Room</title>
  <style>
    body {
      margin: 0; font-family: system-ui, -apple-system, sans-serif;
      background: #100a1c; color: #f8fafc;
      display: flex; align-items: center; justify-content: center; min-height: 100vh;
    }
    .card {
      background: #1a1228; border: 1px solid rgba(244,114,182,0.35);
      border-radius: 24px; padding: 32px; max-width: 400px; text-align: center;
      box-shadow: 0 20px 50px rgba(0,0,0,0.6);
    }
    h1 { font-size: 20px; margin: 0 0 8px; }
    p { font-size: 14px; color: #cbd5e1; line-height: 1.5; margin: 0; }
    .ok { color: #34d399; }
    .err { color: #fb7185; }
  </style>
</head>
<body>
  <div class="card">
    <h1 id="title">Đang hoàn tất đăng nhập...</h1>
    <p id="desc">Vui lòng chờ một chút.</p>
  </div>
  <script>
    (async function() {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const query = new URLSearchParams(window.location.search);
      const accessToken = hash.get('access_token');
      const state = hash.get('state') || query.get('state');
      const error = hash.get('error') || query.get('error');

      const title = document.getElementById('title');
      const desc = document.getElementById('desc');

      if (error || !accessToken || !state) {
        title.textContent = 'Đăng nhập thất bại';
        title.className = 'err';
        desc.textContent = error ? ('Lỗi từ Google: ' + error) : 'Không nhận được token xác thực.';
        if (state) {
          await fetch('/api/auth/google/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state, error: error || 'cancelled' })
          });
        }
        return;
      }

      try {
        const resp = await fetch('/api/auth/google/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state, access_token: accessToken })
        });
        const data = await resp.json();
        if (data.ok) {
          title.textContent = 'Đăng nhập thành công!';
          title.className = 'ok';
          desc.textContent = 'Bạn có thể đóng tab trình duyệt này và quay lại ứng dụng Cozy Focus Room.';
          setTimeout(() => { try { window.close(); } catch (e) {} }, 1200);
        } else {
          throw new Error(data.error || 'Unknown error');
        }
      } catch (err) {
        title.textContent = 'Có lỗi xảy ra';
        title.className = 'err';
        desc.textContent = err.message || 'Không thể hoàn tất đăng nhập.';
      }
    })();
  </script>
</body>
</html>`);
});

app.post('/api/auth/google/complete', async (req, res) => {
  const { state, access_token, error } = req.body || {};
  if (!state) {
    res.status(400).json({ ok: false, error: 'Missing state' });
    return;
  }

  if (error || !access_token) {
    pendingAuths.set(state, {
      status: 'error',
      error: String(error || 'Đăng nhập bị hủy'),
      expiresAt: Date.now() + 2 * 60 * 1000,
    });
    res.json({ ok: false, error: String(error || 'Cancelled') });
    return;
  }

  try {
    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!userRes.ok) {
      throw new Error(`Google userinfo HTTP ${userRes.status}`);
    }
    const info = (await userRes.json()) as {
      sub?: string;
      name?: string;
      given_name?: string;
      email?: string;
      picture?: string;
    };
    if (!info.sub) {
      throw new Error('Không tìm thấy Google UID');
    }

    pendingAuths.set(state, {
      status: 'success',
      user: {
        uid: String(info.sub),
        name: String(info.name || info.given_name || 'Người chơi'),
        email: String(info.email || ''),
        avatarUrl: String(info.picture || ''),
      },
      expiresAt: Date.now() + 2 * 60 * 1000,
    });
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Google verification failed';
    pendingAuths.set(state, {
      status: 'error',
      error: msg,
      expiresAt: Date.now() + 2 * 60 * 1000,
    });
    res.status(500).json({ ok: false, error: msg });
  }
});

app.get('/api/auth/google/status', (req, res) => {
  const state = String(req.query.state || '').trim();
  if (!state) {
    res.status(400).json({ status: 'error', error: 'Missing state' });
    return;
  }
  const entry = pendingAuths.get(state);
  if (!entry) {
    res.json({ status: 'pending' });
    return;
  }
  if (entry.status === 'success' && entry.user) {
    pendingAuths.delete(state);
    res.json({ status: 'success', user: entry.user });
    return;
  }
  if (entry.status === 'error') {
    pendingAuths.delete(state);
    res.json({ status: 'error', error: entry.error });
    return;
  }
  res.json({ status: 'pending' });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingInterval: 5000,
  pingTimeout: 6000,
});

// Periodic pruner for disconnected/ghost sockets (every 10 seconds)
setInterval(() => {
  const active = io.sockets.sockets;
  for (const [code, room] of rooms.entries()) {
    for (const pid of Object.keys(room.players)) {
      if (!active.has(pid)) {
        console.log(`[server] Auto-pruning dead socket ${room.players[pid]?.name} (${pid})`);
        delete room.players[pid];
        socketRoomMap.delete(pid);
        io.to(code).emit('player:left', { playerId: pid });
      }
    }
  }
}, 10000);

const socketRoomMap = new Map<string, { roomCode: string; hostKey: string }>();

function canModifyLayout(room: RoomRuntime, hostKey: string): boolean {
  return room.layout.hostId === hostKey || room.layout.allowGuestBuild;
}

io.on('connection', (socket) => {
  socket.on(
    'room:join',
    (payload: {
      roomCode: string;
      hostKey?: string;
      player: Partial<PlayerState>;
    }) => {
      const prev = socketRoomMap.get(socket.id);
      if (prev) {
        const oldRoom = rooms.get(prev.roomCode);
        if (oldRoom) {
          delete oldRoom.players[socket.id];
          socket.to(prev.roomCode).emit('player:left', { playerId: socket.id });
        }
        socket.leave(prev.roomCode);
      }

      const cleanCode =
        (payload.roomCode || 'GENERAL').trim().toUpperCase().slice(0, 24) ||
        'GENERAL';
      const hostKey = payload.hostKey || socket.id;
      const isPersonal = Boolean(
        (payload as any).isPersonal ||
        cleanCode.startsWith('ROOM_') ||
        cleanCode.startsWith('MY_') ||
        cleanCode.startsWith('P_')
      );
      const room = getOrCreateRoom(cleanCode, hostKey, payload.player?.name, isPersonal);

      // If registered host is not currently in this room, grant host role to this player
      const activeHostOnline = Array.from(socketRoomMap.values()).some(
        (entry) => entry.roomCode === cleanCode && entry.hostKey === room.layout.hostId
      );
      if (!activeHostOnline) {
        room.layout.hostId = hostKey;
        saveRoomsToDisk();
      }

      const newPlayer: PlayerState = {
        id: socket.id,
        name: (payload.player?.name === 'Kaito' ? 'Người chơi' : (payload.player?.name || 'Khách')).slice(0, 24),
        outfit: payload.player?.outfit || 'c7',
        tintColor: payload.player?.tintColor || '#a78bfa',
        gx: payload.player?.gx ?? 4.5,
        gy: payload.player?.gy ?? 5.5,
        facing: payload.player?.facing || 'se',
        isMoving: false,
        isRunning: false,
        activity: payload.player?.activity || 'idle',
        seatedOnItemUid: payload.player?.seatedOnItemUid,
        seatSlotId: payload.player?.seatSlotId,
        statusText: payload.player?.statusText || '✨ Đang chill trong phòng',
      };

      room.players[socket.id] = newPlayer;
      socketRoomMap.set(socket.id, { roomCode: cleanCode, hostKey });
      socket.join(cleanCode);

      socket.emit('room:init', {
        roomCode: cleanCode,
        myId: socket.id,
        isHost: room.layout.hostId === hostKey,
        layout: room.layout,
        players: room.players,
        pomodoro: room.pomodoro,
      });

      socket.to(cleanCode).emit('player:joined', { player: newPlayer });
    }
  );

  socket.on('room:leave', () => {
    const info = socketRoomMap.get(socket.id);
    if (!info) return;
    const room = rooms.get(info.roomCode);
    if (room) {
      delete room.players[socket.id];
      socket.to(info.roomCode).emit('player:left', { playerId: socket.id });
    }
    socket.leave(info.roomCode);
    socketRoomMap.delete(socket.id);
  });

  socket.on('room:kick_player', (payload: { playerId: string }) => {
    const info = socketRoomMap.get(socket.id);
    if (!info) return;
    const room = rooms.get(info.roomCode);
    if (!room || room.layout.hostId !== info.hostKey) return;

    const targetId = payload?.playerId;
    if (!targetId || targetId === socket.id) return;

    const targetPlayer = room.players[targetId];
    if (targetPlayer) {
      console.log(`[server] Host kicked player ${targetPlayer.name} (${targetId}) from #${info.roomCode}`);
      delete room.players[targetId];
      socketRoomMap.delete(targetId);
      io.to(info.roomCode).emit('player:left', { playerId: targetId });

      const targetSocket = io.sockets.sockets.get(targetId);
      if (targetSocket) {
        targetSocket.emit('room:kicked', { reason: 'Bạn đã được chủ phòng mời ra khỏi phòng.' });
        targetSocket.disconnect(true);
      }
    }
  });

  socket.on('player:update', (patch: Partial<PlayerState>) => {
    const info = socketRoomMap.get(socket.id);
    if (!info) return;
    const room = rooms.get(info.roomCode);
    if (!room || !room.players[socket.id]) return;

    const updated: PlayerState = {
      ...room.players[socket.id],
      ...patch,
      id: socket.id,
    };
    room.players[socket.id] = updated;
    socket.to(info.roomCode).emit('player:updated', {
      playerId: socket.id,
      patch: updated,
    });
  });

  socket.on('player:chat', (payload: { text: string }) => {
    const info = socketRoomMap.get(socket.id);
    if (!info) return;
    const room = rooms.get(info.roomCode);
    const player = room?.players[socket.id];
    if (!room || !player) return;

    const text = (payload.text || '').trim().slice(0, 140);
    if (!text) return;

    const timestamp = Date.now();
    player.chatBubble = { text, expiresAt: timestamp + 5500 };

    io.to(info.roomCode).emit('player:chatted', {
      id: `${socket.id}-${timestamp}`,
      playerId: socket.id,
      name: player.name,
      tintColor: player.tintColor,
      text,
      timestamp,
    });
  });

  socket.on('player:emote', (payload: { icon: string }) => {
    const info = socketRoomMap.get(socket.id);
    if (!info) return;
    const room = rooms.get(info.roomCode);
    const player = room?.players[socket.id];
    if (!room || !player) return;

    const icon = (payload.icon || '❤️').slice(0, 8);
    const expiresAt = Date.now() + 2600;
    player.emote = { icon, expiresAt };

    io.to(info.roomCode).emit('player:emoted', {
      playerId: socket.id,
      icon,
      expiresAt,
    });
  });

  socket.on('room:update_floor', (patch: Partial<RoomLayout>) => {
    const info = socketRoomMap.get(socket.id);
    if (!info) return;
    const room = rooms.get(info.roomCode);
    if (!room || !canModifyLayout(room, info.hostKey)) return;

    if (Array.isArray(patch.floorMap) && patch.floorMap.length >= 4) {
      if (room.layout.maxFloorTiles) {
        let count = 0;
        for (const r of patch.floorMap) {
          for (let i = 0; i < r.length; i++) if (r[i] !== '.') count++;
        }
        if (count > room.layout.maxFloorTiles) {
          socket.emit('room:toast', { message: `Đã đạt giới hạn tối đa ${room.layout.maxFloorTiles} ô sàn!` });
          return;
        }
      }
      room.layout.floorMap = patch.floorMap;
    }
    if (Array.isArray(patch.walls)) {
      const limit = room.layout.maxWallTiles || 200;
      room.layout.walls = patch.walls.slice(0, limit);
    }
    if (patch.wallTheme) room.layout.wallTheme = patch.wallTheme;
    if (patch.lightingMode) room.layout.lightingMode = patch.lightingMode;
    if (typeof patch.rainEnabled === 'boolean') {
      room.layout.rainEnabled = patch.rainEnabled;
    }
    if (patch.roomName) room.layout.roomName = patch.roomName.slice(0, 48);

    saveRoomsToDisk();
    io.to(info.roomCode).emit('room:layout_updated', room.layout);
  });

  socket.on('room:set_guest_build', (payload: { allowGuestBuild: boolean }) => {
    const info = socketRoomMap.get(socket.id);
    if (!info) return;
    const room = rooms.get(info.roomCode);
    if (!room || room.layout.hostId !== info.hostKey) return;

    room.layout.allowGuestBuild = Boolean(payload.allowGuestBuild);
    saveRoomsToDisk();
    io.to(info.roomCode).emit('room:layout_updated', room.layout);
  });

  socket.on('room:place_item', (payload: { item: PlacedItem }) => {
    const info = socketRoomMap.get(socket.id);
    if (!info || !payload.item) return;
    const room = rooms.get(info.roomCode);
    if (!room || !canModifyLayout(room, info.hostKey)) return;

    const incoming = payload.item;
    const idx = room.layout.items.findIndex((i) => i.uid === incoming.uid);
    if (idx >= 0) {
      const old = room.layout.items[idx];
      const dx = incoming.gx - old.gx;
      const dy = incoming.gy - old.gy;
      room.layout.items[idx] = incoming;

      // Move surface props anchored to this parent furniture
      if (dx !== 0 || dy !== 0) {
        for (const child of room.layout.items) {
          if (child.parentSurfaceUid === incoming.uid) {
            child.gx = Number((child.gx + dx).toFixed(2));
            child.gy = Number((child.gy + dy).toFixed(2));
          }
        }
      }
    } else {
      if (room.layout.maxItems && room.layout.items.length >= room.layout.maxItems) {
        socket.emit('room:toast', { message: `Đã đạt giới hạn tối đa ${room.layout.maxItems} đồ vật trong phòng!` });
        return;
      }
      room.layout.items.push(incoming);
    }

    saveRoomsToDisk();
    io.to(info.roomCode).emit('room:layout_updated', room.layout);
  });

  socket.on('room:remove_item', (payload: { uid: string }) => {
    const info = socketRoomMap.get(socket.id);
    if (!info || !payload.uid) return;
    const room = rooms.get(info.roomCode);
    if (!room || !canModifyLayout(room, info.hostKey)) return;

    const removedIds = new Set<string>([payload.uid]);
    for (const item of room.layout.items) {
      if (item.parentSurfaceUid === payload.uid) {
        removedIds.add(item.uid);
      }
    }

    room.layout.items = room.layout.items.filter((i) => !removedIds.has(i.uid));

    // Unseat players who were sitting on the deleted item
    for (const p of Object.values(room.players)) {
      if (p.seatedOnItemUid && removedIds.has(p.seatedOnItemUid)) {
        p.seatedOnItemUid = undefined;
        p.seatSlotId = undefined;
        p.activity = 'idle';
        io.to(info.roomCode).emit('player:updated', {
          playerId: p.id,
          patch: p,
        });
      }
    }

    saveRoomsToDisk();
    io.to(info.roomCode).emit('room:layout_updated', room.layout);
  });

  socket.on(
    'room:preview_item',
    (payload: { preview: Omit<GhostPreview, 'playerId'> | null }) => {
      const info = socketRoomMap.get(socket.id);
      if (!info) return;
      const room = rooms.get(info.roomCode);
      if (!room || !canModifyLayout(room, info.hostKey)) return;

      socket.to(info.roomCode).emit('room:preview_updated', {
        playerId: socket.id,
        preview: payload.preview
          ? { ...payload.preview, playerId: socket.id }
          : null,
      });
    }
  );

  socket.on('room:toggle_item', (payload: { uid: string }) => {
    const info = socketRoomMap.get(socket.id);
    if (!info || !payload.uid) return;
    const room = rooms.get(info.roomCode);
    if (!room) return;

    const target = room.layout.items.find((i) => i.uid === payload.uid);
    if (!target) return;

    target.toggled = !target.toggled;
    saveRoomsToDisk();
    io.to(info.roomCode).emit('room:item_toggled', {
      uid: target.uid,
      toggled: target.toggled,
    });
  });

  socket.on('room:reset_default', () => {
    const info = socketRoomMap.get(socket.id);
    if (!info) return;
    const room = rooms.get(info.roomCode);
    if (!room || room.layout.hostId !== info.hostKey) return;

    const player = room.players[socket.id];
    room.layout = room.layout.isPersonal
      ? createPersonalRoomLayout(info.roomCode, room.layout.hostId, player?.name || 'Chủ phòng')
      : createDefaultRoomLayout(info.roomCode, room.layout.hostId);
    saveRoomsToDisk();
    io.to(info.roomCode).emit('room:layout_updated', room.layout);
  });

  socket.on('pomodoro:sync', (payload: { pomodoro: PomodoroState }) => {
    const info = socketRoomMap.get(socket.id);
    if (!info || !payload.pomodoro) return;
    const room = rooms.get(info.roomCode);
    if (!room) return;

    room.pomodoro = {
      ...payload.pomodoro,
      updatedAt: Date.now(),
    };
    socket.to(info.roomCode).emit('pomodoro:updated', room.pomodoro);
  });

  socket.on('disconnect', () => {
    const info = socketRoomMap.get(socket.id);
    if (!info) return;
    socketRoomMap.delete(socket.id);
    const room = rooms.get(info.roomCode);
    if (!room) return;

    const wasHost = room.layout.hostId === info.hostKey;
    delete room.players[socket.id];

    if (wasHost) {
      const remainingSocketIds = Object.keys(room.players);
      if (remainingSocketIds.length > 0) {
        const nextSocketId = remainingSocketIds[0];
        const nextInfo = socketRoomMap.get(nextSocketId);
        if (nextInfo) {
          room.layout.hostId = nextInfo.hostKey;
          saveRoomsToDisk();
          io.to(info.roomCode).emit('room:layout_updated', room.layout);
        }
      }
    }

    socket.to(info.roomCode).emit('room:preview_updated', {
      playerId: socket.id,
      preview: null,
    });
    socket.to(info.roomCode).emit('player:left', { playerId: socket.id });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Cozy Focus Multiplayer Server listening on http://localhost:${PORT}`);
});
