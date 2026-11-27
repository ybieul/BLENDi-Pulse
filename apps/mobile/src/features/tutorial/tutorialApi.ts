// CP-C2 — Carga do roteiro com fallback (servidor → cache → cópia embutida).
// (O cliente HTTP real fica em tutorialHttpRemote.ts.)
import { TUTORIAL_CONTENT, parseTutorialContent, type TutorialContent } from '@blendi/shared';

import type { TutorialStorage } from './tutorialStorage';

export type TutorialContentSource = 'server' | 'cache' | 'embedded';

export interface TutorialContentFetchResult {
  /** null = 304 (o que está em cache continua valendo). */
  raw: unknown;
  etag: string | null;
}

export interface TutorialContentRemote {
  fetchContent: (etag: string | null) => Promise<TutorialContentFetchResult>;
}

/**
 * Servidor → último roteiro válido salvo no aparelho → cópia embutida.
 * Tudo validado pelo mesmo schema; nunca lança.
 */
export async function loadTutorialContent(
  remote: TutorialContentRemote,
  storage: TutorialStorage,
  embedded: unknown = TUTORIAL_CONTENT
): Promise<{ content: TutorialContent; source: TutorialContentSource } | null> {
  const cached = storage.loadCachedContent();
  const cachedContent = cached ? parseTutorialContent(cached.raw) : null;

  try {
    const result = await remote.fetchContent(cachedContent ? cached?.etag ?? null : null);
    if (result.raw === null && cachedContent) {
      return { content: cachedContent, source: 'cache' };
    }
    const serverContent = parseTutorialContent(result.raw);
    if (serverContent) {
      storage.saveCachedContent(result.raw, result.etag);
      return { content: serverContent, source: 'server' };
    }
  } catch {
    // Offline, timeout, 5xx: cai para o que tem no aparelho.
  }

  // Sem servidor: o mais novo entre o cache e a cópia embutida (depois de
  // atualizar o app, a cópia embutida pode ser mais nova que o cache).
  const embeddedContent = parseTutorialContent(embedded);
  if (cachedContent && (!embeddedContent || cachedContent.contentVersion >= embeddedContent.contentVersion)) {
    return { content: cachedContent, source: 'cache' };
  }
  return embeddedContent ? { content: embeddedContent, source: 'embedded' } : null;
}
