import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { fontSizes, fonts, spacing } from '@blendi/shared';
import { useColors } from '../hooks/useColors';
import { useAuthStore } from '../store/auth.store';
import { AppNavigator } from './AppNavigator';
import { AuthNavigator } from './AuthNavigator';
import { OnboardingNavigator } from './OnboardingNavigator';
import { UpgradeScreen } from '../screens/UpgradeScreen';
import { WeeklyReportScreen } from '../screens/WeeklyReportScreen';
import type { RootStackParamList } from './types';

const RootStack = createNativeStackNavigator<RootStackParamList>();

function NavigationSplashScreen() {
  const colors = useColors();

  const splashStyles = StyleSheet.create({
    splashScreen: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing['2xl'],
      padding: spacing['4xl'],
      backgroundColor: colors.background.primary,
    },
    splashTitle: {
      color: colors.text.primary,
      fontFamily: fonts.display,
      fontSize: fontSizes['3xl'],
    },
  });

  return (
    <View style={splashStyles.splashScreen}>
      <Text style={splashStyles.splashTitle}>BLENDi Pulse</Text>
      <ActivityIndicator size="large" color={colors.brand.pulse} />
    </View>
  );
}

export function RootNavigator() {
  const colors = useColors();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isNewUser = useAuthStore((state) => state.isNewUser);
  const isRestoringSession = useAuthStore((state) => state.isRestoringSession);

  if (isRestoringSession) {
    return <NavigationSplashScreen />;
  }

  const styles = StyleSheet.create({
    navigatorContent: {
      backgroundColor: colors.background.primary,
    },
  });

  return (
    <RootStack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: styles.navigatorContent,
      }}
    >
      {isAuthenticated ? isNewUser ? (
        <RootStack.Screen name="OnboardingFlow" component={OnboardingNavigator} />
      ) : (
        <>
          <RootStack.Screen name="AppFlow" component={AppNavigator} />
          <RootStack.Screen name="Upgrade" component={UpgradeScreen} />
          <RootStack.Screen name="WeeklyReport" component={WeeklyReportScreen} />
        </>
      ) : (
        <RootStack.Screen name="AuthFlow" component={AuthNavigator} />
      )}
    </RootStack.Navigator>
  );
}