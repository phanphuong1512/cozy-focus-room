import type { ActivityType, FacingDirection, OutfitId } from './types';

export interface CharacterSkinMeta {
  id: OutfitId;
  name: string;
  subtitle: string;
  avatar: string;
  isModularIso: boolean;
}

export const ISO_CHARACTER_IDS: OutfitId[] = [
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
  {
    id: 'vintage',
    name: 'Froggie Váy Hoa',
    subtitle: 'Phiên bản cổ điển',
    avatar: '/sprites/character/portrait_happy.png',
    isModularIso: false,
  },
];

export function isIsoCharacter(outfit: OutfitId): boolean {
  return (ISO_CHARACTER_IDS as readonly string[]).includes(outfit);
}

export function getAllCharacterSpritePaths(): string[] {
  const paths: string[] = [
    '/sprites/character/froggie_front.png',
    '/sprites/character/froggie_back.png',
    '/sprites/character/froggie_left.png',
    '/sprites/character/froggie_right.png',
    '/sprites/character/froggie_variant_skirt.png',
    '/sprites/character/froggie_variant_pants.png',
  ];

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
    for (const f of frameNames) {
      paths.push(`/sprites/characters/${cid}/${f}.png`);
    }
  }
  return paths;
}

export function resolveIsoCharacterFrame(
  outfit: OutfitId,
  facing: FacingDirection,
  activity: ActivityType,
  isMoving: boolean,
  walkFrame: number
): { path: string; flipX: boolean } {
  const isNorthSide = facing === 'nw' || facing === 'ne' || facing === 'back';
  const flipNorth = facing === 'ne';
  const flipSouth = facing === 'sw' || facing === 'left';

  if (!isIsoCharacter(outfit)) {
    if (outfit === 'skirt') {
      return {
        path: '/sprites/character/froggie_variant_skirt.png',
        flipX: facing === 'left' || facing === 'sw' || facing === 'nw',
      };
    }
    if (outfit === 'pants') {
      return {
        path: '/sprites/character/froggie_variant_pants.png',
        flipX: facing === 'left' || facing === 'sw' || facing === 'nw',
      };
    }
    const baseFacing =
      facing === 'nw' || facing === 'ne' || facing === 'back'
        ? '/sprites/character/froggie_back.png'
        : facing === 'left' || facing === 'sw'
        ? '/sprites/character/froggie_left.png'
        : facing === 'right'
        ? '/sprites/character/froggie_right.png'
        : '/sprites/character/froggie_front.png';
    return { path: baseFacing, flipX: false };
  }

  const baseDir = `/sprites/characters/${outfit}`;

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
