// apps/mobile/src/assets/images.d.ts
// Tipagem de imagens estáticas importadas via ES import (Metro/Expo resolve para o
// id numérico do asset). Sem isso, o import teria tipo `any` — como `require()`
// tinha antes — propagando "unsafe assignment" para todo uso de `images.*`.

declare module '*.png' {
  const source: number;
  export default source;
}
