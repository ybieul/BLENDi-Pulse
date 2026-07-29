import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';

import { ConversationModel, type IConversation } from '../models/Conversation';
import { UserModel } from '../models/User';
import { sendErrorResponse } from '../utils/error.utils';
import { toLocalDate } from '../utils/timezone.utils';

const CONVERSATIONS_LIST_LIMIT = 20;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type ConversationDetailRecord = IConversation & {
  _id: mongoose.Types.ObjectId | string;
};

interface ConversationListAggregateResult {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  lastRecipeName?: string;
  messageCount: number;
}

function sendUnauthorized(res: Response): void {
  sendErrorResponse(res, {
    statusCode: 401,
    code: 'auth/unauthorized',
    message: 'Unauthorized.',
  });
}

function sendConversationNotFound(res: Response): void {
  sendErrorResponse(res, {
    statusCode: 404,
    code: 'conversations/not-found',
    message: 'Conversation not found.',
  });
}

function sendUserNotFound(res: Response): void {
  sendErrorResponse(res, {
    statusCode: 404,
    code: 'resource/not-found',
    message: 'User not found.',
  });
}

// Diferença de dias em calendário LOCAL (no timezone do usuário) entre
// `createdAt` e `now`. Usado pelo mobile para renderizar "hoje" / "ontem" /
// "N dias atrás" sem lógica de data no frontend (ver pulseAI.historyBanner e
// daysAgo* no i18n). Timezone-aware pelo mesmo motivo do streak e dos resets
// diários em timezone.utils.ts: a virada de dia em UTC pode não coincidir
// com a virada de dia local do usuário.
function getDaysAgo(createdAt: Date, now: Date, timezone: string): number {
  const localCreatedAt = toLocalDate(createdAt, timezone);
  const localNow = toLocalDate(now, timezone);

  const createdAtDateOnly = Date.UTC(
    localCreatedAt.getUTCFullYear(),
    localCreatedAt.getUTCMonth(),
    localCreatedAt.getUTCDate()
  );
  const nowDateOnly = Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate()
  );

  return Math.round((nowDateOnly - createdAtDateOnly) / MS_PER_DAY);
}

function serializeConversationSummary(
  conversation: ConversationListAggregateResult,
  now: Date,
  timezone: string
) {
  return {
    id: String(conversation._id),
    createdAt: conversation.createdAt.toISOString(),
    lastRecipeName: conversation.lastRecipeName,
    messageCount: conversation.messageCount,
    daysAgo: getDaysAgo(conversation.createdAt, now, timezone),
  };
}

function serializeConversationDetail(conversation: ConversationDetailRecord) {
  return {
    id: String(conversation._id),
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    lastRecipeName: conversation.lastRecipeName,
    messages: conversation.messages.map(message => ({
      role: message.role,
      content: message.content,
      timestamp: message.timestamp.toISOString(),
    })),
  };
}

export async function getConversations(
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

    const [user, conversations] = await Promise.all([
      UserModel.findById(userId).select({ timezone: 1 }).lean().exec(),
      ConversationModel.aggregate<ConversationListAggregateResult>([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        { $sort: { createdAt: -1 } },
        { $limit: CONVERSATIONS_LIST_LIMIT },
        {
          $project: {
            createdAt: 1,
            lastRecipeName: 1,
            messageCount: { $size: '$messages' },
          },
        },
      ]),
    ]);

    if (!user) {
      sendUserNotFound(res);
      return;
    }

    const now = new Date();

    res.status(200).json({
      success: true,
      data: {
        conversations: conversations.map(conversation =>
          serializeConversationSummary(conversation, now, user.timezone)
        ),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getConversationById(
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

    const conversationId = req.params.id;

    if (!mongoose.isValidObjectId(conversationId)) {
      sendErrorResponse(res, {
        statusCode: 400,
        code: 'conversations/invalid-id',
        message: 'Invalid conversation id.',
      });
      return;
    }

    const conversation = (await ConversationModel.findById(conversationId)
      .lean()
      .exec()) as ConversationDetailRecord | null;

    if (!conversation) {
      sendConversationNotFound(res);
      return;
    }

    if (String(conversation.userId) !== userId) {
      sendErrorResponse(res, {
        statusCode: 403,
        code: 'conversations/forbidden',
        message: 'Forbidden.',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        conversation: serializeConversationDetail(conversation),
      },
    });
  } catch (error) {
    next(error);
  }
}
