// packages/shared/src/utils/textMatching.ts
// CP-B6 — normalização de texto ÚNICA para casar nomes de ingrediente
// (sem acento, minúsculas, pontuação vira espaço) e singular/plural em en e
// pt-BR. Antes vivia só no validador do backend
// (apps/api/src/utils/recipeRestrictions.utils.ts), que agora importa daqui:
// o app (Home: alergia do campo livre; cadastro: itens duplicados) usa as
// mesmas regras, sem uma segunda lógica.

/** Tira acentos (NFD + remoção das marcas combinantes). */
export function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '');
}

/** Sem acento, minúsculas, tudo que não é letra/número vira um espaço só. */
export function normalizeMatchText(value: string): string {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Tokens normalizados do texto (sem cortar em segmentos). */
export function matchTokens(value: string): string[] {
  const normalized = normalizeMatchText(value);
  return normalized ? normalized.split(' ') : [];
}

/**
 * Candidatos de singular de um token (en e pt). Inclui o próprio token.
 * nuts→nut, nozes→noz, amendoins→amendoim, açúcares→açúcar, berries→berry,
 * limões→limão. Tokens com menos de 4 letras ficam como estão.
 */
export function singularCandidates(token: string): string[] {
  const candidates = [token];

  if (token.length < 4) {
    return candidates;
  }

  const replaceSuffix = (suffix: string, replacement: string) => {
    if (token.endsWith(suffix)) {
      candidates.push(token.slice(0, -suffix.length) + replacement);
    }
  };

  replaceSuffix('s', '');
  replaceSuffix('es', '');
  replaceSuffix('ies', 'y');
  replaceSuffix('oes', 'ao');
  replaceSuffix('aes', 'ao');
  replaceSuffix('ais', 'al');
  replaceSuffix('eis', 'el');
  replaceSuffix('ois', 'ol');
  replaceSuffix('ns', 'm');

  return candidates;
}

/** O token do texto é o termo (no singular) ou um plural dele. */
export function tokenMatches(textToken: string, termToken: string): boolean {
  return textToken === termToken || singularCandidates(textToken).includes(termToken);
}

/** Dois tokens são a mesma palavra, em qualquer número ("kiwi" × "kiwis"). */
export function sameWord(a: string, b: string): boolean {
  return tokenMatches(a, b) || tokenMatches(b, a);
}

/** A frase (tokens) aparece inteira e em ordem nos tokens do texto, em qualquer número. */
export function containsWordPhrase(textTokens: readonly string[], phraseTokens: readonly string[]): boolean {
  if (phraseTokens.length === 0 || phraseTokens.length > textTokens.length) return false;

  for (let start = 0; start + phraseTokens.length <= textTokens.length; start += 1) {
    if (phraseTokens.every((token, offset) => sameWord(textTokens[start + offset], token))) {
      return true;
    }
  }

  return false;
}

// Caracteres de controle (\p{Cc}: NUL, quebra de linha, tab...) e de controle
// bidirecional (U+202A-202E, U+2066-2069 — o "RTL override" inverte a ordem
// visual do texto). ZWJ/ZWNJ ficam de fora de propósito: fazem parte de
// emojis compostos. Achado X01 do pentest do CP-1.1.1a.
export const UNSAFE_TEXT_CHARS_PATTERN = /[\p{Cc}‪-‮⁦-⁩]+/gu;

// Marcação: tags HTML/XML inteiras e qualquer sinal de tag que sobrar.
const MARKUP_TAG_PATTERN = /<[^>]*>/g;
const MARKUP_CHARS_PATTERN = /[<>]/g;

/**
 * CP-B6: texto livre de uma linha só, limpo para gravar e para entrar em
 * prompt como dado — sem caracteres de controle, sem marcação (tags e
 * sinais < >) e com espaços colapsados.
 */
export function sanitizeSingleLineText(value: string): string {
  return value
    .replace(UNSAFE_TEXT_CHARS_PATTERN, ' ')
    .replace(MARKUP_TAG_PATTERN, ' ')
    .replace(MARKUP_CHARS_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
