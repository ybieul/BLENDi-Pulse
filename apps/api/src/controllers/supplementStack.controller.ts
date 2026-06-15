import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { XP_EVENTS, updateSupplementStackSchema } from '@blendi/shared';
import { SupplementLogModel, type ISupplementLog } from '../models/SupplementLog';
import { XPLogModel } from '../models/XPLog';
import { UserModel, type IUserSupplement } from '../models/User';
import { awardXP } from '../services/xp.service';
import {
  getSupplementConsumedCount,
  getSupplementDailyTargetCount,
} from '../utils/supplementProgress.utils';
import {
  sendErrorResponse,
  VALIDATION_ERROR_CODE,
  VALIDATION_ERROR_MESSAGE,
} from '../utils/error.utils';
import { getMidnightUTC, toLocalDate } from '../utils/timezone.utils';

interface SupplementStackContext {
  timezone: string;
  supplementStack: IUserSupplement[];
}

type SupplementLogRecord = ISupplementLog & {
  _id: unknown;
};

function sendUnauthorized(res: Response): void {
  sendErrorResponse(res, {
    statusCode: 401,
    code: 'auth/unauthorized',
    message: 'Unauthorized.',
  });
}

function sendUserNotFound(res: Response): void {
  sendErrorResponse(res, {
    statusCode: 404,
    code: 'resource/not-found',
    message: 'User not found.',
  });
}

function sendSupplementNotFound(res: Response): void {
  sendErrorResponse(res, {
    statusCode: 404,
    code: 'supplement/not-found',
    message: 'Supplement not found.',
  });
}

function sendSupplementLogNotFound(res: Response): void {
  sendErrorResponse(res, {
    statusCode: 404,
    code: 'supplement-log/not-found',
    message: 'Supplement log not found.',
  });
}

function formatZodErrors(err: ZodError) {
  return err.issues.map(issue => ({
    field: issue.path.join('.') || 'root',
    message: issue.message,
    ...(issue.code === 'too_small' && { minimum: (issue as { minimum?: number }).minimum }),
    ...(issue.code === 'too_big' && { maximum: (issue as { maximum?: number }).maximum }),
  }));
}

function sendValidationError(res: Response, err: ZodError): void {
  sendErrorResponse(res, {
    statusCode: 400,
    code: VALIDATION_ERROR_CODE,
    message: VALIDATION_ERROR_MESSAGE,
    errors: formatZodErrors(err),
  });
}

function isDuplicateKeyError(err: unknown): err is { code: number } {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 11000;
}

function sortByOrder(stack: IUserSupplement[]): IUserSupplement[] {
  return [...stack].sort((left, right) => left.order - right.order);
}

function formatLocalDateKey(localDate: Date): string {
  const year = localDate.getUTCFullYear();
  const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(localDate.getUTCDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function serializeSupplementItem(item: IUserSupplement) {
  const dailyTargetCount = getSupplementDailyTargetCount(
    item.dosage,
    item.dailyTargetCount,
  );

  return {
    supplementId: item.supplementId,
    name: item.name,
    dosage: item.dosage,
    timing: item.timing,
    isActive: item.isActive,
    order: item.order,
    dailyTargetCount,
  };
}

function serializeSupplementLog(log: SupplementLogRecord) {
  return {
    id: String(log._id),
    supplementId: log.supplementId,
    supplementName: log.supplementName,
    logDate: log.logDate,
    consumedCount: getSupplementConsumedCount(log),
    createdAt: log.createdAt,
  };
}

function getExistingSupplementId(
  rawItem: unknown,
  existingIds: Set<string>,
  usedIds: Set<string>
): string | null {
  if (typeof rawItem !== 'object' || rawItem === null || !('supplementId' in rawItem)) {
    return null;
  }

  const supplementId = (rawItem as { supplementId?: unknown }).supplementId;
  if (typeof supplementId !== 'string') {
    return null;
  }

  const normalizedId = supplementId.trim();
  if (!normalizedId || !existingIds.has(normalizedId) || usedIds.has(normalizedId)) {
    return null;
  }

  usedIds.add(normalizedId);
  return normalizedId;
}

function getSupplementRouteId(req: Request): string | undefined {
  const routeId = req.params.id ?? req.params.supplementId;

  return Array.isArray(routeId) ? routeId[0] : routeId;
}

async function getSupplementStackContext(userId: string): Promise<SupplementStackContext | null> {
  const user = await UserModel.findById(userId)
    .select({ timezone: 1, supplementStack: 1 })
    .lean();

  if (!user) {
    return null;
  }

  return {
    timezone: user.timezone,
    supplementStack: user.supplementStack ?? [],
  };
}

export async function getStack(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    const context = await getSupplementStackContext(userId);
    if (!context) {
      sendUserNotFound(res);
      return;
    }

    const startOfDay = getMidnightUTC(context.timezone);
    const endOfWindow = new Date(Date.now());
    const todayLogs = await SupplementLogModel.find({
      userId,
      createdAt: {
        $gte: startOfDay,
        $lte: endOfWindow,
      },
    })
      .sort({ createdAt: -1 })
      .lean();

    const logsBySupplementId = new Map<string, SupplementLogRecord>();
    for (const log of todayLogs as SupplementLogRecord[]) {
      if (!logsBySupplementId.has(log.supplementId)) {
        logsBySupplementId.set(log.supplementId, log);
      }
    }

    const stack = sortByOrder(context.supplementStack)
      .map(item => {
        const log = logsBySupplementId.get(item.supplementId);
        const dailyTargetCount = getSupplementDailyTargetCount(
          item.dosage,
          item.dailyTargetCount,
        );
        const consumedTodayCount = getSupplementConsumedCount(log);

        return {
          ...serializeSupplementItem(item),
          consumedTodayCount,
          checkedToday: consumedTodayCount >= dailyTargetCount,
          checkedAt: log ? log.createdAt.toISOString() : null,
        };
      });

    res.status(200).json({
      success: true,
      data: {
        stack,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateStack(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = updateSupplementStackSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }

    const userId = req.user?.sub;
    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    const currentUser = await UserModel.findById(userId)
      .select({ supplementStack: 1 })
      .lean();

    if (!currentUser) {
      sendUserNotFound(res);
      return;
    }

    const rawItems = Array.isArray(req.body) ? req.body : [];
    const existingIds = new Set(
      (currentUser.supplementStack ?? []).map(item => item.supplementId)
    );
    const usedIds = new Set<string>();

    const supplementStack = parsed.data.map((item, index) => ({
      supplementId: getExistingSupplementId(rawItems[index], existingIds, usedIds) ?? randomUUID(),
      name: item.name,
      dosage: item.dosage,
      dailyTargetCount: getSupplementDailyTargetCount(item.dosage, item.dailyTargetCount),
      timing: item.timing,
      isActive: item.isActive,
      order: index,
    }));

    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      {
        $set: {
          supplementStack,
        },
      },
      {
        new: true,
        runValidators: true,
      }
    )
      .select({ supplementStack: 1 })
      .lean();

    if (!updatedUser) {
      sendUserNotFound(res);
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        stack: sortByOrder(updatedUser.supplementStack ?? []).map(serializeSupplementItem),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function checkSupplement(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    const supplementId = getSupplementRouteId(req);
    const context = await getSupplementStackContext(userId);
    if (!context) {
      sendUserNotFound(res);
      return;
    }

    if (!supplementId) {
      sendSupplementNotFound(res);
      return;
    }

    const supplement = context.supplementStack.find(item => item.supplementId === supplementId);
    if (!supplement) {
      sendSupplementNotFound(res);
      return;
    }

    const localDate = toLocalDate(new Date(), context.timezone);
    const logDate = formatLocalDateKey(localDate);
    const dailyTargetCount = getSupplementDailyTargetCount(
      supplement.dosage,
      supplement.dailyTargetCount,
    );
    let log = await SupplementLogModel.findOne({
      userId,
      supplementId,
      logDate,
    });

    if (!log) {
      try {
        const createdLog = await SupplementLogModel.create({
          userId,
          supplementId,
          supplementName: supplement.name,
          logDate,
          consumedCount: 1,
        });

        let xpAwarded = 0;
        const activeSupplementCount = context.supplementStack.filter(item => item.isActive).length;

        if (activeSupplementCount > 0) {
          const checkedTodayCount = await SupplementLogModel.countDocuments({
            userId,
            logDate,
          });

          if (checkedTodayCount === activeSupplementCount) {
            const supplementGoalAlreadyAwarded = await XPLogModel.exists({
              userId,
              xpType: 'supplementGoal',
              logDate,
            });

            xpAwarded = supplementGoalAlreadyAwarded ? 0 : XP_EVENTS.supplementGoal;

            Promise.resolve()
              .then(() => awardXP(userId, 'supplementGoal', context.timezone))
              .catch(err => console.error('XP award failed:', err));
          }
        }

        res.status(201).json({
          success: true,
          data: {
            log: serializeSupplementLog(createdLog.toObject() as SupplementLogRecord),
            xpAwarded,
          },
        });
        return;
      } catch (err) {
        if (!isDuplicateKeyError(err)) {
          throw err;
        }

        log = await SupplementLogModel.findOne({
          userId,
          supplementId,
          logDate,
        });
      }
    }

    if (!log) {
      sendSupplementLogNotFound(res);
      return;
    }

    const currentConsumedCount = getSupplementConsumedCount(log);
    if (currentConsumedCount < dailyTargetCount) {
      log.consumedCount = currentConsumedCount + 1;
      log.supplementName = supplement.name;
      await log.save();
    }

    res.status(200).json({
      success: true,
      data: {
        log: serializeSupplementLog(log.toObject() as SupplementLogRecord),
        xpAwarded: 0,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function uncheckSupplement(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    const context = await getSupplementStackContext(userId);
    if (!context) {
      sendUserNotFound(res);
      return;
    }

    const supplementId = getSupplementRouteId(req);
    if (!supplementId) {
      sendSupplementLogNotFound(res);
      return;
    }

    const localDate = toLocalDate(new Date(), context.timezone);
    const logDate = formatLocalDateKey(localDate);

    const existingLog = await SupplementLogModel.findOne({
      userId,
      supplementId,
      logDate,
    });

    if (!existingLog) {
      sendSupplementLogNotFound(res);
      return;
    }

    const currentConsumedCount = getSupplementConsumedCount(existingLog);

    if (currentConsumedCount <= 1) {
      await existingLog.deleteOne();
    } else {
      existingLog.consumedCount = currentConsumedCount - 1;
      await existingLog.save();
    }

    res.status(200).json({
      success: true,
      data: {
        message: 'Supplement progress decremented successfully.',
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteFromStack(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    const supplementId = getSupplementRouteId(req);
    const context = await getSupplementStackContext(userId);
    if (!context) {
      sendUserNotFound(res);
      return;
    }

    if (!supplementId) {
      sendSupplementNotFound(res);
      return;
    }

    if (!context.supplementStack.some(item => item.supplementId === supplementId)) {
      sendSupplementNotFound(res);
      return;
    }

    const [updatedUser] = await Promise.all([
      UserModel.findByIdAndUpdate(
        userId,
        {
          $pull: {
            supplementStack: {
              supplementId,
            },
          },
        },
        {
          new: true,
          runValidators: true,
        }
      )
        .select({ supplementStack: 1 })
        .lean(),
      SupplementLogModel.deleteMany({
        userId,
        supplementId,
      }),
    ]);

    if (!updatedUser) {
      sendUserNotFound(res);
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        stack: sortByOrder(updatedUser.supplementStack ?? []).map(serializeSupplementItem),
      },
    });
  } catch (err) {
    next(err);
  }
}