import type { GameCategory } from '@ayvago/shared';
import { DiceIcon, JoystickIcon, PuzzleIcon, SmileIcon } from './icons';

const ICONS: Record<GameCategory, typeof JoystickIcon> = {
  retro_action: JoystickIcon,
  casual: SmileIcon,
  puzzle: PuzzleIcon,
  board: DiceIcon,
};

export function CategoryIcon({ category, size }: { category: GameCategory; size?: number }) {
  const Icon = ICONS[category];
  return <Icon size={size} />;
}
