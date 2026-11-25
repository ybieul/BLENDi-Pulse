// apps/mobile/src/utils/allergies.utils.ts
// CP-B6 — rótulos das alergias para as telas (cadastro, folha de
// confirmação, avisos do card, Pantry). A decisão de o que é alérgeno é
// sempre do backend (famílias em apps/api/src/utils/allergyFamilies.utils.ts);
// aqui só se escreve o texto. Alergia é dado de saúde: nada daqui vai para
// log nem analytics.

import {
  allergenSelectionSchema,
  normalizeUserAllergies,
  type AllergenSelection,
  type AllergyCode,
  type UserAllergies,
} from '@blendi/shared';
import type { TFunction } from 'i18next';

import type { TranslationKey } from '../locales/i18n';

/** Nome do botão (título): "Amendoim", "Trigo/glúten". */
export const ALLERGY_TITLE_KEYS: Readonly<Record<AllergyCode, TranslationKey>> = {
  peanut: 'allergies.codes.peanut',
  tree_nuts: 'allergies.codes.tree_nuts',
  milk: 'allergies.codes.milk',
  lactose: 'allergies.codes.lactose',
  soy: 'allergies.codes.soy',
  wheat_gluten: 'allergies.codes.wheat_gluten',
  sesame: 'allergies.codes.sesame',
  egg: 'allergies.codes.egg',
};

/** Nome no meio da frase: "amendoim", "trigo/glúten". */
const ALLERGY_SENTENCE_KEYS: Readonly<Record<AllergyCode, TranslationKey>> = {
  peanut: 'allergies.inSentence.peanut',
  tree_nuts: 'allergies.inSentence.tree_nuts',
  milk: 'allergies.inSentence.milk',
  lactose: 'allergies.inSentence.lactose',
  soy: 'allergies.inSentence.soy',
  wheat_gluten: 'allergies.inSentence.wheat_gluten',
  sesame: 'allergies.inSentence.sesame',
  egg: 'allergies.inSentence.egg',
};

type Translate = TFunction<'translation'>;

/** Rótulos no meio da frase: códigos traduzidos e itens livres como cadastrados. */
export function allergenSentenceLabels(selection: Partial<AllergenSelection> | null | undefined, t: Translate): string[] {
  return [
    ...(selection?.common ?? []).map(code => t(ALLERGY_SENTENCE_KEYS[code])),
    ...(selection?.custom ?? []),
  ];
}

/** "amendoim", "amendoim e leite", "amendoim, leite e ovo". */
export function joinAllergenLabels(labels: readonly string[], t: Translate): string {
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')}${t('allergies.listAnd')}${labels[labels.length - 1]}`;
}

/** Atalho: a seleção já escrita como lista na frase. */
export function formatAllergenList(selection: Partial<AllergenSelection> | null | undefined, t: Translate): string {
  return joinAllergenLabels(allergenSentenceLabels(selection, t), t);
}

/** Quantos itens de alergia a seleção tem. */
export function countAllergens(selection: Partial<AllergenSelection> | null | undefined): number {
  return (selection?.common?.length ?? 0) + (selection?.custom?.length ?? 0);
}

/** Alergias do perfil (conta antiga sem o campo = nenhuma). */
export function readProfileAllergies(source: { allergies?: Partial<UserAllergies> | null } | null | undefined): UserAllergies {
  return normalizeUserAllergies(source?.allergies);
}

/** Junta seleções sem repetir (para a confirmação acumulada do Pantry). */
export function addToSelection(base: AllergenSelection, extra: Partial<AllergenSelection> | null | undefined): AllergenSelection {
  return {
    common: [...base.common, ...(extra?.common ?? []).filter(code => !base.common.includes(code))],
    custom: [...base.custom, ...(extra?.custom ?? []).filter(item => !base.custom.includes(item))],
  };
}

/** CP-B6: alérgenos do 428 (Pulse AI e Pantry). Fora do formato ou vazio = nenhum. */
export function readAllergensFromErrorData(data: unknown): AllergenSelection | undefined {
  const allergens = (data as { allergens?: unknown } | null | undefined)?.allergens;
  const parsed = allergenSelectionSchema.safeParse(allergens);
  return parsed.success && (parsed.data.common.length > 0 || parsed.data.custom.length > 0) ? parsed.data : undefined;
}

export const EMPTY_ALLERGEN_SELECTION: AllergenSelection = { common: [], custom: [] };
