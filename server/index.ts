import express from 'express';
import http from 'http';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { Server } from 'socket.io';
import { createDefaultRoomLayout } from '../src/shared/catalog.ts';
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

  if (!rooms.has('FROGGIE')) {
    rooms.set('FROGGIE', {
      layout: createDefaultRoomLayout('FROGGIE', 'host-local'),
      players: {},
      pomodoro: createDefaultPomodoro(),
    });
    saveRoomsToDisk();
  }
}

function saveRoomsToDisk() {
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
}

function getOrCreateRoom(roomCode: string, hostKey: string): RoomRuntime {
  const cleanCode = roomCode.trim().toUpperCase().slice(0, 16) || 'FROGGIE';
  let runtime = rooms.get(cleanCode);
  if (!runtime) {
    runtime = {
      layout: createDefaultRoomLayout(cleanCode, hostKey),
      players: {},
      pomodoro: createDefaultPomodoro(),
    };
    rooms.set(cleanCode, runtime);
    saveRoomsToDisk();
  } else if (runtime.layout.hostId === 'host-local' && hostKey) {
    runtime.layout.hostId = hostKey;
    saveRoomsToDisk();
  }
  return runtime;
}

loadRoomsFromDisk();

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

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
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
        (payload.roomCode || 'FROGGIE').trim().toUpperCase().slice(0, 16) ||
        'FROGGIE';
      const hostKey = payload.hostKey || socket.id;
      const room = getOrCreateRoom(cleanCode, hostKey);

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
      room.layout.floorMap = patch.floorMap;
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

    room.layout = createDefaultRoomLayout(info.roomCode, room.layout.hostId);
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
