import { Router, type IRouter } from 'express';

import { verifyPurchase } from '../controllers/purchase.controller';
import { authenticate } from '../middlewares/authenticate';

export const purchasesRouter: IRouter = Router();

/**
 * POST /purchases/verify  🔒 autenticado
 * Verifica um comprovante de compra no RevenueCat e sincroniza a assinatura Pro do usuário.
 */
purchasesRouter.post('/verify', authenticate, verifyPurchase);