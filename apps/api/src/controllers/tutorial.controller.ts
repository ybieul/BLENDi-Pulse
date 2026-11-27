// CP-C2 — Tutorial guiado: roteiro (GET /tutorial) e progresso por conta.
// Logs: nunca o corpo nem o userId; só códigos de erro.
import type { NextFunction, Request, Response } from 'express';
import { updateTutorialProgressSchema } from '@blendi/shared';
import { TutorialProgressModel } from '../models/TutorialProgress';
import {
  buildTutorialProgressUpdate,
  getTutorialContent,
  matchesIfNoneMatch,
  serializeTutorialProgress,
  type TutorialProgressRecord,
} from '../services/tutorial.service';
import { sendErrorResponse, VALIDATION_ERROR_MESSAGE } from '../utils/error.utils';

/** Cache curto: roteiro muda só com deploy; 5 min evita refetch a cada abertura. */
const TUTORIAL_CACHE_CONTROL = 'private, max-age=300';

function sendUnauthorized(res: Response): void {
  sendErrorResponse(res, {
    statusCode: 401,
    code: 'auth/unauthorized',
    message: 'Unauthorized.',
  });
}

function sendContentUnavailable(res: Response): void {
  sendErrorResponse(res, {
    statusCode: 503,
    code: 'tutorial/unavailable',
    message: 'Tutorial content is unavailable.',
  });
}

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 11000;
}

/** GET /tutorial */
export function getTutorial(req: Request, res: Response): void {
  if (!req.user?.sub) {
    sendUnauthorized(res);
    return;
  }

  const loaded = getTutorialContent();
  if (!loaded) {
    sendContentUnavailable(res);
    return;
  }

  res.setHeader('ETag', loaded.etag);
  res.setHeader('Cache-Control', TUTORIAL_CACHE_CONTROL);

  if (matchesIfNoneMatch(req.headers['if-none-match'], loaded.etag)) {
    res.status(304).end();
    return;
  }

  res.status(200).json({
    success: true,
    data: { content: loaded.content },
  });
}

/** GET /tutorial/progress */
export async function getTutorialProgress(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    const record = await TutorialProgressModel.findOne({ userId }).lean<TutorialProgressRecord | null>();
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ success: true, data: { progress: serializeTutorialProgress(record) } });
  } catch (err) {
    next(err);
  }
}

/** PATCH /tutorial/progress */
export async function updateTutorialProgress(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    const parsed = updateTutorialProgressSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendErrorResponse(res, {
        statusCode: 400,
        code: 'tutorial/invalid-data',
        message: VALIDATION_ERROR_MESSAGE,
        errors: parsed.error.issues.map(issue => ({
          field: issue.path.join('.') || 'root',
          message: issue.message,
        })),
      });
      return;
    }

    const loaded = getTutorialContent();
    if (!loaded) {
      sendContentUnavailable(res);
      return;
    }

    const update = buildTutorialProgressUpdate(parsed.data, loaded, new Date());
    const write = () =>
      TutorialProgressModel.findOneAndUpdate({ userId }, update, {
        new: true,
        upsert: true,
        runValidators: true,
      }).lean<TutorialProgressRecord | null>();

    let record: TutorialProgressRecord | null;
    try {
      record = await write();
    } catch (err) {
      // Dois PATCH simultâneos do mesmo usuário sem documento ainda: o
      // segundo upsert bate no índice único. Repetir uma vez já encontra o
      // documento criado pelo primeiro.
      if (!isDuplicateKeyError(err)) throw err;
      record = await write();
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ success: true, data: { progress: serializeTutorialProgress(record) } });
  } catch (err) {
    next(err);
  }
}

/** POST /tutorial/progress/reset ("Ver tutorial de novo") */
export async function resetTutorialProgress(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    await TutorialProgressModel.deleteOne({ userId });
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ success: true, data: { progress: serializeTutorialProgress(null) } });
  } catch (err) {
    next(err);
  }
}
