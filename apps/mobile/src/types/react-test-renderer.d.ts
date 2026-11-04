// apps/mobile/src/types/react-test-renderer.d.ts
// react-test-renderer não publica tipos próprios nem tem @types/react-test-renderer
// resolvível nesta versão (19.1.0) — sem isso, o import seria `any`, propagando
// "unsafe" por todo teste que o usa (useAppleAuth.test.tsx). Cobre só o que é
// usado nos testes: act() e create().

declare module 'react-test-renderer' {
  import type { ReactElement } from 'react';

  export interface TestRenderer {
    unmount(): void;
  }

  export function act(callback: () => void | Promise<void>): Promise<void>;
  export function create(element: ReactElement): TestRenderer;
}
