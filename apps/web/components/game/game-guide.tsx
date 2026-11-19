import type { GameManifest } from '@ayvago/shared';
import { getTranslations } from 'next-intl/server';
import type { LocalizedGuide } from '@/lib/catalog/guides';
import styles from './game.module.css';

/**
 * The game page's written guide (slice 3.5): about, how to play, controls, tips, features and the
 * FAQ as plain server-rendered HTML, so the page carries its own text beside the game frame.
 * Rendered only when the studio has written a guide; otherwise the page keeps its short form.
 */
export async function GameGuide({
  guide,
  description,
  inputs,
}: {
  guide: LocalizedGuide;
  /** The manifest description, the lead paragraph of the about section. */
  description: string;
  /** The game's inputs (manifest): any the guide does not describe stay as chips. */
  inputs: GameManifest['input'];
}) {
  const t = await getTranslations();
  const described = new Set<string>(guide.controls.map((row) => row.input));
  const otherInputs = inputs.filter((input) => !described.has(input));

  return (
    <div className={styles.guide}>
      <section className={styles.section} aria-labelledby="about-heading">
        <h2 id="about-heading">{t('game.description')}</h2>
        <p className={styles.lead}>{description}</p>
        {guide.about.map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </section>

      <section className={styles.section} aria-labelledby="how-heading">
        <h2 id="how-heading">{t('guide.howToPlay')}</h2>
        <ol className={styles.steps}>
          {guide.howToPlay.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </section>

      <section className={styles.section} aria-labelledby="controls-heading">
        <h2 id="controls-heading">{t('game.controls')}</h2>
        <dl className={styles.controls}>
          {guide.controls.map(({ input, text }) => (
            <div key={input}>
              <dt>{t(`input.${input}`)}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
        {otherInputs.length > 0 ? (
          <ul className={styles.chips} aria-label={t('guide.otherInputs')}>
            {otherInputs.map((input) => (
              <li key={input}>{t(`input.${input}`)}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className={styles.section} aria-labelledby="tips-heading">
        <h2 id="tips-heading">{t('guide.tips')}</h2>
        <ul className={styles.bullets}>
          {guide.tips.map((tip, i) => (
            <li key={i}>{tip}</li>
          ))}
        </ul>
      </section>

      {guide.features.length > 0 ? (
        <section className={styles.section} aria-labelledby="features-heading">
          <h2 id="features-heading">{t('guide.features')}</h2>
          <ul className={styles.bullets}>
            {guide.features.map((feature, i) => (
              <li key={i}>{feature}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {guide.faq.length > 0 ? (
        <section className={styles.section} aria-labelledby="faq-heading">
          <h2 id="faq-heading">{t('guide.faq')}</h2>
          <div className={styles.faq}>
            {guide.faq.map(({ q, a }, i) => (
              <div key={i}>
                <h3>{q}</h3>
                <p>{a}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
