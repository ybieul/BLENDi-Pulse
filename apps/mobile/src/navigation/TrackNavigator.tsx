// apps/mobile/src/navigation/TrackNavigator.tsx
// Stack navigator do fluxo Track: tela principal + gerenciamento de stack.

import { useCallback } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { CACHE_CONFIG, QUERY_KEYS } from '../config/cache.config';
import {
  getStack,
  updateStack,
} from '../services/supplementStack.service';
import type { SupplementStackItem } from '../services/supplementStack.service';
import { TrackScreen } from '../screens/TrackScreen';
import { ManageStackScreen } from '../screens/ManageStackScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { ShoppingListsScreen } from '../screens/ShoppingListsScreen';
import { ShoppingListDetailScreen } from '../screens/ShoppingListDetailScreen';
import type { NewSupplementFormData } from '../screens/ManageStackScreen';
import type { TrackStackParamList } from './types';

const Stack = createNativeStackNavigator<TrackStackParamList>();

// Wrapper que conecta ManageStackScreen ao React Query.
// A lógica de persistência (PUT /supplement-stack) fica aqui, não dentro do
// componente de UI.
function ManageStackRoute() {
  const queryClient = useQueryClient();

  const { data: supplementStack } = useQuery({
    queryKey: QUERY_KEYS.supplementStack,
    queryFn: getStack,
    staleTime: CACHE_CONFIG.SUPPLEMENT_STACK_TTL,
  });

  const { mutate: mutateUpdateStack } = useMutation({
    mutationFn: (newStack: SupplementStackItem[]) => updateStack(newStack),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.supplementStack });
    },
  });

  const handleAdd = useCallback(
    (data: NewSupplementFormData) => {
      const current = supplementStack ?? [];
      const newItem: SupplementStackItem = {
        supplementId: '',
        name: data.name,
        dosage: data.dosage,
        dailyTargetCount: data.dailyTargetCount,
        timing: data.timing,
        isActive: true,
        order: current.length,
        checkedToday: false,
        checkedAt: null,
      };
      mutateUpdateStack([...current, newItem]);
    },
    [supplementStack, mutateUpdateStack],
  );

  const handleDelete = useCallback(
    (supplementId: string) => {
      const current = supplementStack ?? [];
      mutateUpdateStack(current.filter((item) => item.supplementId !== supplementId));
    },
    [supplementStack, mutateUpdateStack],
  );

  const handleToggleActive = useCallback(
    (supplementId: string, isActive: boolean) => {
      const current = supplementStack ?? [];
      mutateUpdateStack(
        current.map((item) =>
          item.supplementId === supplementId ? { ...item, isActive } : item,
        ),
      );
    },
    [supplementStack, mutateUpdateStack],
  );

  return (
    <ManageStackScreen
      supplements={supplementStack ?? []}
      onAdd={handleAdd}
      onDelete={handleDelete}
      onToggleActive={handleToggleActive}
    />
  );
}

export function TrackNavigator() {
  return (
    <Stack.Navigator initialRouteName="TrackMain" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="TrackMain" component={TrackScreen} />
      <Stack.Screen name="ManageStack" component={ManageStackRoute} />
      <Stack.Screen name="History" component={HistoryScreen} />
      <Stack.Screen name="ShoppingLists" component={ShoppingListsScreen} />
      <Stack.Screen name="ShoppingListDetail" component={ShoppingListDetailScreen} />
    </Stack.Navigator>
  );
}
