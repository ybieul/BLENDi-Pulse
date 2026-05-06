import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { OnboardingModelScreen } from '../screens/onboarding/OnboardingModelScreen';
import { OnboardingGoalScreen } from '../screens/onboarding/OnboardingGoalScreen';
import { OnboardingBodyScreen } from '../screens/onboarding/OnboardingBodyScreen';
import { OnboardingMacrosScreen } from '../screens/onboarding/OnboardingMacrosScreen';
import type { OnboardingStackParamList } from './types';

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

export function OnboardingNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="OnboardingModel"
      screenOptions={{
        headerShown: false,
        animation: 'fade',
      }}
    >
      <Stack.Screen name="OnboardingModel" component={OnboardingModelScreen} />
      <Stack.Screen name="OnboardingGoal" component={OnboardingGoalScreen} />
      <Stack.Screen name="OnboardingBody" component={OnboardingBodyScreen} />
      <Stack.Screen name="OnboardingMacros" component={OnboardingMacrosScreen} />
    </Stack.Navigator>
  );
}
