import type { AchievementIcon as IconKey } from '@ayvago/shared';
import {
  BoltIcon,
  ClockIcon,
  CrownIcon,
  GlobeIcon,
  JoystickIcon,
  PlayIcon,
  SparkleIcon,
  TrophyIcon,
} from '../icons';

const ICONS: Record<IconKey, typeof PlayIcon> = {
  play: PlayIcon,
  joystick: JoystickIcon,
  globe: GlobeIcon,
  sparkle: SparkleIcon,
  bolt: BoltIcon,
  trophy: TrophyIcon,
  crown: CrownIcon,
  clock: ClockIcon,
};

/** The SVG icon behind an achievement's icon key (packages/shared/src/achievements.ts). */
export function AchievementIcon({ icon, size = 22 }: { icon: IconKey; size?: number }) {
  const Icon = ICONS[icon];
  return <Icon size={size} />;
}
