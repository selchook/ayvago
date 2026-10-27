import type { GameCategory } from '@ayvago/shared';
import {
  BallIcon,
  BoltIcon,
  CardIcon,
  CrownIcon,
  JoystickIcon,
  LetterIcon,
  PixelIcon,
  PuzzleIcon,
  SmileIcon,
} from './icons';

const ICONS: Record<GameCategory, typeof JoystickIcon> = {
  arcade: JoystickIcon,
  action: BoltIcon,
  casual: SmileIcon,
  puzzle: PuzzleIcon,
  retro: PixelIcon,
  sports: BallIcon,
  strategy: CrownIcon,
  card: CardIcon,
  word: LetterIcon,
};

export function CategoryIcon({ category, size }: { category: GameCategory; size?: number }) {
  const Icon = ICONS[category];
  return <Icon size={size} />;
}
