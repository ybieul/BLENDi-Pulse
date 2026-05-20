import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { historyQuerySchema } from '@blendi/shared';
import { SupplementLogModel } from '../models/SupplementLog';
import { UserModel, type IUserSupplement } from '../models/User';
import {
  getSupplementConsumedCount,
  getSupplementDailyTargetCount,
} from '../utils/supplementProgress.utils';
import {
  sendErrorResponse,
  VALIDATION_ERROR_CODE,
  VALIDATION_ERROR_MESSAGE,
} from '../utils/error.utils';
import { toUTC } from '../utils/timezone.utils';

interface SupplementHistoryDay {
  date: string;
  checkedSupplements: Array<ReturnType<typeof serializeSupplementItem>>;
  missedSupplements: Array<ReturnType<typeof serializeSupplementItem>>;
  adherenceRate: number;
}

function sendUnauthorized(res: Response): void {
  sendErrorResponse(res, {
    statusCode: 401,
    code: 'auth/unauthorized',
    message: 'Unauthorized.',
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

function getFirstQueryValue(value: unknown): string | undefined {
  const rawValue = Array.isArray(value) ? value[0] : value;

  return typeof rawValue === 'string' ? rawValue : undefined;
}

function coerceHistoryQueryInput(query: Request['query']) {
  const page = getFirstQueryValue(query.page);
  const limit = getFirstQueryValue(query.limit);

  return {
    from: getFirstQueryValue(query.from),
    to: getFirstQueryValue(query.to),
    ...(page !== undefined && { page: Number(page) }),
    ...(limit !== undefined && { limit: Number(limit) }),
  };
}

function getIsoDateKey(value: string): string {
  const date = new Date(value);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function buildLocalDayUtcRange(from: string, to: string, timezone: string): {
  startAt: Date;
  endAtExclusive: Date;
} {
  const fromDate = new Date(from);
  const toDate = new Date(to);

  const startAt = toUTC(
    new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate(), 0, 0, 0)),
    timezone
  );

  const endAtExclusive = toUTC(
    new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), toDate.getUTCDate() + 1, 0, 0, 0)),
    timezone
  );

  return {
    startAt,
    endAtExclusive,
  };
}

function getInclusiveDayKeys(from: string, to: string): string[] {
  const dayKeys: string[] = [];
  const current = new Date(`${getIsoDateKey(from)}T00:00:00.000Z`);
  const end = new Date(`${getIsoDateKey(to)}T00:00:00.000Z`);

  while (current.getTime() <= end.getTime()) {
    dayKeys.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dayKeys;
}

function roundToTwoDecimals(value: number): number {
  return Number(value.toFixed(2));
}

function serializeSupplementItem(item: IUserSupplement) {
  return {
    supplementId: item.supplementId,
    name: item.name,
    dosage: item.dosage,
    timing: item.timing,
    isActive: item.isActive,
    order: item.order,
    dailyTargetCount: getSupplementDailyTargetCount(item.dosage, item.dailyTargetCount),
  };
}

export async function getSupplementHistory(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = historyQuerySchema.safeParse(coerceHistoryQueryInput(req.query));
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }

    const userId = req.user?.sub;
    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    const user = await UserModel.findById(userId)
      .select({ timezone: 1, supplementStack: 1 })
      .lean();

    if (!user) {
      sendErrorResponse(res, {
        statusCode: 404,
        code: 'resource/not-found',
        message: 'User not found.',
      });
      return;
    }

    const { from, to } = parsed.data;
    const activeStack = (user.supplementStack ?? [])
      .filter(item => item.isActive)
      .sort((left, right) => left.order - right.order);
    const activeStackById = new Map(
      activeStack.map(item => [item.supplementId, item] as const)
    );
    const { startAt, endAtExclusive } = buildLocalDayUtcRange(from, to, user.timezone);
    const logs = await SupplementLogModel.find({
      userId,
      createdAt: {
        $gte: startAt,
        $lt: endAtExclusive,
      },
    })
      .select({ supplementId: 1, logDate: 1, consumedCount: 1 })
      .sort({ logDate: -1, createdAt: -1 })
      .lean();

    const activeSupplementIds = new Set(activeStack.map(item => item.supplementId));
    const checkedByDate = new Map<string, Set<string>>();

    for (const log of logs) {
      if (!activeSupplementIds.has(log.supplementId)) {
        continue;
      }

      const supplement = activeStackById.get(log.supplementId);
      if (!supplement) {
        continue;
      }

      if (
        getSupplementConsumedCount(log)
        < getSupplementDailyTargetCount(supplement.dosage, supplement.dailyTargetCount)
      ) {
        continue;
      }

      if (!checkedByDate.has(log.logDate)) {
        checkedByDate.set(log.logDate, new Set<string>());
      }

      checkedByDate.get(log.logDate)?.add(log.supplementId);
    }

    const history: SupplementHistoryDay[] = [...getInclusiveDayKeys(from, to)]
      .reverse()
      .map(date => {
        const checkedIds = checkedByDate.get(date) ?? new Set<string>();
        const checkedSupplements = activeStack
          .filter(item => checkedIds.has(item.supplementId))
          .map(serializeSupplementItem);
        const missedSupplements = activeStack
          .filter(item => !checkedIds.has(item.supplementId))
          .map(serializeSupplementItem);
        const adherenceRate = activeStack.length === 0
          ? 0
          : roundToTwoDecimals((checkedSupplements.length / activeStack.length) * 100);

        return {
          date,
          checkedSupplements,
          missedSupplements,
          adherenceRate,
        };
      });

    const averageAdherence = history.length === 0
      ? 0
      : roundToTwoDecimals(
        history.reduce((sum, day) => sum + day.adherenceRate, 0) / history.length
      );

    res.status(200).json({
      success: true,
      data: {
        history,
        summary: {
          averageAdherence,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}