import type { ViewStyle } from 'react-native';
import { borderRadius, colors } from '@blendi/shared';

import blendiLogo from '../../assets/images/blendi-logo.png';
import swirl from '../../assets/images/swirl.png';

export const images = {
  swirl,
  blendiLogo,
} as const;

export const imagePlaceholderStyles = {
  swirl: {
    backgroundColor: colors.brand.pulse,
    borderRadius: borderRadius.full,
  },
  blendiLogo: {
    backgroundColor: colors.brand.pulse,
    borderRadius: borderRadius.md,
  },
} satisfies Record<'swirl' | 'blendiLogo', ViewStyle>;

export type AppImageKey = keyof typeof imagePlaceholderStyles;