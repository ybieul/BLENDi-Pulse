import PostHog from 'posthog-react-native';
import { getPostHogApiKey } from '../config/analytics.config';

let client: PostHog | null = null;

// O SDK espera valores JSON-serializáveis (JsonType) em vez de `unknown`; o tipo
// não é reexportado publicamente pelo pacote, então é extraído da própria assinatura
// de `capture` em vez de importado de um submódulo interno (@posthog/core).
type CaptureProperties = NonNullable<Parameters<PostHog['capture']>[1]>;

// Assinatura precisa retornar Promise para o chamador em App.tsx usar o mesmo padrão
// fire-and-forget (.catch()) de initializePurchases, mesmo não havendo trabalho
// assíncrono aqui.
// eslint-disable-next-line @typescript-eslint/require-await
export async function initializeAnalytics(): Promise<void> {
  // Guard: não inicializa duas vezes (mesmo padrão de setupAxiosInterceptors em auth.store.ts).
  if (client) return;

  const apiKey = getPostHogApiKey();
  if (!apiKey) return;

  client = new PostHog(apiKey);
}

export function identifyAnalyticsUser(userId: string): void {
  if (!client) return;

  try {
    client.identify(userId);
  } catch {
    // Melhor esforço: analytics não deve afetar o fluxo de autenticação.
  }
}

export function resetAnalyticsUser(): void {
  if (!client) return;

  try {
    client.reset();
  } catch {
    // Melhor esforço: analytics não deve afetar o fluxo de autenticação.
  }
}

export function trackEvent(eventName: string, properties?: Record<string, unknown>): void {
  if (!client) return;

  try {
    client.capture(eventName, properties as CaptureProperties);
  } catch {
    // Melhor esforço: analytics não deve afetar nenhum fluxo principal.
  }
}
