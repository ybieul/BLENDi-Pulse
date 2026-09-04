// apps/api/src/routes/ping.ts
// GET /ping — health check público, sem autenticação.
// Retorna status, versão, ambiente e timestamp UTC.
// Use-o para confirmar se um novo deploy no Railway foi aplicado
// (a versão muda imediatamente após o deploy).
//
// GET /health — readiness check: além do que /ping retorna, inclui o estado
// da conexão com o MongoDB (dbStatus) e responde 503 quando o banco não está
// conectado — permite que um sistema de monitoramento diferencie "processo
// vivo mas banco indisponível" de "processo e banco ambos saudáveis", coisa
// que /ping (sempre 200) não consegue expressar.

import { Router, type Request, type Response, type IRouter } from 'express';
import mongoose from 'mongoose';
import { env } from '../config/env';

export const pingRouter: IRouter = Router();

pingRouter.get('/ping', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    version: env.API_VERSION,
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

pingRouter.get('/health', (_req: Request, res: Response) => {
  // readyState: 0 = desconectado, 1 = conectado, 2 = conectando, 3 = desconectando
  const dbStatus = mongoose.connection.readyState;
  const isDatabaseReady = dbStatus === 1;

  res.status(isDatabaseReady ? 200 : 503).json({
    status: isDatabaseReady ? 'ok' : 'degraded',
    version: env.API_VERSION,
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    dbStatus,
  });
});
