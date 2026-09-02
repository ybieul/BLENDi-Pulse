// apps/api/src/index.ts
// Ponto de entrada do servidor BLENDi Pulse API.
// Ordem de inicialização:
//   1. Validar variáveis de ambiente (aborta se inválidas)
//   2. Conectar ao MongoDB Atlas (aborta se falhar)
//   3. Registrar middlewares globais
//   4. Registrar rotas
//   5. Registrar handler de erros (SEMPRE por último)
//   6. Começar a escutar requisições

import { env, paymentsConfig } from './config/env';
import { connectDatabase } from './config/database';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import { requestLogger } from './middlewares/requestLogger';
import { authenticatedLimiter } from './middlewares/rateLimiter';
import { errorHandler } from './middlewares/errorHandler';
import { pingRouter } from './routes/ping';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { blendLogsRouter } from './routes/blendLogs';
import { hydrationLogsRouter } from './routes/hydrationLogs';
import { favoritesRouter } from './routes/favorites';
import { pantryScannerRouter } from './routes/pantryScanner';
import { pulseAiRouter } from './routes/pulseAi';
import { conversationsRouter } from './routes/conversations';
import { supplementLogsRouter } from './routes/supplementLogs';
import { supplementStackRouter } from './routes/supplementStack';
import { dailyMissionsRouter } from './routes/dailyMissions';
import { shoppingListRouter } from './routes/shoppingList';
import { weeklyReportsRouter } from './routes/weeklyReports';
import { purchasesRouter } from './routes/purchases';
import { webhooksRouter } from './routes/webhooks';
import { sendErrorResponse } from './utils/error.utils';
import { initializeNotificationJobs } from './jobs/notifications.jobs';

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

// Rotas que legitimamente recebem payloads grandes (imagens em base64) —
// todo o resto usa o limite padrão pequeno. Ver uso na cadeia de
// middlewares abaixo.
const LARGE_JSON_PAYLOAD_PATHS = new Set(['/users/profile-photo', '/pantry-scanner/analyze']);
const defaultJsonParser = express.json({ limit: '50kb' });
const largeJsonParser = express.json({ limit: '4mb' });

// ─── Middlewares globais (ordem importa) ─────────────────────────────────────

// 1. Helmet — headers de segurança HTTP (HSTS, X-Content-Type-Options,
// X-Frame-Options, remove X-Powered-By, etc.). Defaults do pacote são
// adequados aqui: a API serve exclusivamente JSON para o app mobile, sem
// rotas HTML, então não há CSP/frame-options que precisem de ajuste.
app.use(helmet());

// 2. CORS — aceita origens configuradas e localhost/127.0.0.1 em desenvolvimento
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

// 3. Compressão gzip das respostas — precisa vir antes de qualquer middleware
// de rota para interceptar corretamente o corpo enviado por res.send/res.json.
app.use(compression());

// Webhooks do RevenueCat precisam do corpo bruto para verificar o HMAC recebido.
app.use('/webhooks', express.raw({ type: 'application/json', limit: '1mb' }), webhooksRouter);

// 4. Parsing de JSON — 50 KB por padrão (defesa em profundidade contra
// abuso de banda/memória em rotas que não precisam de payload grande, ex:
// /auth/login); 4 MB só nas duas rotas que legitimamente recebem imagens
// em base64. Escolha dinâmica por req.path com uma única instância de
// parser por requisição — dois express.json() empilhados via app.use()
// com prefixo de rota consumiriam o corpo da requisição duas vezes.
app.use((req, res, next) => {
  const parser = LARGE_JSON_PAYLOAD_PATHS.has(req.path) ? largeJsonParser : defaultJsonParser;
  parser(req, res, next);
});

// 5. Parsing de URL encoded
app.use(express.urlencoded({ extended: true, limit: '4mb' }));

// 6. Sanitização contra injeção de operadores MongoDB ($ne, $gt, $where, etc.)
// em req.body/req.params/req.headers/req.query — precisa vir depois do
// parsing do body. Remoção completa de chaves com $ ou . (não substituição):
// nenhum campo legítimo da API usa esses caracteres em nomes de chave.
//
// NÃO usamos app.use(mongoSanitize()) diretamente: a implementação da
// biblioteca (v2.2.0) reatribui req[key] = target ao final de cada chave
// sanitizada. No Express 5, req.query é um getter somente-leitura, e essa
// reatribuição lança "TypeError: Cannot set property query of
// #<IncomingMessage> which has only a getter" — derrubando toda requisição
// com 500 (confirmado ao vivo: até GET /ping sem nenhum parâmetro quebrava).
// A função sanitize() exportada já muta o objeto em memória (delete + nova
// atribuição de chave) antes dessa reatribuição acontecer — chamá-la
// diretamente, sem reatribuir req[key], preserva o mesmo efeito de
// sanitização sem o crash.
app.use((req, _res, next) => {
  (['body', 'params', 'headers', 'query'] as const).forEach(key => {
    const target = req[key];
    if (target && typeof target === 'object') {
      mongoSanitize.sanitize(target as Record<string, unknown>);
    }
  });
  next();
});

// 7. Logger de requisições (apenas em development)
app.use(requestLogger);

// 8. Rate limiting global para requisições autenticadas (120/min por usuário).
// /auth/*, /webhooks/* e /ping já têm seus próprios limites (ou não
// precisam de nenhum) e são excluídos via a opção `skip` do limitador —
// ver apps/api/src/middlewares/rateLimiter.ts.
app.use(authenticatedLimiter);

// ─── Rotas ────────────────────────────────────────────────────────────────────

app.use('/', pingRouter);
app.use('/auth', authRouter);
app.use('/users', usersRouter);
app.use('/blend-logs', blendLogsRouter);
app.use('/hydration-logs', hydrationLogsRouter);
app.use('/supplement-stack', supplementStackRouter);
app.use('/supplement-logs', supplementLogsRouter);
app.use('/favorites', favoritesRouter);
app.use('/pantry-scanner', pantryScannerRouter);
app.use('/pulse-ai', pulseAiRouter);
app.use('/conversations', conversationsRouter);
app.use('/daily-missions', dailyMissionsRouter);
app.use('/shopping-lists', shoppingListRouter);
app.use('/weekly-reports', weeklyReportsRouter);
app.use('/purchases', purchasesRouter);
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
  initializeNotificationJobs();

  app.listen(env.PORT, () => {
    console.log(`\n🚀  BLENDi Pulse API`);
    console.log(`   Ambiente : ${env.NODE_ENV}`);
    console.log(`   Versão   : v${env.API_VERSION}`);
    console.log(`   Porta    : ${env.PORT}`);
    console.log(`   Health   : http://localhost:${env.PORT}/ping\n`);

    if (!paymentsConfig.isConfigured) {
      console.warn(
        '⚠️  Sistema de pagamento ainda nao configurado — funcionalidades de assinatura estarao indisponiveis ate que as chaves sejam preenchidas.'
      );
    }
  });
}

void bootstrap();
