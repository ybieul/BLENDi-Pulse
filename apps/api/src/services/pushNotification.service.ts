import { env } from '../config/env';
import { UserModel } from '../models/User';

const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_MAX_BATCH_SIZE = 100;
const EXPO_SUCCESS_STATUS = 'ok';
const EXPO_ERROR_STATUS = 'error';
const DEVICE_NOT_REGISTERED_ERROR = 'DeviceNotRegistered';

type PushNotificationPriority = 'default' | 'normal' | 'high';

type ExpoPushTicket = {
  status?: typeof EXPO_SUCCESS_STATUS | typeof EXPO_ERROR_STATUS;
  details?: {
    error?: string;
  };
};

type ExpoPushResponse = {
  data?: ExpoPushTicket[];
};

export interface PushNotificationPayload {
  pushToken: string;
  title: string;
  body: string;
  data: {
    deepLink: string;
    type: string;
  };
  priority: PushNotificationPriority;
}

export interface PushNotificationResult {
  token: string;
  status: 'success' | 'error';
  errorType?: string;
}

function chunkPayloads(payloads: PushNotificationPayload[]): PushNotificationPayload[][] {
  const chunks: PushNotificationPayload[][] = [];

  for (let index = 0; index < payloads.length; index += EXPO_MAX_BATCH_SIZE) {
    chunks.push(payloads.slice(index, index + EXPO_MAX_BATCH_SIZE));
  }

  return chunks;
}

function buildExpoRequestBody(batch: PushNotificationPayload[]) {
  return batch.map(payload => ({
    to: payload.pushToken,
    title: payload.title,
    body: payload.body,
    data: payload.data,
    sound: 'default',
    priority: payload.priority,
  }));
}

function buildBatchErrorResults(
  batch: PushNotificationPayload[],
  errorType: string
): PushNotificationResult[] {
  return batch.map(payload => ({
    token: payload.pushToken,
    status: 'error',
    errorType,
  }));
}

function mapExpoResults(
  batch: PushNotificationPayload[],
  tickets: ExpoPushTicket[] | undefined
): PushNotificationResult[] {
  if (!Array.isArray(tickets) || tickets.length !== batch.length) {
    return buildBatchErrorResults(batch, 'MalformedExpoResponse');
  }

  return batch.map((payload, index) => {
    const ticket = tickets[index];

    if (ticket?.status === EXPO_SUCCESS_STATUS) {
      return {
        token: payload.pushToken,
        status: 'success',
      } satisfies PushNotificationResult;
    }

    const errorType = ticket?.details?.error ?? 'UnknownExpoError';

    return {
      token: payload.pushToken,
      status: 'error',
      errorType,
    } satisfies PushNotificationResult;
  });
}

async function sendExpoBatch(batch: PushNotificationPayload[]): Promise<PushNotificationResult[]> {
  try {
    const response = await fetch(EXPO_PUSH_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(buildExpoRequestBody(batch)),
    });

    let responseBody: ExpoPushResponse | null = null;

    try {
      responseBody = (await response.json()) as ExpoPushResponse;
    } catch {
      responseBody = null;
    }

    if (!response.ok) {
      return buildBatchErrorResults(batch, `ExpoHttp${response.status}`);
    }

    return mapExpoResults(batch, responseBody?.data);
  } catch {
    return buildBatchErrorResults(batch, 'ExpoRequestFailed');
  }
}

export async function sendNotificationBatch(payloads: PushNotificationPayload[]): Promise<{
  successCount: number;
  errorCount: number;
  invalidTokens: string[];
}> {
  if (payloads.length === 0) {
    return {
      successCount: 0,
      errorCount: 0,
      invalidTokens: [],
    };
  }

  const results: PushNotificationResult[] = [];

  for (const batch of chunkPayloads(payloads)) {
    const batchResults = await sendExpoBatch(batch);
    results.push(...batchResults);
  }

  const invalidTokens = Array.from(
    new Set(
      results
        .filter(
          result =>
            result.status === 'error' && result.errorType === DEVICE_NOT_REGISTERED_ERROR
        )
        .map(result => result.token)
    )
  );

  return {
    successCount: results.filter(result => result.status === 'success').length,
    errorCount: results.filter(result => result.status === 'error').length,
    invalidTokens,
  };
}

export async function cleanInvalidTokens(invalidTokens: string[]): Promise<void> {
  if (invalidTokens.length === 0) {
    return;
  }

  await UserModel.updateMany(
    {
      pushToken: { $in: invalidTokens },
    },
    {
      $unset: {
        pushToken: '',
      },
    }
  );
}
