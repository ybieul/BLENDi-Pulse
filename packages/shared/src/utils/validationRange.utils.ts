// packages/shared/src/utils/validationRange.utils.ts
// Helper para mensagens de erro Zod do tipo "número fora do intervalo aceito".
//
// A chave errors.validation.number_range precisa de {{min}} E {{max}} na mesma
// frase ("Insira um valor entre {{min}} e {{max}}."), mas um único ZodIssue de
// .min()/.max() só carrega o lado que efetivamente falhou (issue.minimum OU
// issue.maximum, nunca os dois). Por isso os dois limites são embutidos na
// própria mensagem como JSON — o wrapper translateKey() do mobile faz o parse
// antes de chamar t(). Ver comentário em cada schema que usa este helper.
export function rangeErrorMessage(min: number, max: number): string {
  return JSON.stringify({ key: 'errors.validation.number_range', min, max });
}
