import Constants from 'expo-constants';
import { Platform } from 'react-native';

interface ExpoExtraConfig {
  revenueCatAppleApiKey?: string;
  revenueCatGoogleApiKey?: string;
}

function toOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function getExpoExtra(): ExpoExtraConfig | undefined {
  return Constants.expoConfig?.extra;
}

export function getRevenueCatApiKey(): string | null {
  const extra = getExpoExtra();

  if (Platform.OS === 'ios') {
    return toOptionalString(extra?.revenueCatAppleApiKey);
  }

  if (Platform.OS === 'android') {
    return toOptionalString(extra?.revenueCatGoogleApiKey);
  }

  return null;
}

export function isRevenueCatNativePlatform(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}