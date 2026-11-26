// apps/mobile/src/navigation/tabBarMetrics.ts
// Medidas da barra de abas, separadas do AppNavigator para poderem ser
// testadas sem montar as telas.

import { spacing } from '@blendi/shared';

// ── Geometria da barra de abas (teste no build EAS 25-26/11) ──────────────────
// O @react-navigation/bottom-tabs põe cada ícone numa caixa de 28 pt de altura
// (ICON_SIZE_TALL do TabBarIcon, layout "uikit") e centraliza o conteúdo
// nela. O círculo do Blend (56 pt) vazava 14 pt para baixo — por cima do
// texto "Blend". Agora a caixa do ícone do Blend tem o tamanho do círculo,
// mas ocupa no layout os mesmos 28 pt dos outros ícones (margem negativa em
// cima): o círculo SOBE acima da barra e o rótulo fica no lugar de sempre,
// com um respiro de BLEND_LABEL_GAP.
// A altura também passou a somar a área segura inferior (antes: 88 fixo,
// que em iPhone com notch deixava os rótulos sobre o indicador de início).
export const LIBRARY_TAB_ICON_BOX_HEIGHT = 28;
export const BLEND_SHELL_SIZE = 52;
export const BLEND_LABEL_GAP = 4;
export const BLEND_ICON_SIZE = 26;
export const TAB_BAR_PADDING_TOP = spacing.sm;
export const TAB_ITEM_PADDING_VERTICAL = spacing.xs;
/** Conteúdo da barra acima da área segura: respiro + ícone (28) + rótulo + respiro. */
export const TAB_BAR_CONTENT_HEIGHT = 58;
/** Sem área segura inferior (iPhone sem notch, Android com botões): respiro mínimo. */
export const TAB_BAR_MIN_BOTTOM_PADDING = spacing.md;

export interface TabBarMetrics {
  height: number;
  paddingBottom: number;
  blendIconBox: { width: number; height: number; marginTop: number; marginBottom: number };
}

export function getTabBarMetrics(safeAreaBottom: number): TabBarMetrics {
  const paddingBottom = Math.max(safeAreaBottom, TAB_BAR_MIN_BOTTOM_PADDING);

  return {
    height: TAB_BAR_CONTENT_HEIGHT + paddingBottom,
    paddingBottom,
    blendIconBox: {
      width: BLEND_SHELL_SIZE,
      height: BLEND_SHELL_SIZE,
      // marginTop + height + marginBottom = 28: o rótulo não se mexe.
      marginTop: LIBRARY_TAB_ICON_BOX_HEIGHT - BLEND_SHELL_SIZE - BLEND_LABEL_GAP,
      marginBottom: BLEND_LABEL_GAP,
    },
  };
}

