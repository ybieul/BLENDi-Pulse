import { darkColors, lightColors, type Colors } from '@blendi/shared';

import { useThemeStore } from '../store/theme.store';

/**
 * Paleta de cores reativa ao tema. Uso: troque
 *   import { colors } from '@blendi/shared';
 * por
 *   import { useColors } from '<relativo até>/hooks/useColors';
 * e declare `const colors = useColors();` no topo do corpo do componente —
 * o identificador `colors` sombreia o import estático só ali dentro, então
 * nenhum uso `colors.x.y[z]` precisa mudar, só a declaração.
 */
export function useColors(): Colors {
  const mode = useThemeStore((state) => state.mode);
  return mode === 'dark' ? darkColors : lightColors;
}
