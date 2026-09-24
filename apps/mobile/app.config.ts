import type { ConfigContext, ExpoConfig } from 'expo/config';

// Le uma variavel de ambiente tratando ausente, vazia e so-espacos como "nao definida"
// (com `??` uma variavel definida como "" venceria o fallback e geraria valores invalidos).
const fromEnv = (name: string): string | undefined => {
  // process.env e tipado como any neste projeto; unknown + typeof evita propagar o any.
  const raw: unknown = process.env[name];
  const value = typeof raw === 'string' ? raw.trim() : '';
  return value ? value : undefined;
};

// O Expo injeta em `config` o conteudo de expo do app.json (config estatica), entao nao
// ha leitura manual do arquivo nem dependencia do diretorio de execucao (process.cwd()).
export default ({ config }: ConfigContext): ExpoConfig => {
  // ExpoConfig.extra e { [k: string]: any }; tipamos so o trecho que usamos (extra.eas).
  const staticEas = (config.extra?.['eas'] ?? {}) as { projectId?: string };
  const expoProjectId = fromEnv('EXPO_PUBLIC_EXPO_PROJECT_ID') ?? staticEas.projectId;

  // google-services.json fica fora do git. Em builds EAS ele chega via a variavel de
  // ambiente de arquivo GOOGLE_SERVICES_JSON (o EAS injeta o caminho do arquivo);
  // em desenvolvimento local usa o arquivo em apps/mobile/ (fallback). O fallback aponta
  // para o arquivo mesmo se ele nao existir, para o build falhar alto em vez de sair sem FCM.
  const googleServicesFile = fromEnv('GOOGLE_SERVICES_JSON') ?? './google-services.json';

  return {
    // name e slug sempre vem do app.json; o cast so satisfaz o tipo Partial de `config`.
    ...(config as ExpoConfig),
    android: {
      ...config.android,
      googleServicesFile,
    },
    extra: {
      ...config.extra,
      expoProjectId,
      revenueCatAppleApiKey: fromEnv('EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY'),
      revenueCatGoogleApiKey: fromEnv('EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY'),
      eas: {
        ...staticEas,
        projectId: expoProjectId,
      },
    },
  };
};
