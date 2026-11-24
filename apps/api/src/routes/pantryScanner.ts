import { Router, type IRouter } from 'express';

import { generatePantry, readPantry, unlockPantryPreview } from '../controllers/pantryScanner.controller';
import { authenticate } from '../middlewares/authenticate';

export const pantryScannerRouter: IRouter = Router();

/**
 * POST /pantry-scanner/read  🔒 autenticado
 * CP-B5.4: lê a foto (só a visão). Não conta scan; conta no limite de
 * leituras do plano. Guarda a leitura por ~30 min (nunca a imagem) e devolve
 * o readId para a confirmação dos ingredientes.
 */
pantryScannerRouter.post('/read', authenticate, readPantry);

/**
 * POST /pantry-scanner/generate  🔒 autenticado
 * CP-B5.4: gera as receitas a partir da leitura confirmada (marcados,
 * adicionados, líquido e pedido). Conta o scan (ou a prévia do free).
 */
pantryScannerRouter.post('/generate', authenticate, generatePantry);

/**
 * GET /pantry-scanner/previews/:id  🔒 autenticado
 * Desbloqueia uma prévia bloqueada do Pantry Scanner (CP-1.1.4b): devolve as
 * receitas completas e os ingredientes detectados só para o dono que já é Pro
 * (lido do banco). Rate limit: o authenticatedLimiter global de index.ts.
 */
pantryScannerRouter.get('/previews/:id', authenticate, unlockPantryPreview);
