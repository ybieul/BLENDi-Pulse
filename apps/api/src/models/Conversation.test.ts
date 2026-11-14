// CP-1.1.4a: o turno de prévia bloqueada só aceita a parte visível (nome +
// macros). Validação do schema real do Mongoose, sem banco (validateSync).
// Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import mongoose from 'mongoose';

import { LAST_RECIPE_NAME_MAX_LENGTH, toLastRecipeName } from '../utils/recipeName.utils';
import { ConversationModel } from './Conversation';

const FULL_RECIPE = {
  title: 'Berry Oat Smoothie',
  ingredients: [{ name: 'Frozen strawberries', amount: '150 g' }],
  macros: { protein: 10, carbs: 40, fat: 5, calories: 245 },
  prepTimeSeconds: 120,
  blendInstruction: 'Blend on high for 45 seconds.',
  hasSubstitutes: false,
};

const VISIBLE = { macros: FULL_RECIPE.macros };

function conversationWith(assistant: Record<string, unknown>) {
  return new ConversationModel({
    userId: new mongoose.Types.ObjectId(),
    messages: [
      { role: 'user', content: 'smoothie', timestamp: new Date() },
      { role: 'assistant', timestamp: new Date(), ...assistant },
    ],
  });
}

describe('Conversation — turno de prévia bloqueada', () => {
  it('aceita só nome e macros quando locked', () => {
    const doc = conversationWith({
      content: VISIBLE,
      locked: true,
      previewId: new mongoose.Types.ObjectId(),
      previewExpiresAt: new Date(),
    });

    assert.equal(doc.validateSync(), undefined);
  });

  it('rejeita receita completa num turno locked', () => {
    const doc = conversationWith({ content: FULL_RECIPE, locked: true, previewId: new mongoose.Types.ObjectId() });

    const error = doc.validateSync();
    assert.ok(error?.errors['messages.1.content']);
  });

  it('rejeita campo extra (ex.: tip) na parte visível', () => {
    const doc = conversationWith({ content: { ...VISIBLE, tip: 'add 10 g of chia' }, locked: true });

    assert.ok(doc.validateSync()?.errors['messages.1.content']);
  });

  it('rejeita o título na parte visível (o título também é escondido)', () => {
    const doc = conversationWith({ content: { ...VISIBLE, title: FULL_RECIPE.title }, locked: true });

    assert.ok(doc.validateSync()?.errors['messages.1.content']);
  });

  it('turno normal continua exigindo a receita completa', () => {
    assert.equal(conversationWith({ content: FULL_RECIPE }).validateSync(), undefined);
    assert.ok(conversationWith({ content: VISIBLE }).validateSync()?.errors['messages.1.content']);
  });
});

describe('Conversation — lastRecipeName', () => {
  it('título longo é cortado e passa na validação do schema', () => {
    const name = toLastRecipeName(`Smoothie ${'x'.repeat(200)}`);
    assert.equal(name.length, LAST_RECIPE_NAME_MAX_LENGTH);

    const doc = new ConversationModel({ userId: new mongoose.Types.ObjectId(), messages: [], lastRecipeName: name });
    assert.equal(doc.validateSync(), undefined);
  });

  it('título curto fica igual (só trim)', () => {
    assert.equal(toLastRecipeName('  Berry Oat Smoothie  '), 'Berry Oat Smoothie');
  });

  it('não deixa meio emoji no corte', () => {
    const name = toLastRecipeName(`${'a'.repeat(99)}🍓🍓`);
    assert.equal(name, 'a'.repeat(99));
  });
});
