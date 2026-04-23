// apps/api/src/routes/ping.ts
// GET /ping — health check público, sem autenticação.
// Retorna status, versão, ambiente e timestamp UTC.
// Use-o para confirmar se um novo deploy no Railway foi aplicado
// (a versão muda imediatamente após o deploy).

import { Router, type Request, type Response, type IRouter } from 'express';
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
