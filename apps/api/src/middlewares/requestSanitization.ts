// apps/api/src/middlewares/requestSanitization.ts
// Dois middlewares que rodam logo depois do parsing do corpo, nesta ordem:
//   1. rejectDeeplyNestedBody — barra corpo aninhado demais (400);
//   2. sanitizeRequest — remove operadores MongoDB ($ne, $gt...) das entradas.
//
// Ficam num módulo próprio (sem importar env) para os testes montarem a mesma
// cadeia que o index.ts usa.

import type { NextFunction, Request, Response } from 'express';
import mongoSanitize from 'express-mongo-sanitize';

import { sendErrorResponse, VALIDATION_ERROR_CODE } from '../utils/error.utils';

/**
 * Profundidade máxima aceita no corpo da requisição (objeto ou array conta 1
 * nível; `{}` tem profundidade 1, `{"a":[{}]}` tem 3).
 *
 * Por que existe: `mongoSanitize.sanitize` percorre o corpo por recursão. Um
 * JSON com ~5.000 níveis (uns 10 KB, dentro do limite de 50 KB) estourava a
 * pilha e virava 500 em qualquer rota com corpo JSON.
 *
 * Por que 32: o corpo legítimo mais profundo da API tem 3 níveis (POST
 * /favorites e listas de compras: corpo → array → item). 32 dá mais de 10x de
 * folga e é o mesmo teto que o body-parser já aplica ao corpo urlencoded
 * (`depth: 32`). Muito abaixo de qualquer profundidade que ameace a pilha.
 */
export const MAX_REQUEST_BODY_DEPTH = 32;

export const BODY_TOO_DEEP_MESSAGE = 'Request body is nested too deeply.';

/**
 * true se `value` tem mais de `maxDepth` níveis de objeto/array.
 * Sem recursão: percorre com pilha explícita, então a checagem nunca estoura a
 * pilha, qualquer que seja a entrada. Para no primeiro nó que passa do limite,
 * e cada nó é visitado no máximo uma vez (o tamanho já é limitado pelo parser).
 */
export function exceedsMaxDepth(value: unknown, maxDepth: number): boolean {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const stack: Array<{ node: object; depth: number }> = [{ node: value, depth: 1 }];

  while (stack.length > 0) {
    const { node, depth } = stack.pop() as { node: object; depth: number };
    if (depth > maxDepth) {
      return true;
    }

    const children: unknown[] = Array.isArray(node) ? node : Object.values(node);
    for (const child of children) {
      if (child !== null && typeof child === 'object') {
        stack.push({ node: child, depth: depth + 1 });
      }
    }
  }

  return false;
}

/**
 * 400 para corpo com mais de MAX_REQUEST_BODY_DEPTH níveis, antes da
 * sanitização e das rotas. Vale para JSON (parser de 50 KB e de 4 MB) e para
 * urlencoded — os dois preenchem `req.body` antes deste ponto.
 *
 * Usa o code genérico de validação já existente: nenhum cliente legítimo chega
 * perto do limite, então não há texto específico a mostrar no app (o mobile já
 * traduz `validation/invalid-input`).
 */
export function rejectDeeplyNestedBody(req: Request, res: Response, next: NextFunction): void {
  if (exceedsMaxDepth(req.body, MAX_REQUEST_BODY_DEPTH)) {
    sendErrorResponse(res, {
      statusCode: 400,
      code: VALIDATION_ERROR_CODE,
      message: BODY_TOO_DEEP_MESSAGE,
    });
    return;
  }

  next();
}

/**
 * Sanitização contra injeção de operadores MongoDB ($ne, $gt, $where, etc.)
 * em req.body/req.params/req.headers/req.query — precisa vir depois do
 * parsing do body. Remoção completa de chaves com $ ou . (não substituição):
 * nenhum campo legítimo da API usa esses caracteres em nomes de chave.
 *
 * NÃO usamos app.use(mongoSanitize()) diretamente: a implementação da
 * biblioteca (v2.2.0) reatribui req[key] = target ao final de cada chave
 * sanitizada. No Express 5, req.query é um getter somente-leitura, e essa
 * reatribuição lança "TypeError: Cannot set property query of
 * #<IncomingMessage> which has only a getter" — derrubando toda requisição
 * com 500 (confirmado ao vivo: até GET /ping sem nenhum parâmetro quebrava).
 * A função sanitize() exportada já muta o objeto em memória (delete + nova
 * atribuição de chave) antes dessa reatribuição acontecer — chamá-la
 * diretamente, sem reatribuir req[key], preserva o mesmo efeito de
 * sanitização sem o crash.
 *
 * sanitize() é recursiva: só é segura porque rejectDeeplyNestedBody roda antes
 * (corpo limitado a MAX_REQUEST_BODY_DEPTH). params, headers e query são rasos
 * por construção (strings do router, headers do Node e o parser 'simple' de
 * query do Express 5, que não aninha).
 */
export function sanitizeRequest(req: Request, _res: Response, next: NextFunction): void {
  (['body', 'params', 'headers', 'query'] as const).forEach(key => {
    const target = req[key] as unknown;
    if (target && typeof target === 'object') {
      mongoSanitize.sanitize(target as Record<string, unknown>);
    }
  });
  next();
}
