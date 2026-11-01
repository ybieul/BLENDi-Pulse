import { PostHog } from 'posthog-node';
import { env } from '../config/env';

let client: PostHog | null = null;

function getClient(): PostHog | null {
  if (client) return client;
  if (!env.POSTHOG_API_KEY) return null;

  client = new PostHog(env.POSTHOG_API_KEY);
  return client;
}

export function captureServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>
): void {
  const posthog = getClient();
  if (!posthog) return;

  try {
    posthog.capture({ distinctId, event, properties });
  } catch (err) {
    console.warn('[analytics.service] failed to capture event', { event, err });
  }
}
