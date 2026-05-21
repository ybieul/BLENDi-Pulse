import { useMutation, useQuery } from '@tanstack/react-query';
import type { PulseAiRecipe } from '@blendi/shared';

import { CACHE_CONFIG, QUERY_KEYS } from '../config/cache.config';
import { queryClient } from '../config/queryClient';
import {
  addFavorite,
  getFavorites,
  removeFavorite,
  type AddFavoriteResult,
  type FavoritesServiceError,
} from '../services/favorites.service';

export function useFavorites() {
  const query = useQuery({
    queryKey: QUERY_KEYS.favorites,
    queryFn: getFavorites,
    staleTime: CACHE_CONFIG.FAVORITES_TTL,
  });

  return {
    favorites: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    dataUpdatedAt: query.dataUpdatedAt,
  };
}

export function useAddFavorite() {
  return useMutation<AddFavoriteResult, FavoritesServiceError, PulseAiRecipe>({
    mutationFn: addFavorite,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.favorites });
    },
  });
}

export function useRemoveFavorite() {
  return useMutation<void, FavoritesServiceError, string>({
    mutationFn: removeFavorite,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.favorites });
    },
  });
}