export type TileType = 'W' | 'B' | 'C' | '.';

export type PlacementLayer = 'floor' | 'wall' | 'surface';

export type WallMountSide = 'left' | 'right';

export type ActivityType =
  | 'idle'
  | 'walking'
  | 'focus_desk'
  | 'chill_sofa'
  | 'sit_floor'
  | 'sleep'
  | 'coffee';

export type FacingDirection =
  | 'se'
  | 'sw'
  | 'nw'
  | 'ne'
  | 'front'
  | 'back'
  | 'left'
  | 'right';

export type OutfitId =
  | 'c1'
  | 'c2'
  | 'c3'
  | 'c4'
  | 'c5'
  | 'c6'
  | 'c7'
  | 'c8'
  | 'c9'
  | 'c10'
  | 'c11'
  | 'c12';

export type WallTheme = 'cream' | 'lofi_purple' | 'sage' | 'brick';

export type LightingMode = 'day' | 'sunset' | 'night';

export type CatalogCategory =
  | 'living_room'
  | 'workspace'
  | 'kitchen'
  | 'bathroom'
  | 'decor';

export interface SeatSlot {
  id: string;
  offsetGx: number;
  offsetGy: number;
  activity: ActivityType;
  label: string;
  facing: FacingDirection;
}

export interface LightEmitterConfig {
  color: number;
  radius: number;
  intensity: number;
  offsetY?: number;
}

export interface GridCell {
  dx: number;
  dy: number;
}

export interface CatalogItem {
  id: string;
  name: string;
  category: CatalogCategory;
  placement: PlacementLayer;
  sprite: string;
  altSprite?: string;
  footprint: { w: number; h: number };
  footprintCells?: GridCell[];
  scale: number;
  offsetX?: number;
  offsetY?: number;
  isSurface?: boolean;
  surfaceHeightPx?: number;
  wallElevationPx?: number;
  seatSlots?: SeatSlot[];
  lightEmitter?: LightEmitterConfig;
  description?: string;
  walkable?: boolean;
}

export interface PlacedItem {
  uid: string;
  catalogId: string;
  gx: number;
  gy: number;
  rotation: 0 | 1 | 2 | 3;
  flipped: boolean;
  layer: PlacementLayer;
  parentSurfaceUid?: string;
  elevationPx: number;
  toggled: boolean;
}

export interface RoomLayout {
  roomCode: string;
  roomName: string;
  hostId: string;
  allowGuestBuild: boolean;
  floorMap: string[];
  walls?: string[];
  wallTheme: WallTheme;
  lightingMode: LightingMode;
  rainEnabled: boolean;
  items: PlacedItem[];
  isPersonal?: boolean;
  ownerUid?: string;
  maxItems?: number;
  maxFloorTiles?: number;
  maxWallTiles?: number;
}

export interface PlayerChatBubble {
  text: string;
  expiresAt: number;
}

export interface PlayerEmote {
  icon: string;
  expiresAt: number;
}

export interface PlayerState {
  id: string;
  name: string;
  outfit: OutfitId;
  tintColor: string;
  gx: number;
  gy: number;
  facing: FacingDirection;
  isMoving: boolean;
  isRunning: boolean;
  activity: ActivityType;
  seatedOnItemUid?: string;
  seatSlotId?: string;
  statusText: string;
  chatBubble?: PlayerChatBubble;
  emote?: PlayerEmote;
}

export interface GhostPreview {
  playerId: string;
  catalogId: string;
  gx: number;
  gy: number;
  flipped: boolean;
  elevationPx: number;
  layer: PlacementLayer;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  name: string;
  tintColor: string;
  text: string;
  timestamp: number;
}

export type PomodoroMode = 'focus' | 'short_break' | 'long_break';

export interface PomodoroState {
  isRunning: boolean;
  mode: PomodoroMode;
  remainingSec: number;
  totalSec: number;
  syncedWithRoom: boolean;
  updatedAt: number;
}

export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
}

export type AudioChannel = 'bgm' | 'rain' | 'fire' | 'keyboard' | 'wind';

export interface AudioMixerState {
  muted: boolean;
  bgm: number;
  rain: number;
  fire: number;
  keyboard: number;
  wind: number;
}
