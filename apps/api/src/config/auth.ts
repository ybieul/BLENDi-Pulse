// apps/api/src/config/auth.ts
// Constantes de configuração de autenticação.
// Importadas pelos serviços de auth — os secrets NUNCA devem aparecer em outros arquivos.
// Os valores vêm do env.ts, que valida e aborta o servidor se estiverem ausentes.

import { env } from './env';

export const authConfig = {
  accessToken: {
    secret: env.JWT_ACCESS_SECRET,
    /** 15 minutos — curto para limitar a janela de exposição de um token vazado. */
    expiresIn: '15m' as const,
  },
  refreshToken: {
    secret: env.JWT_REFRESH_SECRET,
    /** 30 dias — longo o suficiente para UX fluida, curto o suficiente para rotação. */
    expiresIn: '30d' as const,
  },
} as const;
