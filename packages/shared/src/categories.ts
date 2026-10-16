// Catalog categories. Keys are stored in Firestore (games/{id}.category);
// display labels live in the web app's message files under "categories.<key>".
export const GAME_CATEGORIES = ['retro_action', 'casual', 'puzzle', 'board'] as const;

export type GameCategory = (typeof GAME_CATEGORIES)[number];
