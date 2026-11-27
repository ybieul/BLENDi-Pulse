import { AsyncLocalStorage } from 'node:async_hooks';

// CP-B1: orçamento total de tempo de IA por requisição (Pulse AI chat e, desde
// o CP-B7, Pantry read e generate). O controller abre o orçamento uma vez (runWithAiRequestBudget) e
// cada chamada ao provedor (aiProvider.service.ts) lê o tempo restante daqui:
// o timeout da chamada vira min(timeout da chamada, tempo restante), e sem
// tempo suficiente a chamada nem começa (falha como provedor indisponível —
// o controller responde 503 e devolve uso/scan pelos caminhos que já existem).
//
// AsyncLocalStorage em vez de passar o prazo por parâmetro: as novas
// tentativas (limite, macros, dieta, JSON inválido) ficam em várias funções e
// rodam em paralelo no Pantry (Promise.all mantém o contexto). Fora de um
// orçamento (ex.: scripts, outras rotas), getAiRequestRemainingMs devolve null
// e nada muda.

interface AiRequestBudgetStore {
  deadline: number;
}

const aiRequestBudgetStorage = new AsyncLocalStorage<AiRequestBudgetStore>();

/**
 * CP-L1: relógio do orçamento, trocável nos testes (o mesmo relógio falso do
 * aiProvider). Antes o prazo era gravado com Date.now() real e o teste só
 * alinhava o relógio falso depois: sob carga sobrava 1 ms e o teste na borda
 * da janela falhava às vezes.
 */
export const aiRequestBudgetClock = {
  now: (): number => Date.now(),
};

export function runWithAiRequestBudget<T>(budgetMs: number, operation: () => Promise<T>): Promise<T> {
  return aiRequestBudgetStorage.run({ deadline: aiRequestBudgetClock.now() + budgetMs }, operation);
}

/** Tempo restante do orçamento da requisição atual; null fora de um orçamento. */
export function getAiRequestRemainingMs(now = aiRequestBudgetClock.now()): number | null {
  const store = aiRequestBudgetStorage.getStore();

  if (!store) {
    return null;
  }

  return Math.max(0, store.deadline - now);
}
