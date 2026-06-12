import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const appJson = JSON.parse(readFileSync(path.join(__dirname, 'app.json'), 'utf8')) as {
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
