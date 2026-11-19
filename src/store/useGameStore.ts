import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import {
  autoGenerateWallsFromFloor,
  countFloorTiles,
  createDefaultRoomLayout,
  createPersonalRoomLayout,
  getCatalogItem,
} from '../shared/catalog';
import { soundEngine } from '../audio/soundEngine';
import { useAuthStore } from './useAuthStore';
import type {
  ActivityType,
  AudioChannel,
  AudioMixerState,
  CatalogCategory,
  ChatMessage,
  FacingDirection,
  GhostPreview,
  LightingMode,
  OutfitId,
  PlacedItem,
  PlayerState,
  PomodoroMode,
  PomodoroState,
  RoomLayout,
  TileType,
  TodoItem,
  WallTheme,
} from '../shared/types';

export type BuildTab = 'floor' | CatalogCategory;

const POMODORO_DURATIONS: Record<PomodoroMode, number> = {
  focus: 25 * 60,
  short_break: 5 * 60,
  long_break: 15 * 60,
};

function getOrCreateStorageKey(key: string, gen: () => string): string {
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const created = gen();
    localStorage.setItem(key, created);
    return created;
  } catch {
    return gen();
  }
}

function loadJsonStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJsonStorage<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota/storage errors
  }
}

function resolveSocketUrl(): string | null {
  const envUrl = (
    import.meta.env.VITE_SERVER_URL as string | undefined
  )?.trim();
  if (envUrl) {
    return envUrl.replace(/\/+$/, '');
  }
  if (import.meta.env.DEV) {
    if (typeof window !== 'undefined') {
      const { protocol, port } = window.location;
      if (protocol.startsWith('http') && port === '5173') {
        return '/';
      }
    }
    return 'http://localhost:3001';
  }
  return null;
}

let socket: Socket | null = null;
let lastPositionEmit = 0;

const hot = (import.meta as unknown as { hot?: { dispose: (cb: () => void) => void } }).hot;
if (hot) {
  hot.dispose(() => {
    socket?.disconnect();
    socket = null;
  });
}

export interface GameStoreState {
  // Connection & Room
  connected: boolean;
  roomCode: string;
  hostKey: string;
  myPlayerId: string;
  isHost: boolean;
  layout: RoomLayout;
  players: Record<string, PlayerState>;
  ghostPreviews: Record<string, GhostPreview>;
  chatMessages: ChatMessage[];
  toastMessage: string | null;

  // Local player info
  localPlayer: PlayerState;

  // Build / Decor mode
  buildMode: boolean;
  buildTab: BuildTab;
  activeFloorBrush: TileType | null;
  activeWallBrush: 'add' | 'remove' | null;
  selectedCatalogId: string | null;
  movingItemUid: string | null;
  placeFlipped: boolean;

  // Focus & Productivity
  pomodoro: PomodoroState;
  completedPomodoros: number;
  todos: TodoItem[];
  pinnedTodoId: string | null;

  // Audio Mixer
  audioMixer: AudioMixerState;

  // UI Panels & Desktop Companion
  showAudioMixer: boolean;
  showFocusPanel: boolean;
  showRoomModal: boolean;
  showProfileModal: boolean;
  hasCustomizedCharacter: boolean;
  miniMode: boolean;
  alwaysOnTop: boolean;

  // Actions
  initNetwork: (roomCode?: string) => void;
  joinRoom: (roomCode: string, options?: { isPersonal?: boolean }) => void;
  leaveRoomToLobby: () => void;
  showToast: (msg: string) => void;
  setShowAudioMixer: (v: boolean) => void;
  setShowFocusPanel: (v: boolean) => void;
  setShowRoomModal: (v: boolean) => void;
  setShowProfileModal: (v: boolean) => void;

  // Player actions
  updateLocalProfile: (patch: {
    name?: string;
    outfit?: OutfitId;
    tintColor?: string;
  }) => void;
  moveLocalPlayer: (patch: {
    gx: number;
    gy: number;
    facing: FacingDirection;
    isMoving: boolean;
    isRunning: boolean;
  }) => void;
  seatAtItem: (
    itemUid: string,
    slotId: string,
    gx: number,
    gy: number,
    activity: ActivityType,
    facing: FacingDirection
  ) => void;
  sitOnFloor: () => void;
  standUp: () => void;
  sendChat: (text: string) => void;
  sendEmote: (icon: string) => void;

  // Decor / Build actions (Host enforced)
  canBuild: () => boolean;
  toggleBuildMode: (force?: boolean) => void;
  setBuildTab: (tab: BuildTab) => void;
  setActiveFloorBrush: (brush: TileType | null) => void;
  setActiveWallBrush: (brush: 'add' | 'remove' | null) => void;
  selectCatalogItem: (catalogId: string | null) => void;
  startMovingItem: (uid: string | null) => void;
  togglePlaceFlipped: () => void;
  emitPreview: (preview: Omit<GhostPreview, 'playerId'> | null) => void;
  paintTile: (gx: number, gy: number, tile: TileType) => void;
  toggleWallSegment: (wallKey: string, mode?: 'add' | 'remove') => void;
  autoBuildWalls: () => void;
  expandFloorGrid: () => void;
  shrinkFloorGrid: () => void;
  setWallTheme: (theme: WallTheme) => void;
  setLightingMode: (mode: LightingMode) => void;
  toggleRain: () => void;
  setAllowGuestBuild: (allow: boolean) => void;
  placeOrUpdateItem: (item: PlacedItem) => void;
  removeItem: (uid: string) => void;
  toggleItemInteraction: (uid: string) => void;
  resetDefaultRoom: () => void;
  kickPlayer: (playerId: string) => void;

  // Pomodoro & Todos
  startPomodoro: () => void;
  pausePomodoro: () => void;
  resetPomodoro: () => void;
  switchPomodoroMode: (mode: PomodoroMode) => void;
  togglePomodoroRoomSync: () => void;
  tickPomodoro: () => void;

  addTodo: (text: string) => void;
  toggleTodo: (id: string) => void;
  deleteTodo: (id: string) => void;
  pinTodo: (id: string | null) => void;

  // Audio Mixer
  setChannelVolume: (channel: AudioChannel, vol: number) => void;
  toggleMasterMute: () => void;

  // Desktop Companion (Tauri v2)
  toggleMiniMode: () => Promise<void>;
  toggleAlwaysOnTop: () => Promise<void>;
}

const initialHostKey = getOrCreateStorageKey(
  'cozy_host_key',
  () => `host-${Math.random().toString(36).slice(2, 10)}`
);

const hasExistingProfile = (() => {
  try {
    return Boolean(localStorage.getItem('cozy_player_profile_v2'));
  } catch {
    return false;
  }
})();

const savedProfile = loadJsonStorage<{
  name: string;
  outfit: OutfitId;
  tintColor: string;
}>('cozy_player_profile_v2', {
  name: 'Người chơi',
  outfit: 'c1',
  tintColor: '#a78bfa',
});

if (savedProfile.name === 'Kaito' || savedProfile.name.trim() === '') {
  savedProfile.name = 'Người chơi';
  saveJsonStorage('cozy_player_profile_v2', savedProfile);
}

const savedTodos = loadJsonStorage<TodoItem[]>('cozy_todos', [
  {
    id: 'todo-sample-1',
    text: 'Hoàn thành 1 phiên Focus 25 phút cùng nhau ✨',
    completed: false,
    createdAt: Date.now(),
  },
]);

const savedMixer = loadJsonStorage<AudioMixerState>('cozy_audio_mixer', {
  muted: false,
  bgm: 0.45,
  rain: 0.35,
  fire: 0.0,
  keyboard: 0.0,
  wind: 0.15,
});

soundEngine.applyMixerState(savedMixer);

const initialLayout = loadJsonStorage<RoomLayout>(
  'cozy_offline_layout_v2_GENERAL',
  createDefaultRoomLayout('GENERAL', initialHostKey)
);

const initialLocalPlayer: PlayerState = {
  id: 'local-player',
  name: savedProfile.name,
  outfit: savedProfile.outfit,
  tintColor: savedProfile.tintColor,
  gx: 4.5,
  gy: 5.5,
  facing: 'se',
  isMoving: false,
  isRunning: false,
  activity: 'idle',
  statusText: '✨ Đang chill trong phòng',
};

let toastTimer: number | null = null;

export const useGameStore = create<GameStoreState>((set, get) => ({
  connected: false,
  roomCode: 'GENERAL',
  hostKey: initialHostKey,
  myPlayerId: 'local-player',
  isHost: true,
  layout: initialLayout,
  players: { 'local-player': initialLocalPlayer },
  ghostPreviews: {},
  chatMessages: [],
  toastMessage: null,

  localPlayer: initialLocalPlayer,

  buildMode: false,
  buildTab: 'workspace',
  activeFloorBrush: null,
  activeWallBrush: null,
  selectedCatalogId: null,
  movingItemUid: null,
  placeFlipped: false,

  pomodoro: {
    isRunning: false,
    mode: 'focus',
    remainingSec: POMODORO_DURATIONS.focus,
    totalSec: POMODORO_DURATIONS.focus,
    syncedWithRoom: true,
    updatedAt: Date.now(),
  },
  completedPomodoros: 0,
  todos: savedTodos,
  pinnedTodoId: null,

  audioMixer: savedMixer,

  showAudioMixer: false,
  showFocusPanel: true,
  showRoomModal: false,
  showProfileModal: !hasExistingProfile,
  hasCustomizedCharacter: hasExistingProfile,
  miniMode: false,
  alwaysOnTop: false,

  showToast: (msg: string) => {
    set({ toastMessage: msg });
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      set({ toastMessage: null });
    }, 3200);
  },

  setShowAudioMixer: (v) => set({ showAudioMixer: v }),
  setShowFocusPanel: (v) => set({ showFocusPanel: v }),
  setShowRoomModal: (v) => set({ showRoomModal: v }),
  setShowProfileModal: (v) => set({ showProfileModal: v }),

  initNetwork: (roomCode = get().roomCode) => {
    const cleanCode = roomCode.trim().toUpperCase().slice(0, 24) || 'GENERAL';
    set({ roomCode: cleanCode });

    if (socket) {
      if (useAuthStore.getState().currentScreen === 'game') {
        socket.emit('room:join', {
          roomCode: cleanCode,
          hostKey: get().hostKey,
          player: get().localPlayer,
        });
      }
      return;
    }

    const url = resolveSocketUrl();
    if (!url) {
      set({ connected: false });
      return;
    }
    // The hosted server can be asleep (Railway serverless) and needs a cold
    // start, so never give up reconnecting and allow a generous timeout.
    socket = io(url, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    let hadConnection = false;
    let warnedOffline = false;

    socket.on('connect', () => {
      set({ connected: true });
      if (hadConnection || warnedOffline) {
        get().showToast('Đã kết nối lại máy chủ');
      }
      hadConnection = true;
      warnedOffline = false;
      if (useAuthStore.getState().currentScreen === 'game') {
        const clean = get().roomCode;
        const isPersonal =
          clean.startsWith('ROOM_') ||
          clean.startsWith('MY_') ||
          clean.startsWith('P_');
        socket?.emit('room:join', {
          roomCode: clean,
          hostKey: get().hostKey,
          player: get().localPlayer,
          isPersonal,
        });
      }
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        socket?.emit('room:leave');
        socket?.disconnect();
      });
    }

    socket.on('disconnect', (reason) => {
      set({ connected: false });
      // A server-initiated disconnect is not retried automatically by socket.io.
      if (reason === 'io server disconnect') {
        socket?.connect();
      }
    });

    socket.on('connect_error', () => {
      set({ connected: false });
      if (!warnedOffline) {
        warnedOffline = true;
        get().showToast('Đang kết nối tới máy chủ, vui lòng đợi...');
      }
    });

    socket.on(
      'room:init',
      (payload: {
        roomCode: string;
        myId: string;
        isHost: boolean;
        layout: RoomLayout;
        players: Record<string, PlayerState>;
        pomodoro: PomodoroState;
      }) => {
        const me = payload.players[payload.myId] || {
          ...get().localPlayer,
          id: payload.myId,
        };
        set({
          roomCode: payload.roomCode,
          myPlayerId: payload.myId,
          isHost: payload.isHost,
          layout: payload.layout,
          players: payload.players,
          localPlayer: me,
          ghostPreviews: {},
          pomodoro: get().pomodoro.syncedWithRoom
            ? payload.pomodoro
            : get().pomodoro,
        });
        saveJsonStorage(`cozy_offline_layout_v2_${payload.roomCode}`, payload.layout);
      }
    );

    socket.on('player:joined', (payload: { player: PlayerState }) => {
      set((s) => ({
        players: { ...s.players, [payload.player.id]: payload.player },
      }));
      get().showToast(`👋 ${payload.player.name} vừa vào phòng!`);
    });

    socket.on(
      'player:updated',
      (payload: { playerId: string; patch: PlayerState }) => {
        set((s) => {
          const isMe = payload.playerId === s.myPlayerId;
          return {
            players: { ...s.players, [payload.playerId]: payload.patch },
            localPlayer: isMe ? payload.patch : s.localPlayer,
          };
        });
      }
    );

    socket.on('player:left', (payload: { playerId: string }) => {
      set((s) => {
        const nextPlayers = { ...s.players };
        delete nextPlayers[payload.playerId];
        const nextPreviews = { ...s.ghostPreviews };
        delete nextPreviews[payload.playerId];
        return { players: nextPlayers, ghostPreviews: nextPreviews };
      });
    });

    socket.on('player:chatted', (msg: ChatMessage) => {
      set((s) => {
        const nextMessages = [...s.chatMessages, msg].slice(-40);
        const target = s.players[msg.playerId];
        const bubble = { text: msg.text, expiresAt: msg.timestamp + 5500 };
        const nextPlayers = target
          ? { ...s.players, [msg.playerId]: { ...target, chatBubble: bubble } }
          : s.players;
        const isMe = msg.playerId === s.myPlayerId;
        return {
          chatMessages: nextMessages,
          players: nextPlayers,
          localPlayer: isMe ? { ...s.localPlayer, chatBubble: bubble } : s.localPlayer,
        };
      });
    });

    socket.on(
      'player:emoted',
      (payload: { playerId: string; icon: string; expiresAt: number }) => {
        set((s) => {
          const target = s.players[payload.playerId];
          const emote = { icon: payload.icon, expiresAt: payload.expiresAt };
          const nextPlayers = target
            ? { ...s.players, [payload.playerId]: { ...target, emote } }
            : s.players;
          const isMe = payload.playerId === s.myPlayerId;
          return {
            players: nextPlayers,
            localPlayer: isMe ? { ...s.localPlayer, emote } : s.localPlayer,
          };
        });
      }
    );

    socket.on('room:layout_updated', (layout: RoomLayout) => {
      const myHost = layout.hostId === get().hostKey;
      set((s) => ({
        layout,
        isHost: myHost,
        buildMode:
          myHost || layout.allowGuestBuild ? s.buildMode : false,
      }));
      saveJsonStorage(`cozy_offline_layout_v2_${layout.roomCode}`, layout);
    });

    socket.on(
      'room:item_toggled',
      (payload: { uid: string; toggled: boolean }) => {
        set((s) => ({
          layout: {
            ...s.layout,
            items: s.layout.items.map((item) =>
              item.uid === payload.uid
                ? { ...item, toggled: payload.toggled }
                : item
            ),
          },
        }));
      }
    );

    socket.on(
      'room:preview_updated',
      (payload: { playerId: string; preview: GhostPreview | null }) => {
        set((s) => {
          const next = { ...s.ghostPreviews };
          if (payload.preview) {
            next[payload.playerId] = payload.preview;
          } else {
            delete next[payload.playerId];
          }
          return { ghostPreviews: next };
        });
      }
    );

    socket.on('pomodoro:updated', (pomodoro: PomodoroState) => {
      if (get().pomodoro.syncedWithRoom) {
        set({ pomodoro });
      }
    });

    socket.on('room:kicked', ({ reason }: { reason?: string }) => {
      get().showToast(reason || 'Bạn đã được chủ phòng mời ra khỏi phòng');
    });
  },

  joinRoom: (roomCode: string, options?: { isPersonal?: boolean }) => {
    const clean = roomCode.trim().toUpperCase().slice(0, 24) || 'GENERAL';
    set({ buildMode: false, selectedCatalogId: null, movingItemUid: null });

    const isPersonal = Boolean(
      options?.isPersonal ||
      clean.startsWith('ROOM_') ||
      clean.startsWith('MY_') ||
      clean.startsWith('P_')
    );

    if (socket && socket.connected) {
      socket.emit('room:join', {
        roomCode: clean,
        hostKey: get().hostKey,
        player: get().localPlayer,
        isPersonal,
      });
    } else {
      const fallbackLayout = isPersonal
        ? createPersonalRoomLayout(clean, get().hostKey, get().localPlayer.name)
        : createDefaultRoomLayout(clean, get().hostKey);

      const offline = loadJsonStorage<RoomLayout>(
        `cozy_offline_layout_v2_${clean}`,
        fallbackLayout
      );
      set({
        roomCode: clean,
        layout: offline,
        players: {},
        isHost: offline.hostId === get().hostKey,
      });
      if (!socket) {
        get().initNetwork(clean);
      } else if (!socket.active) {
        socket.connect();
      }
      get().showToast(`Chưa kết nối máy chủ, sẽ tự vào phòng #${clean} khi kết nối xong`);
      return;
    }
    get().showToast(`Đang vào phòng #${clean}`);
  },

  leaveRoomToLobby: () => {
    socket?.emit('room:leave');
    set({
      buildMode: false,
      selectedCatalogId: null,
      movingItemUid: null,
      players: {},
      ghostPreviews: {},
    });
    useAuthStore.getState().setScreen('lobby');
  },

  updateLocalProfile: (patch) => {
    const nextLocal = { ...get().localPlayer, ...patch };
    saveJsonStorage('cozy_player_profile_v2', {
      name: nextLocal.name,
      outfit: nextLocal.outfit,
      tintColor: nextLocal.tintColor,
    });
    set((s) => ({
      hasCustomizedCharacter: true,
      localPlayer: nextLocal,
      players: { ...s.players, [s.myPlayerId]: nextLocal },
    }));
    socket?.emit('player:update', patch);
  },

  moveLocalPlayer: (patch) => {
    const prev = get().localPlayer;
    const isSeated = Boolean(prev.seatedOnItemUid) || prev.activity === 'sit_floor';
    const nextActivity: ActivityType = isSeated
      ? prev.activity
      : patch.isMoving
      ? 'walking'
      : 'idle';

    const statusText = get().pinnedTodoId
      ? prev.statusText
      : nextActivity === 'focus_desk'
      ? '🔥 Đang Focus'
      : nextActivity === 'chill_sofa'
      ? '☕ Đang Chill'
      : nextActivity === 'sit_floor'
      ? '🧘 Đang ngồi bệt'
      : '✨ Đang dạo phòng';

    const nextLocal: PlayerState = {
      ...prev,
      ...patch,
      activity: nextActivity,
      statusText,
    };

    soundEngine.setFocusActivity(nextLocal.activity === 'focus_desk');

    set((s) => ({
      localPlayer: nextLocal,
      players: { ...s.players, [s.myPlayerId]: nextLocal },
    }));

    const now = performance.now();
    if (now - lastPositionEmit >= 45 || !patch.isMoving) {
      lastPositionEmit = now;
      socket?.emit('player:update', {
        gx: Number(nextLocal.gx.toFixed(2)),
        gy: Number(nextLocal.gy.toFixed(2)),
        facing: nextLocal.facing,
        isMoving: nextLocal.isMoving,
        isRunning: nextLocal.isRunning,
        activity: nextLocal.activity,
        statusText: nextLocal.statusText,
      });
    }
  },

  seatAtItem: (itemUid, slotId, gx, gy, activity, facing) => {
    const prev = get().localPlayer;
    const statusText = get().pinnedTodoId
      ? prev.statusText
      : activity === 'focus_desk'
      ? '💻 Đang ngồi Focus'
      : activity === 'sit_floor'
      ? '🧘 Đang ngồi thảm Chill'
      : '🛋️ Đang ngồi Chill';

    const nextLocal: PlayerState = {
      ...prev,
      gx,
      gy,
      facing,
      isMoving: false,
      isRunning: false,
      activity,
      seatedOnItemUid: itemUid,
      seatSlotId: slotId,
      statusText,
    };

    soundEngine.setFocusActivity(activity === 'focus_desk');
    soundEngine.playSfx('interact');

    set((s) => ({
      localPlayer: nextLocal,
      players: { ...s.players, [s.myPlayerId]: nextLocal },
    }));

    socket?.emit('player:update', {
      gx,
      gy,
      facing,
      isMoving: false,
      isRunning: false,
      activity,
      seatedOnItemUid: itemUid,
      seatSlotId: slotId,
      statusText,
    });
  },

  sitOnFloor: () => {
    const prev = get().localPlayer;
    if (prev.activity === 'sit_floor' || prev.seatedOnItemUid) {
      get().standUp();
      return;
    }

    const statusText = get().pinnedTodoId
      ? prev.statusText
      : '🧘 Đang ngồi chill dưới sàn';

    const nextLocal: PlayerState = {
      ...prev,
      facing: 'se',
      isMoving: false,
      isRunning: false,
      activity: 'sit_floor',
      seatedOnItemUid: undefined,
      seatSlotId: undefined,
      statusText,
    };

    soundEngine.setFocusActivity(false);
    soundEngine.playSfx('interact');

    set((s) => ({
      localPlayer: nextLocal,
      players: { ...s.players, [s.myPlayerId]: nextLocal },
    }));

    socket?.emit('player:update', {
      facing: 'se',
      isMoving: false,
      isRunning: false,
      activity: 'sit_floor',
      seatedOnItemUid: undefined,
      seatSlotId: undefined,
      statusText,
    });
  },

  standUp: () => {
    const prev = get().localPlayer;
    if (!prev.seatedOnItemUid && prev.activity !== 'sit_floor') return;

    const statusText = get().pinnedTodoId
      ? prev.statusText
      : '✨ Đang dạo phòng';

    const nextLocal: PlayerState = {
      ...prev,
      activity: 'idle',
      seatedOnItemUid: undefined,
      seatSlotId: undefined,
      statusText,
    };

    soundEngine.setFocusActivity(false);

    set((s) => ({
      localPlayer: nextLocal,
      players: { ...s.players, [s.myPlayerId]: nextLocal },
    }));

    socket?.emit('player:update', {
      activity: 'idle',
      seatedOnItemUid: undefined,
      seatSlotId: undefined,
      statusText,
    });
  },

  sendChat: (text) => {
    const clean = text.trim().slice(0, 140);
    if (!clean) return;
    soundEngine.playSfx('interact');

    if (socket && socket.connected) {
      socket.emit('player:chat', { text: clean });
    } else {
      const now = Date.now();
      const me = get().localPlayer;
      const msg: ChatMessage = {
        id: `local-${now}`,
        playerId: get().myPlayerId,
        name: me.name,
        tintColor: me.tintColor,
        text: clean,
        timestamp: now,
      };
      const bubble = { text: clean, expiresAt: now + 5500 };
      set((s) => ({
        chatMessages: [...s.chatMessages, msg].slice(-40),
        localPlayer: { ...s.localPlayer, chatBubble: bubble },
        players: {
          ...s.players,
          [s.myPlayerId]: { ...s.localPlayer, chatBubble: bubble },
        },
      }));
    }
  },

  sendEmote: (icon) => {
    soundEngine.playSfx('solve');
    if (socket && socket.connected) {
      socket.emit('player:emote', { icon });
    } else {
      const emote = { icon, expiresAt: Date.now() + 2600 };
      set((s) => ({
        localPlayer: { ...s.localPlayer, emote },
        players: {
          ...s.players,
          [s.myPlayerId]: { ...s.localPlayer, emote },
        },
      }));
    }
  },

  canBuild: () => get().isHost || get().layout.allowGuestBuild,

  toggleBuildMode: (force) => {
    if (!get().canBuild()) {
      get().showToast('🔒 Chỉ Chủ phòng mới có quyền xây & trang trí!');
      return;
    }
    const next = force !== undefined ? force : !get().buildMode;
    if (!next) {
      get().emitPreview(null);
    }
    set({
      buildMode: next,
      selectedCatalogId: next ? get().selectedCatalogId : null,
      movingItemUid: null,
      activeFloorBrush: next ? get().activeFloorBrush : null,
    });
  },

  setBuildTab: (tab) =>
    set({
      buildTab: tab,
      activeFloorBrush:
        tab === 'floor' && !get().activeWallBrush
          ? get().activeFloorBrush || 'W'
          : tab === 'floor'
          ? get().activeFloorBrush
          : null,
      activeWallBrush: tab === 'floor' ? get().activeWallBrush : null,
      selectedCatalogId: tab === 'floor' ? null : get().selectedCatalogId,
      movingItemUid: null,
    }),

  setActiveFloorBrush: (brush) =>
    set({
      activeFloorBrush: brush,
      activeWallBrush: null,
      selectedCatalogId: null,
      movingItemUid: null,
    }),

  setActiveWallBrush: (brush) =>
    set({
      activeWallBrush: brush,
      activeFloorBrush: null,
      selectedCatalogId: null,
      movingItemUid: null,
    }),

  selectCatalogItem: (catalogId) =>
    set({
      selectedCatalogId: catalogId,
      activeFloorBrush: null,
      activeWallBrush: null,
      movingItemUid: null,
      placeFlipped: false,
    }),

  startMovingItem: (uid) => {
    if (!uid) {
      set({ movingItemUid: null });
      get().emitPreview(null);
      return;
    }
    const existing = get().layout.items.find((i) => i.uid === uid);
    set({
      movingItemUid: uid,
      selectedCatalogId: null,
      activeFloorBrush: null,
      activeWallBrush: null,
      placeFlipped: existing ? existing.flipped : false,
    });
  },

  togglePlaceFlipped: () => set((s) => ({ placeFlipped: !s.placeFlipped })),

  emitPreview: (preview) => {
    if (socket && socket.connected && get().canBuild()) {
      socket.emit('room:preview_item', { preview });
    }
  },

  paintTile: (gx, gy, tile) => {
    if (!get().canBuild()) return;
    const layout = get().layout;
    if (gy < 0 || gy >= layout.floorMap.length) return;
    const row = layout.floorMap[gy] || '';
    if (gx < 0 || gx >= row.length) return;
    if (row[gx] === tile) return;

    // Enforce maxFloorTiles when adding a new floor tile onto an empty '.' cell
    if (row[gx] === '.' && tile !== '.' && layout.maxFloorTiles) {
      const currentCount = countFloorTiles(layout.floorMap);
      if (currentCount >= layout.maxFloorTiles) {
        get().showToast(`⚠️ Đã đạt giới hạn tối đa ${layout.maxFloorTiles} ô sàn!`);
        return;
      }
    }

    const nextRow = row.slice(0, gx) + tile + row.slice(gx + 1);
    const nextFloorMap = layout.floorMap.map((r, idx) =>
      idx === gy ? nextRow : r
    );
    const nextLayout = { ...layout, floorMap: nextFloorMap };

    soundEngine.playSfx('step');
    set({ layout: nextLayout });
    saveJsonStorage(`cozy_offline_layout_v2_${nextLayout.roomCode}`, nextLayout);
    socket?.emit('room:update_floor', { floorMap: nextFloorMap });
  },

  toggleWallSegment: (wallKey, mode) => {
    if (!get().canBuild()) return;
    const layout = get().layout;
    const currentWalls = layout.walls ? [...layout.walls] : autoGenerateWallsFromFloor(layout.floorMap, 200);
    const idx = currentWalls.indexOf(wallKey);

    if (mode === 'remove' || (mode !== 'add' && idx >= 0)) {
      if (idx < 0) return;
      currentWalls.splice(idx, 1);
    } else {
      if (idx >= 0) return;
      const limit = layout.maxWallTiles || 200;
      if (currentWalls.length >= limit) {
        get().showToast(`⚠️ Đã đạt giới hạn tối đa ${limit} ô tường!`);
        return;
      }
      currentWalls.push(wallKey);
    }

    const nextLayout = { ...layout, walls: currentWalls };
    soundEngine.playSfx('interact');
    set({ layout: nextLayout });
    saveJsonStorage(`cozy_offline_layout_v2_${nextLayout.roomCode}`, nextLayout);
    socket?.emit('room:update_floor', { walls: currentWalls });
  },

  autoBuildWalls: () => {
    if (!get().canBuild()) return;
    const layout = get().layout;
    const limit = layout.maxWallTiles || 200;
    const nextWalls = autoGenerateWallsFromFloor(layout.floorMap, limit);
    const nextLayout = { ...layout, walls: nextWalls };
    soundEngine.playSfx('interact');
    set({ layout: nextLayout });
    saveJsonStorage(`cozy_offline_layout_v2_${nextLayout.roomCode}`, nextLayout);
    socket?.emit('room:update_floor', { walls: nextWalls });
    get().showToast(`🧱 Đã tự động bo ${nextWalls.length}/${limit} ô tường theo hình dáng sàn!`);
  },

  expandFloorGrid: () => {
    if (!get().canBuild()) return;
    const layout = get().layout;
    const h = layout.floorMap.length;
    const w = Math.max(...layout.floorMap.map((r) => r.length));
    if (h >= 14 || w >= 14) {
      get().showToast('📐 Đã đạt kích thước tối đa 14x14!');
      return;
    }
    const nextMap = layout.floorMap.map((r) => `${r}W`);
    nextMap.push('W'.repeat(w + 1));
    const nextLayout = { ...layout, floorMap: nextMap };
    set({ layout: nextLayout });
    saveJsonStorage(`cozy_offline_layout_v2_${nextLayout.roomCode}`, nextLayout);
    socket?.emit('room:update_floor', { floorMap: nextMap });
    get().showToast(`📐 Đã mở rộng sàn lên ${w + 1}x${h + 1}`);
  },

  shrinkFloorGrid: () => {
    if (!get().canBuild()) return;
    const layout = get().layout;
    const h = layout.floorMap.length;
    const w = Math.max(...layout.floorMap.map((r) => r.length));
    if (h <= 6 || w <= 6) {
      get().showToast('📐 Kích thước tối thiểu là 6x6!');
      return;
    }
    const nextMap = layout.floorMap.slice(0, h - 1).map((r) => r.slice(0, w - 1));
    const nextLayout = { ...layout, floorMap: nextMap };
    set({ layout: nextLayout });
    saveJsonStorage(`cozy_offline_layout_v2_${nextLayout.roomCode}`, nextLayout);
    socket?.emit('room:update_floor', { floorMap: nextMap });
    get().showToast(`📐 Đã thu gọn sàn xuống ${w - 1}x${h - 1}`);
  },

  setWallTheme: (wallTheme) => {
    if (!get().canBuild()) return;
    const nextLayout = { ...get().layout, wallTheme };
    set({ layout: nextLayout });
    saveJsonStorage(`cozy_offline_layout_v2_${nextLayout.roomCode}`, nextLayout);
    socket?.emit('room:update_floor', { wallTheme });
  },

  setLightingMode: (lightingMode) => {
    if (!get().canBuild()) {
      // Allow local preview of atmosphere when guest? Actually allow host/local toggle cleanly:
      set((s) => ({ layout: { ...s.layout, lightingMode } }));
      return;
    }
    const nextLayout = { ...get().layout, lightingMode };
    set({ layout: nextLayout });
    saveJsonStorage(`cozy_offline_layout_v2_${nextLayout.roomCode}`, nextLayout);
    socket?.emit('room:update_floor', { lightingMode });
  },

  toggleRain: () => {
    const rainEnabled = !get().layout.rainEnabled;
    if (!get().canBuild()) {
      set((s) => ({ layout: { ...s.layout, rainEnabled } }));
      return;
    }
    const nextLayout = { ...get().layout, rainEnabled };
    set({ layout: nextLayout });
    saveJsonStorage(`cozy_offline_layout_v2_${nextLayout.roomCode}`, nextLayout);
    socket?.emit('room:update_floor', { rainEnabled });
  },

  setAllowGuestBuild: (allowGuestBuild) => {
    if (!get().isHost) return;
    const nextLayout = { ...get().layout, allowGuestBuild };
    set({ layout: nextLayout });
    saveJsonStorage(`cozy_offline_layout_v2_${nextLayout.roomCode}`, nextLayout);
    socket?.emit('room:set_guest_build', { allowGuestBuild });
    get().showToast(
      allowGuestBuild
        ? '🤝 Đã cho phép khách trong phòng cùng sửa nhà!'
        : '🔒 Đã tắt quyền sửa nhà của khách.'
    );
  },

  placeOrUpdateItem: (item) => {
    if (!get().canBuild()) return;
    const layout = get().layout;
    const exists = layout.items.some((i) => i.uid === item.uid);

    if (!exists && layout.maxItems && layout.items.length >= layout.maxItems) {
      get().showToast(`⚠️ Đã đạt giới hạn tối đa ${layout.maxItems} đồ vật trong phòng!`);
      return;
    }

    soundEngine.playSfx('interact');
    let nextItems: PlacedItem[];

    if (exists) {
      const old = layout.items.find((i) => i.uid === item.uid)!;
      const dx = item.gx - old.gx;
      const dy = item.gy - old.gy;
      nextItems = layout.items.map((i) => {
        if (i.uid === item.uid) return item;
        if (i.parentSurfaceUid === item.uid) {
          return {
            ...i,
            gx: Number((i.gx + dx).toFixed(2)),
            gy: Number((i.gy + dy).toFixed(2)),
          };
        }
        return i;
      });
    } else {
      nextItems = [...layout.items, item];
    }

    const nextLayout = { ...layout, items: nextItems };
    set({
      layout: nextLayout,
      movingItemUid: null,
    });
    get().emitPreview(null);
    saveJsonStorage(`cozy_offline_layout_v2_${nextLayout.roomCode}`, nextLayout);
    socket?.emit('room:place_item', { item });
  },

  removeItem: (uid) => {
    if (!get().canBuild()) return;
    soundEngine.playSfx('interact');
    const layout = get().layout;
    const removedIds = new Set<string>([uid]);
    for (const item of layout.items) {
      if (item.parentSurfaceUid === uid) removedIds.add(item.uid);
    }

    const nextItems = layout.items.filter((i) => !removedIds.has(i.uid));
    const nextLayout = { ...layout, items: nextItems };

    const me = get().localPlayer;
    if (me.seatedOnItemUid && removedIds.has(me.seatedOnItemUid)) {
      get().standUp();
    }

    set({
      layout: nextLayout,
      movingItemUid: get().movingItemUid === uid ? null : get().movingItemUid,
    });
    get().emitPreview(null);
    saveJsonStorage(`cozy_offline_layout_v2_${nextLayout.roomCode}`, nextLayout);
    socket?.emit('room:remove_item', { uid });
  },

  toggleItemInteraction: (uid) => {
    const item = get().layout.items.find((i) => i.uid === uid);
    if (!item) return;
    const meta = getCatalogItem(item.catalogId);
    if (!meta?.altSprite) return;

    soundEngine.playSfx('interact');
    const nextToggled = !item.toggled;
    set((s) => ({
      layout: {
        ...s.layout,
        items: s.layout.items.map((i) =>
          i.uid === uid ? { ...i, toggled: nextToggled } : i
        ),
      },
    }));
    socket?.emit('room:toggle_item', { uid });
  },

  resetDefaultRoom: () => {
    if (!get().isHost) return;
    const cur = get().layout;
    const nextLayout = cur.isPersonal
      ? createPersonalRoomLayout(get().roomCode, get().hostKey, get().localPlayer.name)
      : createDefaultRoomLayout(get().roomCode, get().hostKey);
    set({ layout: nextLayout, movingItemUid: null, selectedCatalogId: null });
    saveJsonStorage(`cozy_offline_layout_v2_${nextLayout.roomCode}`, nextLayout);
    socket?.emit('room:reset_default');
    get().showToast('🏡 Đã khôi phục căn hộ mẫu ấm cúng!');
  },

  kickPlayer: (playerId: string) => {
    if (!get().isHost) return;
    socket?.emit('room:kick_player', { playerId });
    set((s) => {
      const nextPlayers = { ...s.players };
      delete nextPlayers[playerId];
      return { players: nextPlayers };
    });
    get().showToast('Đã mời người chơi ra khỏi phòng');
  },

  // Pomodoro
  startPomodoro: () => {
    const next: PomodoroState = {
      ...get().pomodoro,
      isRunning: true,
      updatedAt: Date.now(),
    };
    set({ pomodoro: next });
    soundEngine.playSfx('interact');
    if (next.syncedWithRoom) socket?.emit('pomodoro:sync', { pomodoro: next });
  },

  pausePomodoro: () => {
    const next: PomodoroState = {
      ...get().pomodoro,
      isRunning: false,
      updatedAt: Date.now(),
    };
    set({ pomodoro: next });
    if (next.syncedWithRoom) socket?.emit('pomodoro:sync', { pomodoro: next });
  },

  resetPomodoro: () => {
    const mode = get().pomodoro.mode;
    const sec = POMODORO_DURATIONS[mode];
    const next: PomodoroState = {
      ...get().pomodoro,
      isRunning: false,
      remainingSec: sec,
      totalSec: sec,
      updatedAt: Date.now(),
    };
    set({ pomodoro: next });
    if (next.syncedWithRoom) socket?.emit('pomodoro:sync', { pomodoro: next });
  },

  switchPomodoroMode: (mode) => {
    const sec = POMODORO_DURATIONS[mode];
    const next: PomodoroState = {
      ...get().pomodoro,
      mode,
      isRunning: false,
      remainingSec: sec,
      totalSec: sec,
      updatedAt: Date.now(),
    };
    set({ pomodoro: next });
    if (next.syncedWithRoom) socket?.emit('pomodoro:sync', { pomodoro: next });
  },

  togglePomodoroRoomSync: () => {
    const next = {
      ...get().pomodoro,
      syncedWithRoom: !get().pomodoro.syncedWithRoom,
    };
    set({ pomodoro: next });
    if (next.syncedWithRoom) socket?.emit('pomodoro:sync', { pomodoro: next });
  },

  tickPomodoro: () => {
    const p = get().pomodoro;
    if (!p.isRunning) return;

    if (p.remainingSec <= 1) {
      soundEngine.playSfx('fanfare');
      const nextMode: PomodoroMode =
        p.mode === 'focus' ? 'short_break' : 'focus';
      const nextSec = POMODORO_DURATIONS[nextMode];
      const completed =
        p.mode === 'focus'
          ? get().completedPomodoros + 1
          : get().completedPomodoros;

      set({
        completedPomodoros: completed,
        pomodoro: {
          ...p,
          isRunning: false,
          mode: nextMode,
          remainingSec: nextSec,
          totalSec: nextSec,
          updatedAt: Date.now(),
        },
      });
      get().showToast(
        p.mode === 'focus'
          ? '🎉 Hoàn thành phiên Focus! Nghỉ giải lao chút nhé 💕'
          : '⏰ Hết giờ nghỉ rồi! Quay lại Focus nào!'
      );
      return;
    }

    set({
      pomodoro: {
        ...p,
        remainingSec: p.remainingSec - 1,
      },
    });
  },

  // Todos
  addTodo: (text) => {
    const clean = text.trim();
    if (!clean) return;
    const item: TodoItem = {
      id: `todo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text: clean,
      completed: false,
      createdAt: Date.now(),
    };
    const next = [item, ...get().todos];
    set({ todos: next });
    saveJsonStorage('cozy_todos', next);
  },

  toggleTodo: (id) => {
    const next = get().todos.map((t) =>
      t.id === id ? { ...t, completed: !t.completed } : t
    );
    const target = next.find((t) => t.id === id);
    if (target?.completed) {
      soundEngine.playSfx('solve');
    }
    set({ todos: next });
    saveJsonStorage('cozy_todos', next);
  },

  deleteTodo: (id) => {
    const next = get().todos.filter((t) => t.id !== id);
    const wasPinned = get().pinnedTodoId === id;
    set({
      todos: next,
      pinnedTodoId: wasPinned ? null : get().pinnedTodoId,
    });
    saveJsonStorage('cozy_todos', next);
    if (wasPinned) get().pinTodo(null);
  },

  pinTodo: (id) => {
    const target = id ? get().todos.find((t) => t.id === id) : undefined;
    const statusText = target
      ? `📝 ${target.text.slice(0, 26)}`
      : get().localPlayer.activity === 'focus_desk'
      ? '💻 Đang ngồi Focus'
      : '✨ Đang chill trong phòng';

    const nextLocal = { ...get().localPlayer, statusText };
    set((s) => ({
      pinnedTodoId: target ? target.id : null,
      localPlayer: nextLocal,
      players: { ...s.players, [s.myPlayerId]: nextLocal },
    }));
    socket?.emit('player:update', { statusText });
  },

  // Audio Mixer
  setChannelVolume: (channel, vol) => {
    soundEngine.unlockAudio();
    const clamped = Math.max(0, Math.min(1, vol));
    const next: AudioMixerState = { ...get().audioMixer, [channel]: clamped };
    soundEngine.setChannelVolume(channel, clamped);
    set({ audioMixer: next });
    saveJsonStorage('cozy_audio_mixer', next);
  },

  toggleMasterMute: () => {
    soundEngine.unlockAudio();
    const muted = !get().audioMixer.muted;
    const next: AudioMixerState = { ...get().audioMixer, muted };
    soundEngine.setMasterMute(muted);
    set({ audioMixer: next });
    saveJsonStorage('cozy_audio_mixer', next);
  },

  // Desktop Companion (Tauri v2 APIs)
  toggleAlwaysOnTop: async () => {
    const next = !get().alwaysOnTop;
    set({ alwaysOnTop: next });
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().setAlwaysOnTop(next);
      get().showToast(
        next
          ? '📌 Đã ghim cửa sổ nổi trên mọi ứng dụng (Always-on-top)'
          : '📌 Đã bỏ ghim cửa sổ nổi'
      );
    } catch {
      get().showToast(
        next
          ? '📌 Chế độ Ghim nổi chỉ hoạt động trong App Desktop Tauri!'
          : '📌 Đã tắt chế độ Ghim nổi'
      );
    }
  },

  toggleMiniMode: async () => {
    const next = !get().miniMode;
    set({ miniMode: next });
    try {
      const { getCurrentWindow, LogicalSize } = await import(
        '@tauri-apps/api/window'
      );
      const win = getCurrentWindow();
      if (next) {
        await win.setSize(new LogicalSize(420, 420));
        await win.setAlwaysOnTop(true);
        set({ alwaysOnTop: true });
      } else {
        await win.setSize(new LogicalSize(1280, 800));
      }
    } catch {
      // Browser environment ignores native window resize cleanly
    }
  },
}));
