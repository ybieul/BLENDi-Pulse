import type { ViewStyle } from 'react-native';
import { borderRadius, colors } from '@blendi/shared';

export const images = {
  // swirl: require('../../assets/images/swirl.png'),
  // blendiLogo: require('../../assets/images/blendi-logo.png'),
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