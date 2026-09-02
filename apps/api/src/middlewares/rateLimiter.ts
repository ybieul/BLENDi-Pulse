// apps/api/src/middlewares/rateLimiter.ts
// Rate limiting em três camadas — resolve os achados A3 (força bruta em
// /auth/login), A4 (criação de contas em massa em /auth/register) e A5
// (flood em endpoints autenticados) do diagnóstico de segurança de
// 2026-09-02, que confirmou via teste ativo zero proteção em todos os três
// pontos (20 tentativas de login sem bloqueio, 15 registros sem detecção,
// 50 chamadas a um endpoint autenticado sem limitação).

import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import type { Request, Response } from 'express';
import { sendErrorResponse } from '../utils/error.utils';
import { verifyAccessToken } from '../services/auth.service';

const MINUTE_MS = 60 * 1000;

/**
 * Extrai o userId (sub) do access token, se presente e válido.
 *
 * O terceiro limitador é registrado globalmente em index.ts, ANTES dos
 * routers onde o middleware `authenticate` roda (ele é aplicado por rota
 * dentro de cada router, não globalmente) — então `req.user` ainda não
 * está populado neste ponto da cadeia. Decodificamos o token diretamente
 * aqui só para fins de agrupamento da cota por usuário; isso não substitui
 * nem duplica a validação de autenticação real — um token inválido/expirado
 * aqui apenas faz a chave cair no fallback por IP, e a requisição segue
 * normalmente até o `authenticate` de verdade, que é quem decide 401.
 */
function extractUserId(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return undefined;
  }

  try {
    return verifyAccessToken(authHeader.slice(7)).sub;
  } catch {
    return undefined;
  }
}

function rateLimitHandler(code: string, message: string) {
  return (_req: Request, res: Response): void => {
    sendErrorResponse(res, {
      statusCode: 429,
      code,
      message,
    });
  };
}

/**
 * Limitador de força bruta no login.
 * 10 requisições por 15 minutos, chave = IP + e-mail (quando presente no
 * body) — combinar os dois evita que um atacante rotacionando o e-mail
 * alvo escape do limite de um único IP, e evita que múltiplos usuários
 * atrás do mesmo IP (NAT, rede corporativa) se bloqueiem mutuamente.
 * `ipKeyGenerator` normaliza o IP (essencial para IPv6 — concatenar o
 * endereço bruto permitiria bypass via variações de representação).
 * `skipSuccessfulRequests: true` — login correto não consome a cota, só
 * tentativas malsucedidas contam para o limite.
 */
export const authLoginLimiter = rateLimit({
  windowMs: 15 * MINUTE_MS,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req: Request): string => {
    const ip = ipKeyGenerator(req.ip ?? '');
    const email =
      typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : undefined;
    return email ? `${ip}:${email}` : ip;
  },
  handler: rateLimitHandler(
    'auth/too-many-requests',
    'Too many login attempts. Please try again later.'
  ),
});

/**
 * Limitador de criação de contas.
 * 5 requisições por 60 minutos, apenas por IP — no registro o e-mail é
 * justamente o que o atacante varia a cada tentativa, então não serve como
 * parte da chave (ao contrário do login, onde o e-mail alvo é fixo).
 */
export const authRegisterLimiter = rateLimit({
  windowMs: 60 * MINUTE_MS,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => ipKeyGenerator(req.ip ?? ''),
  handler: rateLimitHandler(
    'auth/too-many-registrations',
    'Too many accounts created recently. Please try again later.'
  ),
});

/**
 * Limitador global para requisições autenticadas.
 * 120 requisições por minuto (2 req/s) por usuário — chave é o `sub` do
 * access token (ver `extractUserId` acima), com fallback para IP
 * normalizado quando não há token válido. Registrado globalmente em
 * index.ts, mas com `skip` para /auth/*, /webhooks/* e /ping — as rotas
 * públicas têm seus próprios limitadores (ou nenhum, no caso de /ping) e
 * não devem ser contadas aqui.
 */
export const authenticatedLimiter = rateLimit({
  windowMs: MINUTE_MS,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request): boolean =>
    req.path.startsWith('/auth') || req.path.startsWith('/webhooks') || req.path === '/ping',
  keyGenerator: (req: Request): string => extractUserId(req) ?? ipKeyGenerator(req.ip ?? ''),
  handler: rateLimitHandler('auth/too-many-requests', 'Too many requests. Please slow down.'),
});
