import { readFileSync } from 'node:fs';
import path from 'node:path';

const appJson = JSON.parse(readFileSync(path.join(process.cwd(), 'app.json'), 'utf8')) as {
  expo: {
    extra?: {
      eas?: {
        projectId?: string;
      };
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
};

const expoConfig = appJson.expo;
const expoProjectId = process.env['EXPO_PUBLIC_EXPO_PROJECT_ID'] ?? expoConfig.extra?.eas?.projectId;

export default {
  ...expoConfig,
  extra: {
    ...expoConfig.extra,
    expoProjectId,
    eas: {
      ...expoConfig.extra?.eas,
      projectId: expoProjectId,
    },
  },
};
