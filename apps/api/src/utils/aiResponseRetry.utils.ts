// Nova tentativa quando a IA responde algo que não é JSON válido ou não bate
// com o schema da receita. Mesmo padrão nos dois recursos (CP-B1): repete a
// conversa original com esta instrução como próximo turno do usuário, uma vez.
// - Pulse AI (pulseAi.controller.ts): se continuar inválida, 500
//   pulseai/invalid-ai-response (como antes).
// - Pantry (pantryScanner.controller.ts): se continuar inválida, responde como
//   IA indisponível (503 scanner/vision-unavailable, scan devolvido).
export const INVALID_JSON_RETRY_INSTRUCTION =
  'Your previous response had an invalid format. Return only valid JSON.';
