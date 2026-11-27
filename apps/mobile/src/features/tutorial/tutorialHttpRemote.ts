// CP-C2 — Cliente HTTP do tutorial (GET /tutorial, /tutorial/progress...).
import { tutorialProgressSchema, type TutorialProgress, type UpdateTutorialProgressInput } from '@blendi/shared';

import { api } from '../../config/api';
import type { TutorialContentRemote } from './tutorialApi';
import type { TutorialProgressRemote } from './tutorialProgressSync';

/** Roteiro não pode segurar a Home: depois disso, vale o que já tem no aparelho. */
const CONTENT_TIMEOUT_MS = 6_000;

function readProgress(body: unknown): TutorialProgress {
  const progress = (body as { data?: { progress?: unknown } } | undefined)?.data?.progress;
  const parsed = tutorialProgressSchema.safeParse(progress);
  if (!parsed.success) {
    throw new Error('tutorial/invalid-progress-response');
  }
  return parsed.data;
}

export const tutorialHttpRemote: TutorialProgressRemote & TutorialContentRemote = {
  fetchContent: async (etag) => {
    const response = await api.get<unknown>('/tutorial', {
      timeout: CONTENT_TIMEOUT_MS,
      headers: etag ? { 'If-None-Match': etag } : undefined,
      validateStatus: (status) => (status >= 200 && status < 300) || status === 304,
    });
    const headerEtag = response.headers?.etag as unknown;
    const nextEtag = typeof headerEtag === 'string' ? headerEtag : null;
    if (response.status === 304) {
      return { raw: null, etag: nextEtag ?? etag };
    }
    const content = (response.data as { data?: { content?: unknown } } | undefined)?.data?.content;
    return { raw: content ?? undefined, etag: nextEtag };
  },
  fetchProgress: async () => readProgress((await api.get<unknown>('/tutorial/progress')).data),
  patchProgress: async (input: UpdateTutorialProgressInput) =>
    readProgress((await api.patch<unknown>('/tutorial/progress', input)).data),
  resetProgress: async () => readProgress((await api.post<unknown>('/tutorial/progress/reset')).data),
};

