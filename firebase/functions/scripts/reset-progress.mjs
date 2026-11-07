// Resets every player's progress on the Firebase project of the credentials (slice 5.13,
// docs/adr/0017-server-best-and-fresh-start.md). Run by .github/workflows/reset-progress.yml with
// the deploy service account:
//   node scripts/reset-progress.mjs --backup <file>                        dry run: back up and count
//   node scripts/reset-progress.mjs --backup <file> --execute --confirm "RESET ALL PROGRESS"
// The backup (one JSON file) is always written before anything is deleted. Exits non-zero on any
// error. What is reset and what is kept: reset-progress-lib.mjs.
import { appendFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { CONFIRM_PHRASE, resetProgress } from './reset-progress-lib.mjs';

const LABELS = {
  leaderboards: 'Leaderboard documents (boards, entries, season archives)',
  stats: 'Play statistics (users/*/stats/*)',
  progress: 'Progress documents (users/*/progress/*)',
  userLevels: 'Profiles with xp/level',
  libraryBests: 'Account libraries with best scores',
  sessions: 'Score sessions',
};

async function main() {
  const { values } = parseArgs({
    options: {
      backup: { type: 'string' },
      execute: { type: 'boolean', default: false },
      confirm: { type: 'string', default: '' },
    },
  });
  if (!values.backup) {
    console.error(
      'Usage: node scripts/reset-progress.mjs --backup <file> [--execute --confirm "…"]',
    );
    return 2;
  }
  const dryRun = !values.execute;
  if (!dryRun && values.confirm !== CONFIRM_PHRASE) {
    console.error(`Refusing to delete: --confirm must be exactly "${CONFIRM_PHRASE}".`);
    return 2;
  }

  initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID });
  const db = getFirestore();
  console.log(dryRun ? 'Dry run: backing up and counting only.' : 'Resetting all progress.');

  const backupFile = values.backup;
  const { counts } = await resetProgress(db, {
    dryRun,
    saveBackup: async (backup) => {
      await writeFile(backupFile, JSON.stringify(backup));
      console.log(`Backup written to ${backupFile}.`);
    },
  });

  const verb = dryRun ? 'would be reset' : 'reset';
  const lines = Object.entries(counts).map(([key, count]) => `${LABELS[key] ?? key}: ${count}`);
  console.log(`Documents ${verb}:\n${lines.map((line) => `  ${line}`).join('\n')}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = Object.entries(counts)
      .map(([key, count]) => `| ${LABELS[key] ?? key} | ${count} |`)
      .join('\n');
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `### Progress reset (${dryRun ? 'dry run' : 'executed'})\n\n| Data | Documents ${verb} |\n|---|---|\n${rows}\n`,
    );
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error('Progress reset failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
