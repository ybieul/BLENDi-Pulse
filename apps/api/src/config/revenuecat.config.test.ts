// Testes da lógica de app_ids do RevenueCat (parsing da lista, legado, validação do evento
// e isConfigured). Rodar com: pnpm --filter @blendi/api test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isPaymentsConfigured,
  isRevenueCatAppIdAccepted,
  parseRevenueCatAppIds,
} from './revenuecat.config';

const IOS_APP_ID = 'app830800947f';
const ANDROID_APP_ID = 'app8f48e5c106';

describe('parseRevenueCatAppIds', () => {
  it('remove espacos e duplicatas, mantendo a ordem da primeira ocorrencia', () => {
    const ids = parseRevenueCatAppIds(` ${IOS_APP_ID} , ${ANDROID_APP_ID},${IOS_APP_ID} `);

    assert.deepEqual(ids, [IOS_APP_ID, ANDROID_APP_ID]);
  });

  it('ignora entradas vazias entre virgulas', () => {
    assert.deepEqual(parseRevenueCatAppIds(`,${IOS_APP_ID},, ,${ANDROID_APP_ID},`), [
      IOS_APP_ID,
      ANDROID_APP_ID,
    ]);
  });

  it('retorna lista vazia para undefined, string vazia ou so espacos', () => {
    assert.deepEqual(parseRevenueCatAppIds(undefined, undefined), []);
    assert.deepEqual(parseRevenueCatAppIds(''), []);
    assert.deepEqual(parseRevenueCatAppIds('   ', ' , '), []);
  });

  it('soma o valor legado (REVENUECAT_APP_ID) a lista de REVENUECAT_APP_IDS', () => {
    const ids = parseRevenueCatAppIds('appA,appB', 'legacyApp');

    assert.deepEqual(ids, ['appA', 'appB', 'legacyApp']);
  });

  it('nao duplica o legado quando ele ja esta na lista', () => {
    assert.deepEqual(parseRevenueCatAppIds('appA,appB', 'appB'), ['appA', 'appB']);
  });

  it('usa so o legado quando a lista nova nao esta definida', () => {
    assert.deepEqual(parseRevenueCatAppIds(undefined, 'legacyApp'), ['legacyApp']);
  });
});

describe('isRevenueCatAppIdAccepted', () => {
  const allowed = parseRevenueCatAppIds(`${IOS_APP_ID},${ANDROID_APP_ID}`);

  it('aceita o app_id de cada plataforma configurada', () => {
    assert.equal(isRevenueCatAppIdAccepted(IOS_APP_ID, allowed), true);
    assert.equal(isRevenueCatAppIdAccepted(ANDROID_APP_ID, allowed), true);
  });

  it('nao aceita app_id fora da lista, sem lancar erro', () => {
    assert.doesNotThrow(() => isRevenueCatAppIdAccepted('appDesconhecido', allowed));
    assert.equal(isRevenueCatAppIdAccepted('appDesconhecido', allowed), false);
  });

  it('nao aceita app_id quando a lista esta vazia', () => {
    assert.equal(isRevenueCatAppIdAccepted(IOS_APP_ID, []), false);
  });

  it('mantem o comportamento herdado: evento sem app_id nao e barrado por esta checagem', () => {
    assert.equal(isRevenueCatAppIdAccepted(undefined, allowed), true);
    assert.equal(isRevenueCatAppIdAccepted(null, allowed), true);
    assert.equal(isRevenueCatAppIdAccepted('', allowed), true);
  });

  it('diferencia maiusculas de minusculas (app_ids sao identificadores exatos)', () => {
    assert.equal(isRevenueCatAppIdAccepted(IOS_APP_ID.toUpperCase(), allowed), false);
  });
});

describe('isPaymentsConfigured', () => {
  const ids = [IOS_APP_ID, ANDROID_APP_ID];

  it('e true com API key, webhook secret e ao menos um app_id', () => {
    assert.equal(isPaymentsConfigured('key', 'secret', ids), true);
    assert.equal(isPaymentsConfigured('key', 'secret', [IOS_APP_ID]), true);
  });

  it('e false quando a lista de app_ids esta vazia', () => {
    assert.equal(isPaymentsConfigured('key', 'secret', parseRevenueCatAppIds('')), false);
  });

  it('e false quando falta API key ou webhook secret', () => {
    assert.equal(isPaymentsConfigured(undefined, 'secret', ids), false);
    assert.equal(isPaymentsConfigured('key', undefined, ids), false);
    assert.equal(isPaymentsConfigured('', 'secret', ids), false);
  });
});
