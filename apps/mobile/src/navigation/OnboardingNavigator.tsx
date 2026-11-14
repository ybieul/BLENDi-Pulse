import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { OnboardingModelScreen } from '../screens/onboarding/OnboardingModelScreen';
import { OnboardingGoalScreen } from '../screens/onboarding/OnboardingGoalScreen';
import { OnboardingDietScreen } from '../screens/onboarding/OnboardingDietScreen';
import { OnboardingBodyScreen } from '../screens/onboarding/OnboardingBodyScreen';
import { OnboardingMacrosScreen } from '../screens/onboarding/OnboardingMacrosScreen';
import { OnboardingBuildingPlanScreen } from '../screens/onboarding/OnboardingBuildingPlanScreen';
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
      <Stack.Screen name="OnboardingDiet" component={OnboardingDietScreen} />
      <Stack.Screen name="OnboardingBody" component={OnboardingBodyScreen} />
      <Stack.Screen name="OnboardingMacros" component={OnboardingMacrosScreen} />
      {/* Fora do indicador de passos (continua "5 passos"). Sem gesto de
          voltar no iOS; o botão voltar do Android é bloqueado na tela. */}
      <Stack.Screen
        name="OnboardingBuildingPlan"
        component={OnboardingBuildingPlanScreen}
        options={{ gestureEnabled: false }}
      />
    </Stack.Navigator>
  );
}
