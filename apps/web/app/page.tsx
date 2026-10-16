import { GAME_CATEGORIES, GAME_CATEGORY_LABELS } from '@ayvago/shared';

export default function HomePage() {
  return (
    <main className="landing">
      <p className="eyebrow">ayvago.com</p>
      <h1>Ayvago</h1>
      <p className="lead">Retro aksiyon, casual ve bulmaca oyunları tek platformda. Çok yakında.</p>
      <ul className="categories" aria-label="Kategoriler">
        {GAME_CATEGORIES.map((key) => (
          <li key={key}>{GAME_CATEGORY_LABELS[key].tr}</li>
        ))}
      </ul>
    </main>
  );
}
