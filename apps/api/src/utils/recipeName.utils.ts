// apps/api/src/utils/recipeName.utils.ts
// Fora do model para que testes que mockam ../models/Conversation continuem
// recebendo o helper real.

/** Tamanho máximo do resumo da conversa (nome da última receita). */
export const LAST_RECIPE_NAME_MAX_LENGTH = 100;

/**
 * Nome da receita cortado para caber em lastRecipeName. O título vem da IA e
 * pode passar do limite; sem o corte o update falhava na validação e a
 * resposta virava 500 (achado do pentest do CP-1.1.4a). Só o resumo é cortado:
 * a receita continua inteira no turno.
 */
export function toLastRecipeName(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length <= LAST_RECIPE_NAME_MAX_LENGTH) {
    return trimmed;
  }

  const cut = trimmed.slice(0, LAST_RECIPE_NAME_MAX_LENGTH);
  // Não deixa meio par surrogate (emoji) no fim.
  const lastCode = cut.charCodeAt(cut.length - 1);
  return (lastCode >= 0xd800 && lastCode <= 0xdbff ? cut.slice(0, -1) : cut).trim();
}
