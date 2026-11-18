// CP-B5 — a regra de manter o pedido na nova tentativa por volume é só do
// Pulse AI (opção); o Pantry Scanner continua com a mensagem de antes.
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BLENDER_LIMIT_RETRY_KEEP_REQUEST_RULE,
  buildBlenderLimitRetryMessage,
  validateBlenderLimits,
} from './blenderGuardrail.utils';

const over = validateBlenderLimits(
  {
    ingredients: [{ name: 'Leite', amount: '500 ml' }],
  } as Parameters<typeof validateBlenderLimits>[0],
  'Lite'
);

describe('CP-B5 — buildBlenderLimitRetryMessage', () => {
  it('sem a opção (Pantry) não muda; com a opção (Pulse AI) acrescenta a regra', () => {
    assert.equal(over.withinLimits, false);
    if (over.withinLimits) return;
    const pantry = buildBlenderLimitRetryMessage(over.violation);
    const chat = buildBlenderLimitRetryMessage(over.violation, undefined, { keepExplicitRequest: true });
    assert.ok(!pantry.includes(BLENDER_LIMIT_RETRY_KEEP_REQUEST_RULE));
    assert.ok(chat.includes(BLENDER_LIMIT_RETRY_KEEP_REQUEST_RULE));
    assert.equal(chat.replace(` ${BLENDER_LIMIT_RETRY_KEEP_REQUEST_RULE}`, ''), pantry);
  });
});
