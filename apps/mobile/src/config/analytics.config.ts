import Constants from 'expo-constants';

interface ExpoExtraConfig {
  posthogApiKey?: string;
}

function toOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function getExpoExtra(): ExpoExtraConfig | undefined {
  return Constants.expoConfig?.extra;
}

export function getPostHogApiKey(): string | null {
  return toOptionalString(getExpoExtra()?.posthogApiKey);
}
