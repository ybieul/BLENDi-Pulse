// packages/shared/src/aiRequestBudget.ts
// Teto de tempo das rotas de IA — fonte única para o backend (orçamento por
// requisição, apps/api/src/services/aiRequestBudget.service.ts) e para o app
// (timeout do axios só nessas duas rotas; as outras continuam com 10 s).
//
// CP-B1: sem teto, o pior caso somava todas as chamadas em série (Pulse AI
// ~150 s; Pantry ~195 s com visão + geração + novas tentativas), e o app
// desistia em 10 s enquanto o servidor seguia, descontava uso/scan e dava XP.
// Agora o servidor corta cada requisição dentro do orçamento (503 com
// uso/scan devolvido) e o app espera o orçamento + uma folga.

/** Orçamento total de tempo de IA por requisição, no servidor. */
export const AI_REQUEST_BUDGET_MS = {
  pulseAiChat: 55_000,
  // CP-B5.4: o Pantry passou a ter duas etapas. A leitura é só a visão; a
  // geração herda o teto de antes (geração + novas tentativas).
  pantryScannerRead: 30_000,
  pantryScannerGenerate: 85_000,
} as const;

/**
 * Folga do app sobre o orçamento do servidor: rede, upload da foto (Pantry),
 * banco e XP depois da última chamada de IA.
 */
export const AI_CLIENT_TIMEOUT_MARGIN_MS = 15_000;

/** Timeout do app nas rotas de IA (orçamento do servidor + folga). */
export const AI_CLIENT_TIMEOUT_MS = {
  pulseAiChat: AI_REQUEST_BUDGET_MS.pulseAiChat + AI_CLIENT_TIMEOUT_MARGIN_MS,
  pantryScannerRead: AI_REQUEST_BUDGET_MS.pantryScannerRead + AI_CLIENT_TIMEOUT_MARGIN_MS,
  pantryScannerGenerate: AI_REQUEST_BUDGET_MS.pantryScannerGenerate + AI_CLIENT_TIMEOUT_MARGIN_MS,
} as const;
