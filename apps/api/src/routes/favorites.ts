import { Router, type IRouter } from 'express';
import { addFavorite, getFavorites, removeFavorite } from '../controllers/favorite.controller';
import { authenticate } from '../middlewares/authenticate';

export const favoritesRouter: IRouter = Router();

/**
 * GET /favorites  🔒 autenticado
 * Retorna os favoritos do usuário autenticado em ordem decrescente de criação.
 */
favoritesRouter.get('/', authenticate, getFavorites);

/**
 * POST /favorites  🔒 autenticado
 * Cria um novo favorito ou retorna o existente em caso de duplicata.
 */
favoritesRouter.post('/', authenticate, addFavorite);

/**
 * DELETE /favorites/:id  🔒 autenticado
 * Remove um favorito existente pertencente ao usuário autenticado.
 */
favoritesRouter.delete('/:id', authenticate, removeFavorite);