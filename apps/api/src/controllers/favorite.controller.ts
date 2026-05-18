import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { createFavoriteSchema, type FavoriteItem } from '@blendi/shared';
import { FavoriteModel, type IFavorite } from '../models/Favorite';
import { UserModel } from '../models/User';
import { sendErrorResponse, VALIDATION_ERROR_MESSAGE } from '../utils/error.utils';

type FavoriteRecord = IFavorite & {
  _id: mongoose.Types.ObjectId | string;
};

function sendUnauthorized(res: Response): void {
  sendErrorResponse(res, {
    statusCode: 401,
    code: 'auth/unauthorized',
    message: 'Unauthorized.',
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

function sendFavoriteValidationError(res: Response, err: ZodError): void {
  sendErrorResponse(res, {
    statusCode: 400,
    code: 'favorites/invalid-data',
    message: VALIDATION_ERROR_MESSAGE,
    errors: formatZodErrors(err),
  });
}

function parseLimit(limitParam: unknown): number | undefined {
  const rawLimit = Array.isArray(limitParam) ? limitParam[0] : limitParam;

  if (typeof rawLimit !== 'string' && typeof rawLimit !== 'number') {
    return undefined;
  }

  const parsedLimit = typeof rawLimit === 'number' ? rawLimit : Number(rawLimit);

  if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) {
    return undefined;
  }

  return parsedLimit;
}

function serializeFavorite(favorite: FavoriteRecord): FavoriteItem {
  return {
    id: String(favorite._id),
    recipeName: favorite.recipeName,
    ingredients: favorite.ingredients.map(ingredient => ({
      name: ingredient.name,
      amount: ingredient.amount,
    })),
    protein: favorite.protein,
    carbs: favorite.carbs,
    fat: favorite.fat,
    calories: favorite.calories,
    prepTimeSeconds: favorite.prepTimeSeconds,
    blendInstruction: favorite.blendInstruction,
    tip: favorite.tip,
    hasSubstitutes: favorite.hasSubstitutes,
    blendiModel: favorite.blendiModel,
    goal: favorite.goal,
    createdAt: favorite.createdAt.toISOString(),
  };
}

function isDuplicateKeyError(err: unknown): err is { code: number } {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 11000;
}

export async function getFavorites(
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

    const query = { userId };
    const limit = parseLimit(req.query.limit);
    const favoritesQuery = FavoriteModel.find(query).sort({ createdAt: -1 }).lean();

    if (limit !== undefined) {
      favoritesQuery.limit(limit);
    }

    const [favorites, total] = await Promise.all([
      favoritesQuery,
      FavoriteModel.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: {
        favorites: favorites.map(favorite => serializeFavorite(favorite as FavoriteRecord)),
        total,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function addFavorite(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = createFavoriteSchema.safeParse(req.body);
    if (!parsed.success) {
      sendFavoriteValidationError(res, parsed.error);
      return;
    }

    const userId = req.user?.sub;
    if (!userId) {
      sendUnauthorized(res);
      return;
    }

    const user = await UserModel.findById(userId).lean();
    if (!user) {
      sendErrorResponse(res, {
        statusCode: 404,
        code: 'resource/not-found',
        message: 'User not found.',
      });
      return;
    }

    const existingFavorite = await FavoriteModel.findOne({
      userId,
      recipeName: parsed.data.recipeName,
    }).lean();

    if (existingFavorite) {
      res.status(200).json({
        success: true,
        data: {
          favorite: serializeFavorite(existingFavorite as FavoriteRecord),
          alreadyExists: true,
        },
      });
      return;
    }

    try {
      const favorite = await FavoriteModel.create({
        userId,
        ...parsed.data,
        blendiModel: user.blendiModel,
        goal: user.goal,
      });

      res.status(201).json({
        success: true,
        data: {
          favorite: serializeFavorite(favorite.toObject() as FavoriteRecord),
          alreadyExists: false,
        },
      });
      return;
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        const duplicatedFavorite = await FavoriteModel.findOne({
          userId,
          recipeName: parsed.data.recipeName,
        }).lean();

        if (duplicatedFavorite) {
          res.status(200).json({
            success: true,
            data: {
              favorite: serializeFavorite(duplicatedFavorite as FavoriteRecord),
              alreadyExists: true,
            },
          });
          return;
        }
      }

      throw err;
    }
  } catch (err) {
    next(err);
  }
}

export async function removeFavorite(
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

    const favoriteId = req.params.id;
    if (!mongoose.isValidObjectId(favoriteId)) {
      sendErrorResponse(res, {
        statusCode: 400,
        code: 'favorites/invalid-id',
        message: 'Invalid favorite id.',
      });
      return;
    }

    const favorite = await FavoriteModel.findOne({ _id: favoriteId });
    if (!favorite) {
      sendErrorResponse(res, {
        statusCode: 404,
        code: 'favorites/not-found',
        message: 'Favorite not found.',
      });
      return;
    }

    if (String(favorite.userId) !== userId) {
      sendErrorResponse(res, {
        statusCode: 403,
        code: 'favorites/forbidden',
        message: 'Forbidden.',
      });
      return;
    }

    await favorite.deleteOne();

    res.status(200).json({
      success: true,
      data: {
        message: 'Favorite removed successfully.',
      },
    });
  } catch (err) {
    next(err);
  }
}