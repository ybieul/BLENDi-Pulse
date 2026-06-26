import { Router, type IRouter } from 'express';
import {
  clearCheckedItems,
  createList,
  deleteList,
  getArchivedLists,
  getListById,
  getLists,
  toggleItemCheck,
  updateItems,
  updateList,
} from '../controllers/shoppingList.controller';
import { authenticate } from '../middlewares/authenticate';

export const shoppingListRouter: IRouter = Router();

shoppingListRouter.get('/', authenticate, getLists);
shoppingListRouter.get('/archived', authenticate, getArchivedLists);
shoppingListRouter.get('/:listId', authenticate, getListById);
shoppingListRouter.post('/', authenticate, createList);
shoppingListRouter.patch('/:listId', authenticate, updateList);
shoppingListRouter.delete('/:listId', authenticate, deleteList);
shoppingListRouter.put('/:listId/items', authenticate, updateItems);
shoppingListRouter.patch('/:listId/items/:itemId/check', authenticate, toggleItemCheck);
shoppingListRouter.delete('/:listId/items/checked', authenticate, clearCheckedItems);
