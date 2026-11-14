import { Router, type IRouter } from 'express';

import { analyzePantry, unlockPantryPreview } from '../controllers/pantryScanner.controller';
import { authenticate } from '../middlewares/authenticate';

export const pantryScannerRouter: IRouter = Router();

pantryScannerRouter.post('/analyze', authenticate, analyzePantry);

/**
 * GET /pantry-scanner/previews/:id  🔒 autenticado
 * Desbloqueia uma prévia bloqueada do Pantry Scanner (CP-1.1.4b): devolve as
 * receitas completas e os ingredientes detectados só para o dono que já é Pro
 * (lido do banco). Rate limit: o authenticatedLimiter global de index.ts.
 */
pantryScannerRouter.get('/previews/:id', authenticate, unlockPantryPreview);
