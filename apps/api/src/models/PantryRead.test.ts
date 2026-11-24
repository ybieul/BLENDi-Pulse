// CP-B7 — a leitura do Pantry Scanner some sozinha no vencimento (índice
// TTL em expiresAt) e o schema não tem onde guardar a imagem.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PANTRY_READ_TTL_MS, PantryReadModel } from './PantryRead';

describe('PantryRead (CP-B7)', () => {
  it('índice TTL em expiresAt (expireAfterSeconds 0) e validade de 30 min', () => {
    const ttl = PantryReadModel.schema.indexes().find(([fields]) => 'expiresAt' in fields);
    assert.ok(ttl);
    assert.equal(ttl[1].expireAfterSeconds, 0);
    assert.equal(PANTRY_READ_TTL_MS, 30 * 60 * 1000);
  });

  it('sem campo de imagem: só userId, ingredientes, hasLiquid, consumedAt e expiresAt', () => {
    const paths = Object.keys(PantryReadModel.schema.paths).filter(path => !path.startsWith('_'));
    assert.deepEqual(paths.sort(), ['consumedAt', 'createdAt', 'expiresAt', 'hasLiquid', 'ingredients', 'userId']);
    const doc = new PantryReadModel({ userId: '507f1f77bcf86cd799439011', ingredients: [], hasLiquid: false, expiresAt: new Date(), imageBase64: 'x' } as never);
    assert.equal((doc.toObject() as unknown as Record<string, unknown>).imageBase64, undefined);
  });

  it('CP-B7: blendSuitable por ingrediente, opcional (leitura antiga sem o campo continua válida)', () => {
    const ingredientSchema = PantryReadModel.schema.path('ingredients') as unknown as { schema: { path: (name: string) => { isRequired?: boolean; instance: string } | undefined } };
    const field = ingredientSchema.schema.path('blendSuitable');
    assert.ok(field);
    assert.equal(field.instance, 'Boolean');
    assert.notEqual(field.isRequired, true);
    const legacy = new PantryReadModel({
      userId: '507f1f77bcf86cd799439011',
      ingredients: [{ name: 'Banana', confidence: 'high', isAlcoholic: false }],
      hasLiquid: false,
      expiresAt: new Date(),
    });
    assert.equal(legacy.validateSync(), undefined);
  });
});
