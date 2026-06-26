import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import {
  createShoppingListSchema,
  updateItemsSchema,
  updateShoppingListSchema,
  type ShoppingListDetail,
  type ShoppingListItem,
  type ShoppingListSummary,
} from '@blendi/shared';
import { ShoppingListModel, type IShoppingList, type IShoppingListItem } from '../models/ShoppingList';
import { UserModel } from '../models/User';
import {
  sendErrorResponse,
  VALIDATION_ERROR_CODE,
  VALIDATION_ERROR_MESSAGE,
} from '../utils/error.utils';

type ShoppingListRecord = IShoppingList & {
  _id: mongoose.Types.ObjectId | string;
};

function sendUnauthorized(res: Response): void {
  sendErrorResponse(res, {
    statusCode: 401,
    code: 'auth/unauthorized',
    message: 'Unauthorized.',
  });
}

function sendUserNotFound(res: Response): void {
  sendErrorResponse(res, {
    statusCode: 404,
    code: 'resource/not-found',
    message: 'User not found.',
  });
}

function sendInvalidListId(res: Response): void {
  sendErrorResponse(res, {
    statusCode: 400,
    code: 'shoppingList/invalid-id',
    message: 'Invalid shopping list id.',
  });
}

function sendListNotFound(res: Response): void {
  sendErrorResponse(res, {
    statusCode: 404,
    code: 'shoppingList/not-found',
    message: 'Shopping list not found.',
  });
}

function sendForbidden(res: Response): void {
  sendErrorResponse(res, {
    statusCode: 403,
    code: 'shoppingList/forbidden',
    message: 'Forbidden.',
  });
}

function sendItemNotFound(res: Response): void {
  sendErrorResponse(res, {
    statusCode: 404,
    code: 'shoppingList/item-not-found',
    message: 'Shopping list item not found.',
  });
}

function sendFreeTierLimit(res: Response): void {
  res.status(403).json({
    success: false,
    code: 'shoppingList/free-tier-limit',
    message: 'Free tier users can only keep one active shopping list.',
    upgradeRequired: true,
  });
}

function formatZodErrors(err: ZodError) {
  return err.issues.map(issue => ({
    field: issue.path.join('.') || 'root',
    message: issue.message,
    ...(issue.code === 'too_small' && { minimum: (issue as { minimum?: number }).minimum }),
    ...(issue.code === 'too_big' && { maximum: (issue as { maximum?: number }).maximum }),
  }));
}

function sendValidationError(res: Response, err: ZodError): void {
  sendErrorResponse(res, {
    statusCode: 400,
    code: VALIDATION_ERROR_CODE,
    message: VALIDATION_ERROR_MESSAGE,
    errors: formatZodErrors(err),
  });
}

function getListIdParam(req: Request): string | undefined {
  return typeof req.params.listId === 'string' ? req.params.listId : undefined;
}

function getItemIdParam(req: Request): string | undefined {
  return typeof req.params.itemId === 'string' ? req.params.itemId : undefined;
}

function sortItemsByAddedAtDesc(items: IShoppingListItem[]): IShoppingListItem[] {
  return [...items].sort((left, right) => right.addedAt.getTime() - left.addedAt.getTime());
}

function serializeItem(item: IShoppingListItem): ShoppingListItem {
  return {
    itemId: item.itemId,
    name: item.name,
    ...(item.quantity !== undefined ? { quantity: item.quantity } : {}),
    checked: item.checked,
    addedAt: item.addedAt.toISOString(),
    source: item.source,
  };
}

function serializeSummary(list: ShoppingListRecord): ShoppingListSummary {
  return {
    id: String(list._id),
    name: list.name,
    isArchived: list.isArchived,
    createdAt: list.createdAt.toISOString(),
    updatedAt: list.updatedAt.toISOString(),
    totalItems: list.items.length,
    pendingItems: list.items.filter(item => !item.checked).length,
  };
}

function serializeDetail(list: ShoppingListRecord): ShoppingListDetail {
  return {
    ...serializeSummary(list),
    items: sortItemsByAddedAtDesc(list.items).map(serializeItem),
  };
}

async function getUserPlanContext(userId: string): Promise<{ isPro: boolean } | null> {
  const user = await UserModel.findById(userId).select({ isPro: 1 }).lean();

  if (!user) {
    return null;
  }

  return {
    isPro: user.isPro ?? false,
  };
}

async function getShoppingListRecord(listId: string): Promise<ShoppingListRecord | null> {
  const shoppingList = await ShoppingListModel.findById(listId).lean();

  return shoppingList as ShoppingListRecord | null;
}

function isOwnedByUser(list: ShoppingListRecord, userId: string): boolean {
  return String(list.userId) === userId;
}

function normalizeStoredItem(
  item: {
    itemId?: string;
    name: string;
    quantity?: string;
    checked: boolean;
    source: IShoppingListItem['source'];
  },
  existingItemsById: Map<string, IShoppingListItem>
): IShoppingListItem {
  const itemId = item.itemId?.trim();

  if (itemId && !itemId.startsWith('temp_')) {
    const existingItem = existingItemsById.get(itemId);

    if (existingItem) {
      return {
        itemId: existingItem.itemId,
        name: item.name,
        ...(item.quantity !== undefined ? { quantity: item.quantity } : {}),
        checked: item.checked,
        addedAt: existingItem.addedAt,
        source: item.source,
      };
    }
  }

  return {
    itemId: randomUUID(),
    name: item.name,
    ...(item.quantity !== undefined ? { quantity: item.quantity } : {}),
    checked: item.checked,
    addedAt: new Date(),
    source: item.source,
  };
}

export async function getLists(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    const user = await getUserPlanContext(userId);
    if (!user) {
      sendUserNotFound(res);
      return;
    }

    const activeLists = await ShoppingListModel.find({
      userId,
      isArchived: false,
    })
      .sort({ updatedAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      data: {
        lists: activeLists.map(list => serializeSummary(list as ShoppingListRecord)),
        canCreateMore: user.isPro || activeLists.length < 1,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getArchivedLists(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    const user = await getUserPlanContext(userId);
    if (!user) {
      sendUserNotFound(res);
      return;
    }

    const archivedLists = await ShoppingListModel.find({
      userId,
      isArchived: true,
    })
      .sort({ updatedAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      data: {
        lists: archivedLists.map(list => serializeSummary(list as ShoppingListRecord)),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getListById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    const listId = getListIdParam(req);
    if (!listId || !mongoose.isValidObjectId(listId)) {
      sendInvalidListId(res);
      return;
    }

    const shoppingList = await getShoppingListRecord(listId);
    if (!shoppingList) {
      sendListNotFound(res);
      return;
    }

    if (!isOwnedByUser(shoppingList, userId)) {
      sendForbidden(res);
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        shoppingList: serializeDetail(shoppingList),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function createList(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = createShoppingListSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }

    const userId = req.user?.sub;
    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    const user = await getUserPlanContext(userId);
    if (!user) {
      sendUserNotFound(res);
      return;
    }

    if (!user.isPro) {
      const activeCount = await ShoppingListModel.countDocuments({
        userId,
        isArchived: false,
      });

      if (activeCount >= 1) {
        sendFreeTierLimit(res);
        return;
      }
    }

    const shoppingList = await ShoppingListModel.create({
      userId,
      name: parsed.data.name,
      items: [],
      isArchived: false,
    });

    res.status(201).json({
      success: true,
      data: {
        shoppingList: serializeDetail(shoppingList.toObject() as ShoppingListRecord),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateList(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = updateShoppingListSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }

    const userId = req.user?.sub;
    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    const listId = getListIdParam(req);
    if (!listId || !mongoose.isValidObjectId(listId)) {
      sendInvalidListId(res);
      return;
    }

    const currentList = await getShoppingListRecord(listId);
    if (!currentList) {
      sendListNotFound(res);
      return;
    }

    if (!isOwnedByUser(currentList, userId)) {
      sendForbidden(res);
      return;
    }

    if (currentList.isArchived && parsed.data.isArchived === false) {
      const user = await getUserPlanContext(userId);
      if (!user) {
        sendUserNotFound(res);
        return;
      }

      if (!user.isPro) {
        const activeCount = await ShoppingListModel.countDocuments({
          userId,
          isArchived: false,
        });

        if (activeCount >= 1) {
          sendFreeTierLimit(res);
          return;
        }
      }
    }

    const updates: Partial<Pick<IShoppingList, 'name' | 'isArchived'>> = {};

    if (parsed.data.name !== undefined) {
      updates.name = parsed.data.name;
    }

    if (parsed.data.isArchived !== undefined) {
      updates.isArchived = parsed.data.isArchived;
    }

    if (Object.keys(updates).length === 0) {
      res.status(200).json({
        success: true,
        data: {
          shoppingList: serializeDetail(currentList),
        },
      });
      return;
    }

    const updatedList = await ShoppingListModel.findByIdAndUpdate(
      listId,
      {
        $set: updates,
      },
      {
        new: true,
        runValidators: true,
      }
    ).lean();

    if (!updatedList) {
      sendListNotFound(res);
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        shoppingList: serializeDetail(updatedList as ShoppingListRecord),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteList(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    const listId = getListIdParam(req);
    if (!listId || !mongoose.isValidObjectId(listId)) {
      sendInvalidListId(res);
      return;
    }

    const currentList = await getShoppingListRecord(listId);
    if (!currentList) {
      sendListNotFound(res);
      return;
    }

    if (!isOwnedByUser(currentList, userId)) {
      sendForbidden(res);
      return;
    }

    await ShoppingListModel.findByIdAndDelete(listId);

    res.status(200).json({
      success: true,
      data: {
        message: 'Shopping list deleted successfully.',
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateItems(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = updateItemsSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }

    const userId = req.user?.sub;
    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    const listId = getListIdParam(req);
    if (!listId || !mongoose.isValidObjectId(listId)) {
      sendInvalidListId(res);
      return;
    }

    const currentList = await getShoppingListRecord(listId);
    if (!currentList) {
      sendListNotFound(res);
      return;
    }

    if (!isOwnedByUser(currentList, userId)) {
      sendForbidden(res);
      return;
    }

    const existingItemsById = new Map(currentList.items.map(item => [item.itemId, item]));
    const items = parsed.data.map(item => normalizeStoredItem(item, existingItemsById));

    const updatedList = await ShoppingListModel.findByIdAndUpdate(
      listId,
      {
        $set: {
          items,
        },
      },
      {
        new: true,
        runValidators: true,
      }
    ).lean();

    if (!updatedList) {
      sendListNotFound(res);
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        shoppingList: serializeDetail(updatedList as ShoppingListRecord),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function toggleItemCheck(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    const listId = getListIdParam(req);
    if (!listId || !mongoose.isValidObjectId(listId)) {
      sendInvalidListId(res);
      return;
    }

    const itemId = getItemIdParam(req);
    if (!itemId) {
      sendItemNotFound(res);
      return;
    }

    const currentList = await getShoppingListRecord(listId);
    if (!currentList) {
      sendListNotFound(res);
      return;
    }

    if (!isOwnedByUser(currentList, userId)) {
      sendForbidden(res);
      return;
    }

    const currentItem = currentList.items.find(item => item.itemId === itemId);
    if (!currentItem) {
      sendItemNotFound(res);
      return;
    }

    const updatedList = await ShoppingListModel.findOneAndUpdate(
      {
        _id: listId,
        userId,
        'items.itemId': itemId,
      },
      {
        $set: {
          'items.$.checked': !currentItem.checked,
        },
      },
      {
        new: true,
        runValidators: true,
      }
    ).lean();

    if (!updatedList) {
      sendItemNotFound(res);
      return;
    }

    const updatedItem = (updatedList as ShoppingListRecord).items.find(item => item.itemId === itemId);
    if (!updatedItem) {
      sendItemNotFound(res);
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        item: serializeItem(updatedItem),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function clearCheckedItems(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    const listId = getListIdParam(req);
    if (!listId || !mongoose.isValidObjectId(listId)) {
      sendInvalidListId(res);
      return;
    }

    const currentList = await getShoppingListRecord(listId);
    if (!currentList) {
      sendListNotFound(res);
      return;
    }

    if (!isOwnedByUser(currentList, userId)) {
      sendForbidden(res);
      return;
    }

    const removedCount = currentList.items.filter(item => item.checked).length;
    const updatedList = await ShoppingListModel.findByIdAndUpdate(
      listId,
      {
        $pull: {
          items: {
            checked: true,
          },
        },
      },
      {
        new: true,
        runValidators: true,
      }
    ).lean();

    if (!updatedList) {
      sendListNotFound(res);
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        removedCount,
        shoppingList: serializeDetail(updatedList as ShoppingListRecord),
      },
    });
  } catch (err) {
    next(err);
  }
}
