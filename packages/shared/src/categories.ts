// Catalog categories shown on the platform. Keys are stored in Firestore (games/{id}.category).
export const GAME_CATEGORIES = ['retro_action', 'casual', 'puzzle', 'board'] as const;

export type GameCategory = (typeof GAME_CATEGORIES)[number];

export const GAME_CATEGORY_LABELS: Record<GameCategory, { tr: string; en: string }> = {
  retro_action: { tr: 'Retro Aksiyon', en: 'Retro Action' },
  casual: { tr: 'Casual', en: 'Casual' },
  puzzle: { tr: 'Bulmaca', en: 'Puzzle' },
  board: { tr: 'Masa Oyunları', en: 'Board' },
};
