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

const app = express();

// ─── Middlewares globais (ordem importa) ─────────────────────────────────────

// 1. CORS — apenas origens configuradas via variável de ambiente
app.use(
  cors({
    origin: env.ALLOWED_ORIGINS.split(',').map(o => o.trim()),
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
// Próximas rotas serão registradas aqui conforme os checkpoints avançam:
// app.use('/api/v1/recipes', recipesRouter);

// ─── 404 — rota não encontrada ────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'errors.not_found' });
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
