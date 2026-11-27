// CP-C2 — "Reduzir movimento" do sistema (iOS e Android). Com ele ligado, o
// recorte e o balão trocam sem animação.
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReduceMotion(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setEnabled(value);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      setEnabled(value);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return enabled;
}
