// Teste no build EAS (25-26/11): o círculo do botão Blend não pode cobrir o
// texto "Blend", e a barra soma a área segura inferior (com e sem notch).
import { spacing } from '@blendi/shared';

import {
  BLEND_LABEL_GAP,
  BLEND_SHELL_SIZE,
  getTabBarMetrics,
  LIBRARY_TAB_ICON_BOX_HEIGHT,
  TAB_BAR_CONTENT_HEIGHT,
  TAB_BAR_MIN_BOTTOM_PADDING,
} from './tabBarMetrics';

describe('getTabBarMetrics', () => {
  it('o ícone do Blend ocupa no layout os mesmos 28 pt dos outros: o rótulo não se mexe', () => {
    const { blendIconBox } = getTabBarMetrics(34);
    expect(blendIconBox.marginTop + blendIconBox.height + blendIconBox.marginBottom).toBe(LIBRARY_TAB_ICON_BOX_HEIGHT);
  });

  it('o círculo termina ACIMA do rótulo (com respiro) e sobe acima da caixa normal do ícone', () => {
    const { blendIconBox } = getTabBarMetrics(0);
    const circleTop = blendIconBox.marginTop;
    const circleBottom = circleTop + blendIconBox.height;

    expect(circleBottom).toBe(LIBRARY_TAB_ICON_BOX_HEIGHT - BLEND_LABEL_GAP);
    expect(circleBottom).toBeLessThan(LIBRARY_TAB_ICON_BOX_HEIGHT);
    expect(circleTop).toBeLessThan(0);
  });

  it('círculo com pelo menos 44 pt (área de toque); o item inteiro também é tocável', () => {
    expect(BLEND_SHELL_SIZE).toBeGreaterThanOrEqual(44);
    expect(TAB_BAR_CONTENT_HEIGHT).toBeGreaterThanOrEqual(44);
  });

  it('com notch: soma a área segura inferior (rótulos fora do indicador de início)', () => {
    expect(getTabBarMetrics(34)).toMatchObject({ height: TAB_BAR_CONTENT_HEIGHT + 34, paddingBottom: 34 });
  });

  it('sem notch (ou Android com botões): respiro mínimo', () => {
    expect(getTabBarMetrics(0)).toMatchObject({
      height: TAB_BAR_CONTENT_HEIGHT + TAB_BAR_MIN_BOTTOM_PADDING,
      paddingBottom: spacing.md,
    });
  });
});
