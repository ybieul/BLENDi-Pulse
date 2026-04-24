// apps/api/src/types/express.d.ts
// Augmentação de tipos do Express.
// Adiciona `user` ao objeto Request para que os middlewares autenticados
// saibam o payload do token sem precisar de type assertions.

import type { AccessTokenPayload } from '../services/auth.service';

declare global {
  namespace Express {
    interface Request {
      /**
       * Payload do access token JWT decodificado.
       * Presente apenas após o middleware `authenticate` ser executado.
       */
      user?: AccessTokenPayload;
    }
  }
}
