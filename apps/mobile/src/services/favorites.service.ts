import axios, { type AxiosError } from 'axios';
import type { CreateFavoriteInput, FavoriteItem, PulseAiRecipe } from '@blendi/shared';

import { api } from '../config/api';
import { getApiErrorTranslationKey } from '../utils/error.utils';

interface ApiErrorResponse {
  success: false;
  code?: string;
  message?: string;
}

interface FavoritesListResponse {
  success: true;
  data: {
    favorites: FavoriteItem[];
    total: number;
  };
}

interface FavoriteMutationResponse {
  success: true;
  data: {
    favorite: FavoriteItem;
    alreadyExists: boolean;
  };
}

interface FavoriteRemovalResponse {
  success: true;
  data: {
    message: string;
  };
}

const favoriteIdsByRecipeKey = new Map<string, string>();

const FAVORITES_ERROR_TRANSLATION_KEYS = {
  'favorites/invalid-data': 'errors.favorites_invalid_data',
  'favorites/not-found': 'errors.favorites_not_found',
  'favorites/forbidden': 'errors.favorites_forbidden',
} as const;

export interface AddFavoriteResult {
  favorite: FavoriteItem;
  alreadyExists: boolean;
}

export interface ToggleFavoriteResult {
  isFavorited: boolean;
  favoriteId?: string;
}

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

function mapRecipeToFavoriteInput(recipe: PulseAiRecipe): CreateFavoriteInput {
  const normalizedTip = recipe.tip?.trim();

  return {
    recipeName: recipe.title.trim(),
    ingredients: recipe.ingredients.map((ingredient) => ({
      name: ingredient.name,
      amount: ingredient.amount,
    })),
    protein: recipe.macros.protein,
    carbs: recipe.macros.carbs,
    fat: recipe.macros.fat,
    calories: recipe.macros.calories,
    prepTimeSeconds: recipe.prepTimeSeconds,
    blendInstruction: recipe.blendInstruction,
    ...(normalizedTip ? { tip: normalizedTip } : {}),
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

function getFavoriteItemKey(favorite: FavoriteItem): string {
  return `pulse-ai-${hashValue(JSON.stringify({
    recipeName: favorite.recipeName,
    ingredients: favorite.ingredients.map((ingredient) => ({
      name: ingredient.name,
      amount: ingredient.amount,
    })),
    protein: favorite.protein,
    carbs: favorite.carbs,
    fat: favorite.fat,
    calories: favorite.calories,
    prepTimeSeconds: favorite.prepTimeSeconds,
    blendInstruction: favorite.blendInstruction,
    tip: favorite.tip ?? '',
    hasSubstitutes: favorite.hasSubstitutes,
  }))}`;
}

function syncFavoriteIdsByRecipeKey(favorites: FavoriteItem[]): void {
  favoriteIdsByRecipeKey.clear();

  favorites.forEach((favorite) => {
    favoriteIdsByRecipeKey.set(getFavoriteItemKey(favorite), favorite.id);
  });
}

function removeFavoriteIdMapping(favoriteId: string): void {
  for (const [recipeKey, storedFavoriteId] of favoriteIdsByRecipeKey.entries()) {
    if (storedFavoriteId === favoriteId) {
      favoriteIdsByRecipeKey.delete(recipeKey);
      return;
    }
  }
}

function getFavoritesErrorTranslationKey(apiCode?: string): string {
  const normalizedCode = apiCode?.trim().toLowerCase();

  if (normalizedCode && normalizedCode in FAVORITES_ERROR_TRANSLATION_KEYS) {
    return FAVORITES_ERROR_TRANSLATION_KEYS[
      normalizedCode as keyof typeof FAVORITES_ERROR_TRANSLATION_KEYS
    ];
  }

  return getApiErrorTranslationKey(apiCode);
}

function mapFavoritesErrorTranslationKey(error: AxiosError<ApiErrorResponse>): string {
  if (error.code === 'ECONNABORTED') {
    return 'errors.network.timeout';
  }

  if (!error.response) {
    return 'errors.network.offline';
  }

  return getFavoritesErrorTranslationKey(error.response.data?.code);
}

function toFavoritesServiceError(error: unknown): FavoritesServiceError {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    const apiCode = error.response?.data?.code;
    return new FavoritesServiceError(
      error.response?.data?.message ?? error.message,
      mapFavoritesErrorTranslationKey(error),
      apiCode,
    );
  }

  return new FavoritesServiceError(
    'Unexpected favorites service error.',
    'errors.network_internal_server_error',
  );
}

export function getRecipeFavoriteKey(recipe: PulseAiRecipe): string {
  return `pulse-ai-${hashValue(JSON.stringify({
    ...mapRecipeToFavoriteInput(recipe),
    tip: recipe.tip?.trim() ?? '',
  }))}`;
}

export async function getFavorites(): Promise<FavoriteItem[]> {
  try {
    const response = await api.get<FavoritesListResponse>('/favorites');
    syncFavoriteIdsByRecipeKey(response.data.data.favorites);
    return response.data.data.favorites;
  } catch (error) {
    throw toFavoritesServiceError(error);
  }
}

export async function addFavorite(recipe: PulseAiRecipe): Promise<AddFavoriteResult> {
  try {
    const response = await api.post<FavoriteMutationResponse>(
      '/favorites',
      mapRecipeToFavoriteInput(recipe),
    );

    favoriteIdsByRecipeKey.set(getRecipeFavoriteKey(recipe), response.data.data.favorite.id);

    return response.data.data;
  } catch (error) {
    throw toFavoritesServiceError(error);
  }
}

export async function removeFavorite(id: string): Promise<void> {
  try {
    await api.delete<FavoriteRemovalResponse>(`/favorites/${encodeURIComponent(id)}`);
    removeFavoriteIdMapping(id);
  } catch (error) {
    throw toFavoritesServiceError(error);
  }
}

export async function toggleFavorite(recipe: PulseAiRecipe): Promise<ToggleFavoriteResult> {
  const recipeKey = getRecipeFavoriteKey(recipe);
  const favoriteId = favoriteIdsByRecipeKey.get(recipeKey);

  if (favoriteId) {
    await removeFavorite(favoriteId);

    return { isFavorited: false };
  }

  const result = await addFavorite(recipe);

  return {
    isFavorited: true,
    favoriteId: result.favorite.id,
  };
}