import { Router, type IRouter } from 'express';

import { analyzePantry } from '../controllers/pantryScanner.controller';
import { authenticate } from '../middlewares/authenticate';

export const pantryScannerRouter: IRouter = Router();

pantryScannerRouter.post('/analyze', authenticate, analyzePantry);