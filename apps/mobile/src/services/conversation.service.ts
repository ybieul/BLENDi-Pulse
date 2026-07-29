import axios from 'axios';
import type { PulseAiRecipe } from '@blendi/shared';

import { api } from '../config/api';
import { getAxiosErrorTranslationKey } from '../utils/error.utils';

interface ApiErrorResponse {
  success: false;
  code?: string;
  message?: string;
}

export interface ConversationSummary {
  id: string;
  createdAt: string;
  lastRecipeName?: string;
  messageCount: number;
  daysAgo: number;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string | PulseAiRecipe;
  timestamp: string;
}

export interface ConversationDetail {
  id: string;
  createdAt: string;
  updatedAt: string;
  lastRecipeName?: string;
  messages: ConversationMessage[];
}

interface ConversationsListResponse {
  success: true;
  data: {
    conversations: ConversationSummary[];
  };
}

interface ConversationDetailResponse {
  success: true;
  data: {
    conversation: ConversationDetail;
  };
}

export class ConversationServiceError extends Error {
  constructor(
    message: string,
    public readonly translationKey: string,
    public readonly apiCode?: string
  ) {
    super(message);
    this.name = 'ConversationServiceError';
  }
}

function toConversationServiceError(error: unknown): ConversationServiceError {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    return new ConversationServiceError(
      error.response?.data?.message ?? error.message,
      getAxiosErrorTranslationKey(error),
      error.response?.data?.code,
    );
  }

  return new ConversationServiceError(
    'Unexpected conversation service error.',
    'errors.network_internal_server_error',
  );
}

export async function getConversations(): Promise<ConversationSummary[]> {
  try {
    const response = await api.get<ConversationsListResponse>('/conversations');
    return response.data.data.conversations;
  } catch (error) {
    throw toConversationServiceError(error);
  }
}

export async function getConversationById(id: string): Promise<ConversationDetail> {
  try {
    const response = await api.get<ConversationDetailResponse>(
      `/conversations/${encodeURIComponent(id)}`,
    );
    return response.data.data.conversation;
  } catch (error) {
    throw toConversationServiceError(error);
  }
}
