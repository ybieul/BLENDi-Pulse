// packages/shared/src/blenderLimits.ts
// Capacidade física de cada modelo BLENDi — fonte única para o backend
// (promptBuilder e validação das receitas da Pulse AI e do Pantry Scanner,
// via apps/api/src/config/pricing.config.ts) e para o app (filtro das
// receitas da Home, CP-1.1.9).
//
// Volume: a FONTE DA VERDADE é o ml — o volume máximo recomendado para bater,
// ou seja, a linha de MAX do copo (não a capacidade total), confirmado pelo
// Jon: Lite e Pro+ 400 ml, Steel 600 ml. O fl oz é só a forma de mostrar o
// mesmo limite a quem usa o sistema imperial: é derivado do ml e arredondado
// PARA BAIXO na 1ª casa decimal, para que o valor em oz, convertido de volta,
// nunca passe do limite em ml (Lite e Pro+ 13,5 oz ≈ 399,2 ml; Steel 20,2 oz
// ≈ 597,4 ml).
//
// Histórico: até o CP-1.1.9 os ml e os fl oz eram números soltos que não
// batiam (400 ml × 17,5 oz; 600 ml × 21 oz). Uma versão intermediária do
// CP-1.1.9 derivou os ml dos fl oz (518/621 ml) — corrigida pelo Jon.
//
// CP-B2: o VOLUME é o único limite físico. O teto de proteína por modelo
// (maxProteinGrams 35/45/55 g) saiu: foi criado por nós e não refletia o
// hardware (3 scoops de whey ≈ 70 g de proteína em ~90 g de pó + 300 ml de
// leite ≈ 390 ml cabem no Lite). Macros e calorias seguem o pedido da
// pessoa, desde que caibam no copo.

export type BlenderModel = 'Lite' | 'ProPlus' | 'Steel';

export interface BlenderLimit {
  maxVolumeMl: number;
  maxVolumeOz: number;
}

/** 1 fl oz americano em ml. */
export const ML_PER_US_FLUID_OUNCE = 29.5735;

const TENTHS = 10;

function blenderLimit(maxVolumeMl: number): BlenderLimit {
  return {
    maxVolumeMl,
    // Arredondado para baixo: maxVolumeOz × ML_PER_US_FLUID_OUNCE ≤ maxVolumeMl.
    maxVolumeOz: Math.floor((maxVolumeMl / ML_PER_US_FLUID_OUNCE) * TENTHS) / TENTHS,
  };
}

export const BLENDER_LIMITS: Readonly<Record<BlenderModel, BlenderLimit>> = {
  Lite: blenderLimit(400), // 13,5 oz
  ProPlus: blenderLimit(400), // 13,5 oz
  Steel: blenderLimit(600), // 20,2 oz
};
