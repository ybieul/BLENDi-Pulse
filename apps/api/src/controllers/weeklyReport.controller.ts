import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import type { WeeklyReportSummary } from '@blendi/shared';

import { WeeklyReportModel, type IWeeklyReport } from '../models/WeeklyReport';
import { UserModel } from '../models/User';
import { sendErrorResponse, VALIDATION_ERROR_CODE, VALIDATION_ERROR_MESSAGE } from '../utils/error.utils';
import { toLocalDate, toUTC } from '../utils/timezone.utils';

const WEEKLY_REPORT_LOCAL_HOUR = 9;
const weekDatePattern = /^\d{4}-\d{2}-\d{2}$/;

type WeeklyReportLean = IWeeklyReport & { _id: mongoose.Types.ObjectId };

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

function getFirstQueryValue(value: unknown): string | undefined {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return typeof rawValue === 'string' ? rawValue : undefined;
}

function serializeWeeklyReport(report: WeeklyReportLean): WeeklyReportSummary {
  return {
    id: String(report._id),
    weekStartDate: report.weekStartDate,
    weekEndDate: report.weekEndDate,
    isProAtGeneration: report.isProAtGeneration,
    data: report.data,
    ...(report.previousWeekComparison && { previousWeekComparison: report.previousWeekComparison }),
    createdAt: report.createdAt.toISOString(),
  };
}

// Não existe utilitário genérico de "próxima ocorrência de um dia da semana +
// horário" em timezone.utils.ts (só de horário, via getNextOccurrenceUTC) —
// mantido local por ser a única tela que precisa disso.
function getNextMondayReportDateUTC(timezone: string): Date {
  const localNow = toLocalDate(new Date(), timezone);
  const currentWeekday = localNow.getUTCDay(); // 0 = domingo … 6 = sábado
  const isMondayBeforeReportHour = currentWeekday === 1 && localNow.getUTCHours() < WEEKLY_REPORT_LOCAL_HOUR;
  const daysUntilMonday = isMondayBeforeReportHour ? 0 : ((8 - currentWeekday) % 7) || 7;

  const targetLocalDay = new Date(
    Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate() + daysUntilMonday)
  );

  return toUTC(
    new Date(
      Date.UTC(
        targetLocalDay.getUTCFullYear(),
        targetLocalDay.getUTCMonth(),
        targetLocalDay.getUTCDate(),
        WEEKLY_REPORT_LOCAL_HOUR,
        0,
        0
      )
    ),
    timezone
  );
}

export async function getLatestReport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    const [user, latestReport] = await Promise.all([
      UserModel.findById(userId).select({ timezone: 1 }).lean(),
      WeeklyReportModel.findOne({ userId }).sort({ weekStartDate: -1 }).lean<WeeklyReportLean>(),
    ]);

    if (!user) {
      sendUserNotFound(res);
      return;
    }

    if (!latestReport) {
      res.status(200).json({
        success: true,
        data: {
          hasReport: false,
          nextReportDate: getNextMondayReportDateUTC(user.timezone).toISOString(),
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        hasReport: true,
        ...serializeWeeklyReport(latestReport),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getReportByWeek(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    const weekStart = getFirstQueryValue(req.query.weekStart);
    if (!weekStart || !weekDatePattern.test(weekStart)) {
      sendErrorResponse(res, {
        statusCode: 400,
        code: VALIDATION_ERROR_CODE,
        message: VALIDATION_ERROR_MESSAGE,
      });
      return;
    }

    const report = await WeeklyReportModel.findOne({ userId, weekStartDate: weekStart }).lean<WeeklyReportLean>();

    if (!report) {
      sendErrorResponse(res, {
        statusCode: 404,
        code: 'weeklyReport/not-found',
        message: 'Weekly report not found.',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: serializeWeeklyReport(report),
    });
  } catch (error) {
    next(error);
  }
}

export async function getAllReportDates(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    const reports = await WeeklyReportModel.find({ userId })
      .sort({ weekStartDate: 1 })
      .select({ weekStartDate: 1, _id: 0 })
      .lean<Array<{ weekStartDate: string }>>();

    res.status(200).json({
      success: true,
      data: {
        dates: reports.map((report) => report.weekStartDate),
      },
    });
  } catch (error) {
    next(error);
  }
}
