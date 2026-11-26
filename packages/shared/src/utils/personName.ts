// packages/shared/src/utils/personName.ts
// Nome e sobrenome do usuário (teste no build EAS de 25-26/11).
//
// Fonte única das regras usadas pelo backend (Zod das rotas, criação de conta
// por e-mail/Apple/Google, PATCH /users/me) e pelo app (onboarding, perfil,
// saudação da Home):
//
//   • Limpeza: a mesma do texto livre de uma linha (sanitizeSingleLineText):
//     sem caracteres de controle/bidi, sem marcação < >, espaços colapsados.
//     Acento, apóstrofo e hífen ficam ("D'Ávila", "Ana-Clara").
//   • `name` continua existindo (e-mails, compartilhamento, foto sem imagem)
//     e é SEMPRE "firstName lastName" (ou só firstName) — montado pelo
//     backend com composeFullName, nunca enviado pelo app.
//   • Contas anteriores a firstName/lastName: leitura tolerante — splitFullName
//     deriva os dois do `name` gravado, sem migração.

import { z } from 'zod';

import { sanitizeSingleLineText } from './textMatching';

export const FIRST_NAME_MAX_LENGTH = 50;
export const LAST_NAME_MAX_LENGTH = 50;

/** Limpa uma parte do nome (mesma regra do texto livre de uma linha). */
export function cleanPersonNamePart(value: string): string {
  return sanitizeSingleLineText(value);
}

/** Nome (obrigatório): limpo, 1 a FIRST_NAME_MAX_LENGTH caracteres. */
export const firstNameSchema = z
  .string({
    required_error: 'errors.validation.required',
    invalid_type_error: 'errors.validation.invalid_option',
  })
  .transform(cleanPersonNamePart)
  .pipe(
    z
      .string()
      .min(1, 'errors.validation.required')
      .max(FIRST_NAME_MAX_LENGTH, 'errors.validation.too_long')
  );

/** Sobrenome (opcional): limpo, até LAST_NAME_MAX_LENGTH. Vazio = sem sobrenome. */
export const lastNameSchema = z
  .string({
    required_error: 'errors.validation.required',
    invalid_type_error: 'errors.validation.invalid_option',
  })
  .transform(cleanPersonNamePart)
  .pipe(z.string().max(LAST_NAME_MAX_LENGTH, 'errors.validation.too_long'));

/** "firstName lastName", ou só firstName quando não há sobrenome. */
export function composeFullName(firstName: string, lastName?: string | null): string {
  return [firstName, lastName ?? '']
    .map(cleanPersonNamePart)
    .filter(part => part.length > 0)
    .join(' ');
}

export interface PersonNameParts {
  firstName: string;
  lastName: string;
}

/**
 * Leitura tolerante de um nome completo antigo: primeira palavra = nome, o
 * resto = sobrenome. Cortado nos limites (um `name` antigo não tinha teto).
 */
export function splitFullName(fullName: string | null | undefined): PersonNameParts {
  const cleaned = cleanPersonNamePart(fullName ?? '');
  if (!cleaned) {
    return { firstName: '', lastName: '' };
  }

  const [first = '', ...rest] = cleaned.split(' ');
  return {
    firstName: first.slice(0, FIRST_NAME_MAX_LENGTH),
    lastName: rest.join(' ').slice(0, LAST_NAME_MAX_LENGTH).trim(),
  };
}

/** Usuário como o app/backend o têm: os campos novos podem faltar (conta antiga). */
export interface PersonNameSource {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

/** Nome e sobrenome efetivos: os campos gravados ou, sem eles, derivados do `name`. */
export function resolvePersonNameParts(user: PersonNameSource): PersonNameParts {
  const storedFirstName = cleanPersonNamePart(user.firstName ?? '');
  if (storedFirstName) {
    return { firstName: storedFirstName, lastName: cleanPersonNamePart(user.lastName ?? '') };
  }

  return splitFullName(user.name);
}

/** Primeiro nome para espaços curtos (saudação da Home). */
export function getDisplayFirstName(user: PersonNameSource): string {
  return resolvePersonNameParts(user).firstName;
}

/** Parte local do e-mail ("biel782003" de "biel782003@…"), em minúsculas. */
function emailLocalPart(email: string | null | undefined): string {
  return (email ?? '').split('@')[0]?.trim().toLowerCase() ?? '';
}

/**
 * Conta antiga sem a marca `nameNeedsConfirmation`: o nome é "a confirmar" se
 * for só o começo do e-mail (o que o login Apple gravava sem o nome real) ou
 * o literal de fallback 'Apple User'. Usado só quando a marca não existe.
 */
export function looksLikeDerivedName(name: string | null | undefined, email: string | null | undefined): boolean {
  const cleaned = cleanPersonNamePart(name ?? '').toLowerCase();
  if (!cleaned) {
    return true;
  }

  const local = emailLocalPart(email);
  return cleaned === 'apple user' || (local.length > 0 && cleaned === local);
}
