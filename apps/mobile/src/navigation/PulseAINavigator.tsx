// apps/mobile/src/navigation/PulseAINavigator.tsx
// Stack navigator para o fluxo Pulse AI: chat + favoritos + pantry scanner.

import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { PulseAIScreen } from '../screens/PulseAIScreen';
import { FavoritesListScreen as FavoritesScreen } from '../screens/FavoritesListScreen';
import { PantryScannerScreen } from '../screens/PantryScannerScreen';
import { ConversationHistoryScreen } from '../screens/ConversationHistoryScreen';
import type { PulseAIStackParamList } from './types';

const Stack = createNativeStackNavigator<PulseAIStackParamList>();

export function PulseAINavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="PulseAIChat" component={PulseAIScreen} />
      <Stack.Screen name="Favorites" component={FavoritesScreen} />
      <Stack.Screen name="PantryScanner" component={PantryScannerScreen} />
      <Stack.Screen name="ConversationHistory" component={ConversationHistoryScreen} />
    </Stack.Navigator>
  );
}
