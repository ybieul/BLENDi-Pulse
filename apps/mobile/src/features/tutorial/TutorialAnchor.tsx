// CP-C2 — Marca um elemento da tela como âncora do tutorial. A tela só
// embrulha o elemento; nenhuma lógica do tutorial fica na tela.
//   <TutorialAnchor id="home.rings">...</TutorialAnchor>
// `collapsable={false}`: no Android, sem isso a View pode ser achatada e
// não ter medida própria.
import { useEffect, useRef, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import type { TutorialAnchorId } from './tutorialAnchors';
import { notifyTutorialAnchorLayout, registerTutorialAnchor } from './tutorialRegistry';

export interface TutorialAnchorProps {
  id: TutorialAnchorId;
  children: ReactNode;
  /** Estilo do invólucro (ex.: `flex: 1` quando o filho dependia do pai). */
  style?: StyleProp<ViewStyle>;
}

export function TutorialAnchor({ id, children, style }: TutorialAnchorProps) {
  const ref = useRef<View>(null);

  useEffect(() => registerTutorialAnchor(id, ref), [id]);

  return (
    <View
      ref={ref}
      collapsable={false}
      style={style}
      onLayout={() => {
        notifyTutorialAnchorLayout(id);
      }}
    >
      {children}
    </View>
  );
}
