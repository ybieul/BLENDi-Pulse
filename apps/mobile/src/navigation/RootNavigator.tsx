import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { colors, fontSizes, fonts, spacing } from '@blendi/shared';
import { useAuthStore } from '../store/auth.store';
import { AppNavigator } from './AppNavigator';
import { AuthNavigator } from './AuthNavigator';

type RootStackParamList = {
  AuthFlow: undefined;
  AppFlow: undefined;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();

function NavigationSplashScreen() {
  return (
    <View style={styles.splashScreen}>
      <Text style={styles.splashTitle}>BLENDi Pulse</Text>
      <ActivityIndicator size="large" color={colors.brand.pulse} />
    </View>
  );
}

export function RootNavigator() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isRestoringSession = useAuthStore((state) => state.isRestoringSession);

  if (isRestoringSession) {
    return <NavigationSplashScreen />;
  }

  return (
    <RootStack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: styles.navigatorContent,
      }}
    >
      {isAuthenticated ? (
        <RootStack.Screen name="AppFlow" component={AppNavigator} />
      ) : (
        <RootStack.Screen name="AuthFlow" component={AuthNavigator} />
      )}
    </RootStack.Navigator>
  );
}

const styles = StyleSheet.create({
  navigatorContent: {
    backgroundColor: colors.background.primary,
  },
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