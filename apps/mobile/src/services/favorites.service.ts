import axios from 'axios';
import type { PulseAiRecipe } from '@blendi/shared';

import { api } from '../config/api';
import { getApiErrorTranslationKey } from '../utils/error.utils';

interface ApiErrorResponse {
  success: false;
  code?: string;
  message?: string;
}

interface FavoriteMutationResponse {
  success: true;
  data?: {
    id?: string;
    favoriteId?: string;
    favorite?: {
      id?: string;
    };
  };
}

export interface ToggleFavoriteResult {
  isFavorited: boolean;
  favoriteId?: string;
}

const favoriteIdsByRecipeKey = new Map<string, string>();

export class FavoritesServiceError extends Error {
  constructor(
    message: string,
    public readonly translationKey: string,
    public readonly apiCode?: string
  ) {
    super(message);
    this.name = 'FavoritesServiceError';
  }
}

function normalizeRecipe(recipe: PulseAiRecipe) {
  return {
    title: recipe.title,
    ingredients: recipe.ingredients.map((ingredient) => ({
      name: ingredient.name,
      amount: ingredient.amount,
    })),
    macros: recipe.macros,
    prepTimeSeconds: recipe.prepTimeSeconds,
    blendInstruction: recipe.blendInstruction,
    tip: recipe.tip ?? '',
    hasSubstitutes: recipe.hasSubstitutes,
  };
}

function hashValue(value: string): string {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }

  return Math.abs(hash).toString(36);
}

function extractFavoriteId(data?: FavoriteMutationResponse['data']): string | undefined {
  const rawFavoriteId = data?.favoriteId ?? data?.id ?? data?.favorite?.id;

  if (!rawFavoriteId) {
    return undefined;
  }

  const normalizedFavoriteId = rawFavoriteId.trim();
  return normalizedFavoriteId.length > 0 ? normalizedFavoriteId : undefined;
}

function toFavoritesServiceError(error: unknown): FavoritesServiceError {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    const apiCode = error.response?.data?.code;
    return new FavoritesServiceError(
      error.response?.data?.message ?? error.message,
      getApiErrorTranslationKey(apiCode),
      apiCode,
    );
  }

  return new FavoritesServiceError(
    'Unexpected favorites service error.',
    'recipes.favorites.toggle_error',
  );
}

export function getRecipeFavoriteKey(recipe: PulseAiRecipe): string {
  return `pulse-ai-${hashValue(JSON.stringify(normalizeRecipe(recipe)))}`;
}

export async function toggleFavorite(recipe: PulseAiRecipe): Promise<ToggleFavoriteResult> {
  const recipeKey = getRecipeFavoriteKey(recipe);
  const favoriteId = favoriteIdsByRecipeKey.get(recipeKey);

  try {
    if (favoriteId) {
      await api.delete(`/favorites/${encodeURIComponent(favoriteId)}`);
      favoriteIdsByRecipeKey.delete(recipeKey);
      return { isFavorited: false };
    }

    const response = await api.post<FavoriteMutationResponse>('/favorites', recipe);
    const nextFavoriteId = extractFavoriteId(response.data.data) ?? recipeKey;

    favoriteIdsByRecipeKey.set(recipeKey, nextFavoriteId);

    return {
      isFavorited: true,
      favoriteId: nextFavoriteId,
    };
  } catch (error) {
    throw toFavoritesServiceError(error);
  }
}