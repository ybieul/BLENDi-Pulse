// apps/api/src/config/auth.ts
// Constantes de configuração de autenticação.
// Importadas pelos serviços de auth — os secrets NUNCA devem aparecer em outros arquivos.
// Os valores vêm do env.ts, que valida e aborta o servidor se estiverem ausentes.

import type { SignOptions } from 'jsonwebtoken';
import { env } from './env';

export const authConfig = {
  accessToken: {
    secret: env.JWT_ACCESS_SECRET,
    /** Padrão 15 minutos — curto para limitar a janela de exposição de um token vazado. */
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
  },
  refreshToken: {
    secret: env.JWT_REFRESH_SECRET,
    /** Padrão 30 dias — longo o suficiente para UX fluida, curto o suficiente para rotação. */
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'],
  },
} as const;
