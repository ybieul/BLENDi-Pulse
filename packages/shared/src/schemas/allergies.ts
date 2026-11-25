// packages/shared/src/schemas/allergies.ts
// CP-B6 — alergias do usuário: constante única dos códigos, limites do campo
// livre, schema do cadastro e da confirmação por pedido, e as funções de
// comparação usadas pelo app (sempre com a normalização de
// utils/textMatching.ts).
//
// Alergia é dado de saúde: nunca vai para log, evento de analytics nem para
// a IA fora da seção de alergias do prompt (como dado, entre aspas).
//
// ⚠️ Mensagens de erro são CHAVES de i18n — nunca texto traduzido.

import { z } from 'zod';

import { matchTokens, sameWord, sanitizeSingleLineText, containsWordPhrase } from '../utils/textMatching';

/**
 * Os 8 botões prontos (decisão do Gabriel, 24/11). Ordem de exibição.
 * Coco NÃO entra em tree_nuts; aveia NÃO é bloqueada por wheat_gluten.
 */
export const ALLERGY_CODE_VALUES = [
  'peanut',
  'tree_nuts',
  'milk',
  'lactose',
  'soy',
  'wheat_gluten',
  'sesame',
  'egg',
] as const;
export type AllergyCode = (typeof ALLERGY_CODE_VALUES)[number];

/** Campo livre: até 10 itens de até 40 caracteres. */
export const ALLERGY_CUSTOM_MAX_ITEMS = 10;
export const ALLERGY_CUSTOM_ITEM_MAX_LENGTH = 40;

export interface UserAllergies {
  common: AllergyCode[];
  custom: string[];
}

export const EMPTY_USER_ALLERGIES: Readonly<UserAllergies> = Object.freeze({ common: [], custom: [] });

/** Mesmo item do campo livre (pela normalização: acento, caixa, plural). */
export function isSameAllergyItem(a: string, b: string): boolean {
  const left = matchTokens(a);
  const right = matchTokens(b);
  return left.length > 0 && left.length === right.length && left.every((token, index) => sameWord(token, right[index]));
}

/** Itens do campo livre sem repetição (mantém a primeira ocorrência). */
export function dedupeAllergyItems(items: readonly string[]): string[] {
  const kept: string[] = [];
  for (const item of items) {
    if (!kept.some(existing => isSameAllergyItem(existing, item))) kept.push(item);
  }
  return kept;
}

/** Tem alguma alergia cadastrada. */
export function hasAllergies(allergies: Partial<UserAllergies> | null | undefined): boolean {
  return (allergies?.common?.length ?? 0) > 0 || (allergies?.custom?.length ?? 0) > 0;
}

/** Lê o campo como veio da API (conta antiga sem o campo = sem alergia). */
export function normalizeUserAllergies(allergies: Partial<UserAllergies> | null | undefined): UserAllergies {
  const common = ALLERGY_CODE_VALUES.filter(code => allergies?.common?.includes(code));
  const custom = dedupeAllergyItems((allergies?.custom ?? []).filter(item => typeof item === 'string' && item.trim() !== ''));
  return { common, custom };
}

/**
 * Algum dos nomes cita o item do campo livre (palavra inteira, em qualquer
 * número: "kiwi" pega "Kiwi" e "2 kiwis", mas não "kiwiberry"). Usado pela
 * Home com os nomes dos ingredientes em en e pt-BR.
 */
export function namesMentionAllergyItem(names: readonly string[], item: string): boolean {
  const itemTokens = matchTokens(item);
  return names.some(name => containsWordPhrase(matchTokens(name), itemTokens));
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const allergyCustomItemSchema = z
  .string({ required_error: 'errors.validation.required', invalid_type_error: 'errors.validation.invalid_option' })
  .transform(sanitizeSingleLineText)
  .pipe(
    z
      .string()
      .min(1, 'errors.validation.required')
      .max(ALLERGY_CUSTOM_ITEM_MAX_LENGTH, 'errors.validation.too_long')
  );

/**
 * Cadastro (PATCH /users/me, campo `allergies`, substitui a lista inteira).
 * Estrito. Duplicados (pela normalização) são removidos mantendo o primeiro.
 * O teto de itens é conferido ANTES da validação item a item (achado D03 do
 * CP-1.1.1a: sem ele, milhares de itens inválidos geravam milhares de erros).
 */
export const userAllergiesSchema = z
  .object({
    common: z
      .array(z.unknown(), { required_error: 'errors.validation.required', invalid_type_error: 'errors.validation.invalid_option' })
      .max(ALLERGY_CODE_VALUES.length * 2, 'errors.validation.invalid_option')
      .pipe(
        z
          .array(z.enum(ALLERGY_CODE_VALUES, { message: 'errors.validation.invalid_option' }))
          .transform(values => ALLERGY_CODE_VALUES.filter(code => values.includes(code)))
      ),
    custom: z
      .array(z.unknown(), { required_error: 'errors.validation.required', invalid_type_error: 'errors.validation.invalid_option' })
      .max(ALLERGY_CUSTOM_MAX_ITEMS, 'errors.validation.too_long')
      .pipe(z.array(allergyCustomItemSchema).transform(dedupeAllergyItems)),
  })
  .strict();

export type UserAllergiesInput = z.input<typeof userAllergiesSchema>;

/**
 * CP-B6: alérgenos confirmados (ou recusados) para UMA requisição — nunca
 * gravados. O backend só aceita o que a mensagem/o pedido cita e a pessoa
 * tem cadastrado; o resto é ignorado.
 */
export const allergenSelectionSchema = z
  .object({
    common: z.array(z.enum(ALLERGY_CODE_VALUES)).max(ALLERGY_CODE_VALUES.length).default([]),
    custom: z
      .array(z.string().trim().min(1).max(ALLERGY_CUSTOM_ITEM_MAX_LENGTH))
      .max(ALLERGY_CUSTOM_MAX_ITEMS)
      .default([]),
  })
  .strict();

export type AllergenSelection = z.output<typeof allergenSelectionSchema>;
export type AllergenSelectionInput = z.input<typeof allergenSelectionSchema>;

/** Seleção sem nenhum item. */
export function isEmptyAllergenSelection(selection: Partial<AllergenSelection> | null | undefined): boolean {
  return (selection?.common?.length ?? 0) === 0 && (selection?.custom?.length ?? 0) === 0;
}

/** Junta duas seleções sem repetir (ordem: códigos na ordem fixa; itens livres na ordem de chegada). */
export function mergeAllergenSelections(...selections: ReadonlyArray<Partial<AllergenSelection> | null | undefined>): AllergenSelection {
  const common = ALLERGY_CODE_VALUES.filter(code => selections.some(selection => selection?.common?.includes(code)));
  const custom = dedupeAllergyItems(selections.flatMap(selection => selection?.custom ?? []));
  return { common, custom };
}

/** Códigos de erro (Pulse AI e Pantry). O app mostra a folha de confirmação. */
export const PULSE_AI_ALLERGY_CONFIRMATION_REQUIRED_CODE = 'pulseai/allergy-confirmation-required';
export const PANTRY_ALLERGY_CONFIRMATION_REQUIRED_CODE = 'scanner/allergy-confirmation-required';
