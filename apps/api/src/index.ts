// apps/api/src/index.ts
// Ponto de entrada do servidor BLENDi Pulse API.
// Ordem de inicialização:
//   1. Validar variáveis de ambiente (aborta se inválidas)
//   2. Conectar ao MongoDB Atlas (aborta se falhar)
//   3. Registrar middlewares globais
//   4. Registrar rotas
//   5. Registrar handler de erros (SEMPRE por último)
//   6. Começar a escutar requisições

import { env } from './config/env';
import { connectDatabase } from './config/database';
import express from 'express';
import cors from 'cors';
import { requestLogger } from './middlewares/requestLogger';
import { errorHandler } from './middlewares/errorHandler';
import { pingRouter } from './routes/ping';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { blendLogsRouter } from './routes/blendLogs';
import { hydrationLogsRouter } from './routes/hydrationLogs';
import { favoritesRouter } from './routes/favorites';
import { pulseAiRouter } from './routes/pulseAi';
import { supplementLogsRouter } from './routes/supplementLogs';
import { supplementStackRouter } from './routes/supplementStack';
import { sendErrorResponse } from './utils/error.utils';

const app = express();
const configuredOrigins = new Set(env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean));

function isAllowedOrigin(origin?: string): boolean {
  if (!origin) {
    return true;
  }

  if (configuredOrigins.has(origin)) {
    return true;
  }

  return env.NODE_ENV === 'development' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

// ─── Middlewares globais (ordem importa) ─────────────────────────────────────

// 1. CORS — aceita origens configuradas e localhost/127.0.0.1 em desenvolvimento
app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked for origin: ${origin ?? 'unknown'}`));
    },
    credentials: true,
  })
);

// 2. Parsing de JSON com limite de 1 MB
app.use(express.json({ limit: '1mb' }));

// 3. Parsing de URL encoded
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 4. Logger de requisições (apenas em development)
app.use(requestLogger);

// ─── Rotas ────────────────────────────────────────────────────────────────────

app.use('/', pingRouter);
app.use('/auth', authRouter);
app.use('/users', usersRouter);
app.use('/blend-logs', blendLogsRouter);
app.use('/hydration-logs', hydrationLogsRouter);
app.use('/supplement-stack', supplementStackRouter);
app.use('/supplement-logs', supplementLogsRouter);
app.use('/favorites', favoritesRouter);
app.use('/pulse-ai', pulseAiRouter);
// Próximas rotas serão registradas aqui conforme os checkpoints avançam:
// app.use('/api/v1/recipes', recipesRouter);

// ─── 404 — rota não encontrada ────────────────────────────────────────────────

app.use((_req, res) => {
  sendErrorResponse(res, {
    statusCode: 404,
    code: 'resource/not-found',
    message: 'Route not found.',
  });
});

// ─── Handler global de erros (DEVE ser o último middleware) ───────────────────

app.use(errorHandler);

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  // Aguarda banco antes de aceitar requisições
  await connectDatabase();

  app.listen(env.PORT, () => {
    console.log(`\n🚀  BLENDi Pulse API`);
    console.log(`   Ambiente : ${env.NODE_ENV}`);
    console.log(`   Versão   : v${env.API_VERSION}`);
    console.log(`   Porta    : ${env.PORT}`);
    console.log(`   Health   : http://localhost:${env.PORT}/ping\n`);
  });
}

void bootstrap();
