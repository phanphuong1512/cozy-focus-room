import type {
  ActivityType,
  CustomAvatarConfig,
  FacingDirection,
  OutfitId,
  HairStyleId,
  EyeStyleId,
  TopStyleId,
  AccessoryId,
} from './types';

export const DEFAULT_CUSTOM_AVATAR: CustomAvatarConfig = {
  skinTone: '#f3d2b3',
  hairStyle: 'girl_long',
  hairColor: 'original',
  eyeStyle: 'cute',
  blush: true,
  topStyle: 'hoodie',
  topColor: '#a78bfa',
  bottomColor: '#334155',
  shoeColor: '#f8fafc',
  accessory: 'none',
};

export const SKIN_TONES: { label: string; color: string }[] = [
  { label: 'Sáng hồng', color: '#fbe0cc' },
  { label: 'Tự nhiên', color: '#f3d2b3' },
  { label: 'Ấm áp', color: '#e5b88b' },
  { label: 'Mật ong', color: '#c98e5b' },
  { label: 'Nâu ấm', color: '#9c643c' },
  { label: 'Pastel', color: '#e2d4f0' },
];

export const SPRITE_HAIR_STYLES: HairStyleId[] = [
  'girl_long',
  'girl_ponytail',
  'girl_bob',
];

export function isSpriteHairStyle(style: HairStyleId): boolean {
  return SPRITE_HAIR_STYLES.includes(style);
}

export function getHairSpritePath(style: HairStyleId, isBack: boolean): string | null {
  if (!isSpriteHairStyle(style)) return null;
  return `/sprites/characters/hair/${style}_${isBack ? 'nw' : 'se'}.png`;
}

export function getAllHairSpritePaths(): string[] {
  const paths: string[] = [];
  for (const id of SPRITE_HAIR_STYLES) {
    paths.push(`/sprites/characters/hair/${id}_se.png`);
    paths.push(`/sprites/characters/hair/${id}_nw.png`);
  }
  return paths;
}

export const HAIR_STYLES: { id: HairStyleId; label: string }[] = [
  { id: 'girl_long', label: 'Nữ tóc dài' },
  { id: 'girl_ponytail', label: 'Nữ buộc cao' },
  { id: 'girl_bob', label: 'Nữ tóc ngắn' },
  { id: 'short', label: 'Tóc ngắn' },
  { id: 'bob', label: 'Tóc bob' },
  { id: 'ponytail', label: 'Đuôi ngựa' },
  { id: 'spiky', label: 'Tóc dựng' },
  { id: 'bun', label: 'Búi củ tỏi' },
  { id: 'long', label: 'Tóc dài' },
  { id: 'none', label: 'Tối giản' },
];

export const HAIR_COLORS: string[] = [
  'original', // Màu gốc của sprite tóc
  '#272026', // Đen than
  '#5c3a21', // Nâu hạt dẻ
  '#c48a47', // Vàng mật ong
  '#f472b6', // Hồng pastel
  '#a78bfa', // Tím lavender
  '#38bdf8', // Xanh băng
  '#34d399', // Xanh mint
  '#e2e8f0', // Bạch kim
  '#be123c', // Đỏ rượu
];

export const EYE_STYLES: { id: EyeStyleId; label: string }[] = [
  { id: 'cute', label: 'Tròn cute' },
  { id: 'happy', label: 'Mắt cười' },
  { id: 'cool', label: 'Ngầu' },
  { id: 'sleepy', label: 'Buồn ngủ' },
  { id: 'wink', label: 'Nháy mắt' },
];

export const TOP_STYLES: { id: TopStyleId; label: string }[] = [
  { id: 'hoodie', label: 'Hoodie' },
  { id: 'tshirt', label: 'Áo phông' },
  { id: 'sweater', label: 'Áo len' },
  { id: 'cardigan', label: 'Cardigan' },
  { id: 'dress', label: 'Váy liền' },
];

export const CLOTHING_COLORS: string[] = [
  '#f472b6',
  '#a78bfa',
  '#38bdf8',
  '#34d399',
  '#fbbf24',
  '#fb7185',
  '#334155',
  '#1e293b',
  '#f8fafc',
  '#7c2d12',
];

export const ACCESSORIES: { id: AccessoryId; label: string }[] = [
  { id: 'none', label: 'Không' },
  { id: 'headphones', label: 'Tai nghe' },
  { id: 'cat_ears', label: 'Tai mèo' },
  { id: 'cap', label: 'Mũ lưỡi trai' },
  { id: 'beanie', label: 'Mũ len' },
  { id: 'glasses', label: 'Kính cận' },
  { id: 'bow', label: 'Nơ xinh' },
];

export interface CharacterSkinMeta {
  id: OutfitId;
  name: string;
  subtitle: string;
  avatar: string;
  isModularIso: boolean;
}

export const ISO_CHARACTER_IDS: OutfitId[] = [
  'custom',
  'c1',
  'c2',
  'c3',
  'c4',
  'c5',
  'c6',
  'c7',
  'c8',
  'c9',
  'c10',
  'c11',
  'c12',
];

export const CHARACTER_SKINS: CharacterSkinMeta[] = [
  {
    id: 'custom',
    name: 'Tự Tạo Avatar',
    subtitle: 'Tùy biến tóc, mắt, áo & phụ kiện',
    avatar: '/sprites/characters/base/avatar.png',
    isModularIso: true,
  },
  {
    id: 'c7',
    name: 'Kaito',
    subtitle: 'Tóc tím • Hoodie xanh rêu',
    avatar: '/sprites/characters/c7/avatar.png',
    isModularIso: true,
  },
  {
    id: 'c8',
    name: 'Bách',
    subtitle: 'Tóc xoăn • Cardigan vàng',
    avatar: '/sprites/characters/c8/avatar.png',
    isModularIso: true,
  },
  {
    id: 'c9',
    name: 'Sora',
    subtitle: 'Tóc bạch kim • Áo Varsity',
    avatar: '/sprites/characters/c9/avatar.png',
    isModularIso: true,
  },
  {
    id: 'c10',
    name: 'Na',
    subtitle: 'Tóc đuôi ngựa • Áo hồng phấn',
    avatar: '/sprites/characters/c10/avatar.png',
    isModularIso: true,
  },
  {
    id: 'c11',
    name: 'Hân',
    subtitle: 'Kính tròn • Ghi-lê nâu',
    avatar: '/sprites/characters/c11/avatar.png',
    isModularIso: true,
  },
  {
    id: 'c12',
    name: 'An',
    subtitle: 'Tóc tết • Khoác bò xanh',
    avatar: '/sprites/characters/c12/avatar.png',
    isModularIso: true,
  },
  {
    id: 'c1',
    name: 'Minh',
    subtitle: 'Tóc đen • Áo len kem',
    avatar: '/sprites/characters/c1/avatar.png',
    isModularIso: true,
  },
  {
    id: 'c2',
    name: 'Khoa',
    subtitle: 'Tóc nâu rẽ ngôi • Điềm đạm',
    avatar: '/sprites/characters/c2/avatar.png',
    isModularIso: true,
  },
  {
    id: 'c3',
    name: 'Leo',
    subtitle: 'Tóc vàng • Kính tròn',
    avatar: '/sprites/characters/c3/avatar.png',
    isModularIso: true,
  },
  {
    id: 'c4',
    name: 'Linh',
    subtitle: 'Tóc đen dài • Dịu dàng',
    avatar: '/sprites/characters/c4/avatar.png',
    isModularIso: true,
  },
  {
    id: 'c5',
    name: 'Vy',
    subtitle: 'Tóc bob nâu • Ấm áp',
    avatar: '/sprites/characters/c5/avatar.png',
    isModularIso: true,
  },
  {
    id: 'c6',
    name: 'Miu',
    subtitle: 'Tóc búi • Kính tròn',
    avatar: '/sprites/characters/c6/avatar.png',
    isModularIso: true,
  },
];

export function isIsoCharacter(outfit: string): outfit is OutfitId {
  return (ISO_CHARACTER_IDS as readonly string[]).includes(outfit);
}

export function getAllCharacterSpritePaths(): string[] {
  const paths: string[] = [];

  const frameNames = [
    'idle_se',
    'idle_nw',
    'walk_se_0',
    'walk_se_1',
    'walk_se_2',
    'walk_se_3',
    'walk_nw_0',
    'walk_nw_1',
    'walk_nw_2',
    'walk_nw_3',
    'sit_typing_nw',
    'sit_typing_se',
    'sit_chill_se',
    'sit_floor_se',
  ];

  for (const cid of ISO_CHARACTER_IDS) {
    const folder = cid === 'custom' ? 'base' : cid;
    for (const f of frameNames) {
      paths.push(`/sprites/characters/${folder}/${f}.png`);
    }
  }
  return paths;
}

export function resolveIsoCharacterFrame(
  outfit: OutfitId | string,
  facing: FacingDirection,
  activity: ActivityType,
  isMoving: boolean,
  walkFrame: number
): { path: string; flipX: boolean } {
  const safeOutfit: OutfitId = isIsoCharacter(outfit) ? outfit : 'c1';
  const isNorthSide = facing === 'nw' || facing === 'ne' || facing === 'back';
  const flipNorth = facing === 'ne';
  const flipSouth = facing === 'sw' || facing === 'left';

  const folder = safeOutfit === 'custom' ? 'base' : safeOutfit;
  const baseDir = `/sprites/characters/${folder}`;

  if (activity === 'focus_desk') {
    if (isNorthSide) {
      return { path: `${baseDir}/sit_typing_nw.png`, flipX: flipNorth };
    }
    return { path: `${baseDir}/sit_typing_se.png`, flipX: flipSouth };
  }

  if (activity === 'chill_sofa' || activity === 'coffee') {
    return { path: `${baseDir}/sit_chill_se.png`, flipX: flipSouth };
  }

  if (activity === 'sit_floor') {
    return { path: `${baseDir}/sit_floor_se.png`, flipX: flipSouth };
  }

  if (isMoving) {
    const idx = Math.abs(walkFrame) % 4;
    if (isNorthSide) {
      return { path: `${baseDir}/walk_nw_${idx}.png`, flipX: flipNorth };
    }
    return { path: `${baseDir}/walk_se_${idx}.png`, flipX: flipSouth };
  }

  if (isNorthSide) {
    return { path: `${baseDir}/idle_nw.png`, flipX: flipNorth };
  }
  return { path: `${baseDir}/idle_se.png`, flipX: flipSouth };
}
