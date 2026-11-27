// CP-L1 — O que vai para o log quando algo falha, sem dado da conta.
//
// Objetos de erro brutos carregam mais do que parece: o erro de validação
// do `jose` traz o `payload` do token (com e-mail), o MongoServerError de
// chave duplicada traz `keyValue` (userId, e-mail), o nodemailer traz o
// destinatário na mensagem e no `envelope`, erros de push trazem tokens.
// Regra: log de erro leva o nome e o código do erro, nunca o objeto inteiro,
// nunca userId, e-mail, nome ou token. A mensagem só entra quando quem chama
// sabe que ela é montada sem valores da conta (`includeMessage`).

export interface ErrorLogInfo {
  errorName: string;
  errorCode?: string | number;
  statusCode?: number;
  errorMessage?: string;
}

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// JWT (eyJ...) e tokens longos (push da Expo, refresh tokens, chaves).
const JWT_PATTERN = /\beyJ[\w-]+\.[\w-]+\.[\w-]*/g;
const EXPO_PUSH_TOKEN_PATTERN = /Expo(nent)?PushToken\[[^\]]+\]/g;
// Usuário e senha em URI de conexão (mongodb+srv://user:pass@host).
const URI_CREDENTIALS_PATTERN = /\/\/[^/\s:@]+:[^@\s/]+@/g;

/** Mascara credenciais de URI, e-mail, JWT e token de push num texto que vai para o log. */
export function redactForLog(text: string): string {
  return text
    .replace(URI_CREDENTIALS_PATTERN, '//[credentials]@')
    .replace(EMAIL_PATTERN, '[email]')
    .replace(JWT_PATTERN, '[token]')
    .replace(EXPO_PUSH_TOKEN_PATTERN, '[push-token]');
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function describeErrorForLog(err: unknown, options: { includeMessage?: boolean } = {}): ErrorLogInfo {
  if (!(err instanceof Error)) {
    return { errorName: typeof err === 'object' && err !== null ? 'NonErrorObject' : typeof err };
  }

  const record = err as Error & { code?: unknown; statusCode?: unknown; status?: unknown; responseCode?: unknown };
  const code = typeof record.code === 'string' || typeof record.code === 'number' ? record.code : undefined;
  const statusCode = readNumber(record.statusCode) ?? readNumber(record.status) ?? readNumber(record.responseCode);

  return {
    errorName: err.name,
    ...(code !== undefined && { errorCode: code }),
    ...(statusCode !== undefined && { statusCode }),
    ...(options.includeMessage && { errorMessage: redactForLog(err.message) }),
  };
}
