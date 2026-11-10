// CP-1.1.1d: listas enviadas pelo usuário recusam o tamanho excessivo ANTES
// de validar item a item. Sem isso, um array de milhares de itens inválidos
// gerava um issue do Zod por item, e a resposta de erro ficava muito maior
// que o pedido (achado do CP-1.1.1a em dietaryPreferences).
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createFavoriteSchema,
  updateItemsSchema,
  updateSupplementStackSchema,
  updateUserSchema,
} from '@blendi/shared';
import type { ZodError, ZodTypeAny } from 'zod';

const OVERSIZED = 4000;

// Mesmo formato de `errors` que os controllers devolvem (formatZodErrors).
function errorResponseBody(error: ZodError): string {
  return JSON.stringify({
    success: false,
    code: 'validation/invalid-input',
    message: 'Validation failed.',
    errors: error.issues.map(issue => ({
      field: issue.path.join('.') || 'root',
      message: issue.message,
      ...(issue.code === 'too_big' && { maximum: (issue as { maximum?: number }).maximum }),
    })),
  });
}

function assertSmallError(schema: ZodTypeAny, body: unknown, expectedField: string) {
  const result = schema.safeParse(body);
  assert.equal(result.success, false);
  if (result.success) return;

  assert.equal(result.error.issues.length, 1, 'um único issue (o do teto), sem um por item');
  assert.equal(result.error.issues[0]?.code, 'too_big');
  assert.equal(result.error.issues[0]?.path.join('.') || 'root', expectedField);

  const responseSize = errorResponseBody(result.error).length;
  const requestSize = JSON.stringify(body).length;
  assert.ok(responseSize < 300, `resposta pequena (${responseSize} bytes)`);
  assert.ok(responseSize < requestSize, 'resposta menor que o pedido');
}

const validFavorite = {
  recipeName: 'Banana Oat',
  ingredients: [{ name: 'Banana', amount: '1' }],
  protein: 10,
  carbs: 40,
  fat: 5,
  calories: 245,
  prepTimeSeconds: 120,
  blendInstruction: 'Blend.',
  hasSubstitutes: false,
};

const invalidItems = (): unknown[] => Array.from({ length: OVERSIZED }, () => ({}));

describe('teto das listas antes dos itens — 4000 itens inválidos', () => {
  it('favoritos: ingredientes', () => {
    assertSmallError(
      createFavoriteSchema,
      { ...validFavorite, ingredients: invalidItems() },
      'ingredients'
    );
  });

  it('favoritos: passos', () => {
    assertSmallError(createFavoriteSchema, { ...validFavorite, steps: invalidItems() }, 'steps');
  });

  it('lista de compras: itens', () => {
    assertSmallError(updateItemsSchema, invalidItems(), 'root');
  });

  it('pilha de suplementos', () => {
    assertSmallError(updateSupplementStackSchema, invalidItems(), 'root');
  });

  it('dietaryPreferences (referência do CP-1.1.1a)', () => {
    const result = updateUserSchema.safeParse({
      dietaryPreferences: Array.from({ length: OVERSIZED }, () => 'invalid'),
    });
    assert.equal(result.success, false);
    if (result.success) return;
    assert.equal(result.error.issues.length, 1);
  });
});

describe('teto das listas — limites e itens ainda validados', () => {
  it('favoritos: 30 ingredientes e 20 passos passam; 31 e 21 não', () => {
    const ingredients = (n: number) => Array.from({ length: n }, () => ({ name: 'Oats', amount: '1' }));
    const steps = (n: number) => Array.from({ length: n }, () => ({ text: 'Blend.' }));

    assert.equal(
      createFavoriteSchema.safeParse({ ...validFavorite, ingredients: ingredients(30), steps: steps(20) })
        .success,
      true
    );
    assert.equal(createFavoriteSchema.safeParse({ ...validFavorite, ingredients: ingredients(31) }).success, false);
    assert.equal(createFavoriteSchema.safeParse({ ...validFavorite, steps: steps(21) }).success, false);
  });

  it('favoritos: lista vazia de ingredientes continua obrigatória', () => {
    const result = createFavoriteSchema.safeParse({ ...validFavorite, ingredients: [] });
    assert.equal(result.success, false);
  });

  it('dentro do teto, item inválido continua gerando issue com o caminho do item', () => {
    const result = createFavoriteSchema.safeParse({
      ...validFavorite,
      ingredients: [{ name: 'Banana', amount: '1' }, { name: '' }],
    });
    assert.equal(result.success, false);
    if (result.success) return;
    const fields = result.error.issues.map(issue => issue.path.join('.'));
    assert.ok(fields.includes('ingredients.1.name'));
    assert.ok(fields.includes('ingredients.1.amount'));
  });

  it('lista de compras: 100 itens passam (com defaults aplicados), 101 não', () => {
    const items = (n: number) => Array.from({ length: n }, () => ({ name: 'Milk' }));
    const ok = updateItemsSchema.safeParse(items(100));
    assert.equal(ok.success, true);
    if (ok.success) {
      assert.equal(ok.data[0]?.checked, false);
      assert.equal(ok.data[0]?.source, 'manual');
    }
    assert.equal(updateItemsSchema.safeParse(items(101)).success, false);
  });

  it('pilha de suplementos: 20 itens passam, 21 não; tipo errado continua recusado', () => {
    const items = (n: number) =>
      Array.from({ length: n }, () => ({ name: 'Creatine', dosage: '5 g', timing: 'morning' }));
    assert.equal(updateSupplementStackSchema.safeParse(items(20)).success, true);
    assert.equal(updateSupplementStackSchema.safeParse(items(21)).success, false);
    assert.equal(updateSupplementStackSchema.safeParse({ not: 'an array' }).success, false);
  });
});
