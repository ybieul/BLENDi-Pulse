// apps/api/src/utils/userName.utils.ts
// Nome e sobrenome do usuário no backend (teste no build EAS 25-26/11).
//
// Regras (as de texto vêm de @blendi/shared/utils/personName):
//   • `name` é sempre composeFullName(firstName, lastName) — montado aqui,
//     nunca aceito do app como texto livre separado.
//   • Sem nome real (Apple/Google não mandaram), a conta nasce com o começo
//     do e-mail como nome e `nameNeedsConfirmation: true`; o app pede o nome
//     no onboarding e o PATCH /users/me com firstName tira a marca.
//   • Contas antigas (sem firstName/lastName/nameNeedsConfirmation): leitura
//     tolerante — nome/sobrenome derivados do `name`, e a marca deduzida por
//     looksLikeDerivedName. Nenhuma migração: os campos passam a existir no
//     documento na primeira edição de nome.
//
// Nome é dado pessoal: nada daqui vai para log nem analytics.

import {
  cleanPersonNamePart,
  composeFullName,
  FIRST_NAME_MAX_LENGTH,
  LAST_NAME_MAX_LENGTH,
  looksLikeDerivedName,
  resolvePersonNameParts,
} from '@blendi/shared';

export interface UserNameFields {
  name: string;
  firstName: string;
  lastName: string;
  nameNeedsConfirmation: boolean;
}

/** Literal de último recurso quando não há nome nem e-mail utilizável. */
const FALLBACK_FIRST_NAME = 'BLENDi';

function cut(value: string, maxLength: number): string {
  return cleanPersonNamePart(value).slice(0, maxLength).trim();
}

/** Começo do e-mail, limpo e no teto do nome (o que o login Apple já gravava). */
function deriveFirstNameFromEmail(email: string | null | undefined): string {
  const [localPart = ''] = (email ?? '').split('@');
  return cut(localPart, FIRST_NAME_MAX_LENGTH) || FALLBACK_FIRST_NAME;
}

/**
 * Campos de nome para gravar ao CRIAR uma conta (ou ao receber, num login
 * Apple, o nome real de uma conta "a confirmar"). Com nome real: marca false.
 * Sem: começo do e-mail + marca true (o sobrenome real, se veio, é mantido).
 */
export function buildAccountNameFields(input: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}): UserNameFields {
  const realFirstName = cut(input.firstName ?? '', FIRST_NAME_MAX_LENGTH);
  const realLastName = cut(input.lastName ?? '', LAST_NAME_MAX_LENGTH);

  if (realFirstName) {
    return {
      firstName: realFirstName,
      lastName: realLastName,
      name: composeFullName(realFirstName, realLastName),
      nameNeedsConfirmation: false,
    };
  }

  const derivedFirstName = deriveFirstNameFromEmail(input.email);
  return {
    firstName: derivedFirstName,
    lastName: realLastName,
    name: composeFullName(derivedFirstName, realLastName),
    nameNeedsConfirmation: true,
  };
}

/** Campos mínimos de um usuário (documento ou .lean()) para ler o nome. */
export interface UserNameSource {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  nameNeedsConfirmation?: boolean | null;
  email?: string | null;
}

/** A conta está com "nome a confirmar"? A marca gravada vence; sem ela, deduz. */
export function resolveNameNeedsConfirmation(user: UserNameSource): boolean {
  if (typeof user.nameNeedsConfirmation === 'boolean') {
    return user.nameNeedsConfirmation;
  }

  return looksLikeDerivedName(user.name, user.email);
}

/** Bloco de nome das respostas da API (GET /users/me, login, cadastro, PATCH). */
export function serializeUserName(user: UserNameSource) {
  const { firstName, lastName } = resolvePersonNameParts(user);

  return {
    name: user.name ?? composeFullName(firstName, lastName),
    firstName,
    lastName,
    nameNeedsConfirmation: resolveNameNeedsConfirmation(user),
  };
}

/**
 * $set do PATCH /users/me quando firstName e/ou lastName vêm no corpo
 * (valores já limpos pelo Zod). O que não veio sai do estado atual (leitura
 * tolerante). `name` é remontado; a marca só sai quando firstName vem.
 */
export function buildNameUpdate(
  current: UserNameSource,
  body: { firstName?: string; lastName?: string }
): Partial<UserNameFields> {
  const currentParts = resolvePersonNameParts(current);
  const firstName = body.firstName ?? currentParts.firstName;
  const lastName = body.lastName ?? currentParts.lastName;

  return {
    firstName,
    lastName,
    name: composeFullName(firstName, lastName),
    ...(body.firstName !== undefined && { nameNeedsConfirmation: false }),
  };
}
