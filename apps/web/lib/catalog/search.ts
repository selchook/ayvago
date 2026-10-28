// Game search, as on the Ayvago Arcade games portal: a game matches when every word of the
// query appears in its titles (all languages), its slug or its category names. Matching
// ignores case and accents, so "yilan" finds "Yılan" and "ceker" finds "Çeker".
// Pure functions: the search page runs them in the browser.

/** Lowercases, removes accents and folds the Turkish dotless ı, so both spellings match. */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when every word of the query is found in the game's search text. */
export function matchesSearch(text: string, query: string): boolean {
  const words = normalizeSearch(query).split(' ').filter(Boolean);
  return words.every((word) => text.includes(word));
}
