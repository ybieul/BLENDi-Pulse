import type { ComponentProps } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { HomeScreen } from '../screens/HomeScreen';
import { MeScreen } from '../screens/MeScreen';
import { PulseAIScreen } from '../screens/PulseAIScreen';

import {
  borderRadius,
  colors,
  fontSizes,
  fonts,
  fontWeights,
  spacing,
} from '@blendi/shared';
import { useAppTranslation } from '../hooks/useAppTranslation';
import type { AppTabParamList } from './types';

const Tab = createBottomTabNavigator<AppTabParamList>();

type IoniconName = ComponentProps<typeof Ionicons>['name'];

const TAB_ICONS: Record<keyof AppTabParamList, { active: IoniconName; inactive: IoniconName }> = {
  Home: { active: 'home', inactive: 'home-outline' },
  PulseAI: { active: 'chatbubble-ellipses', inactive: 'chatbubble-ellipses-outline' },
  Blend: { active: 'flash', inactive: 'flash-outline' },
  Track: { active: 'analytics', inactive: 'analytics-outline' },
  Me: { active: 'person', inactive: 'person-outline' },
};

const TAB_LABELS = {
  Home: 'navigation.home',
  PulseAI: 'navigation.pulseAI',
  Blend: 'navigation.blend',
  Track: 'navigation.track',
  Me: 'navigation.me',
} as const;

function AppPlaceholderScreen({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{title}</Text>
      {children}
    </View>
  );
}

function BlendScreen() {
  return <AppPlaceholderScreen title="Blend" />;
}

function TrackScreen() {
  return <AppPlaceholderScreen title="Track" />;
}

export function AppNavigator() {
  const { t } = useAppTranslation();

  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={({ route }) => {
        const isBlendTab = route.name === 'Blend';
        const iconNames = TAB_ICONS[route.name];

        return {
          headerShown: false,
          tabBarActiveTintColor: colors.brand.pulse,
          tabBarInactiveTintColor: colors.text.tertiary,
          tabBarStyle: styles.tabBar,
          tabBarItemStyle: styles.tabItem,
          tabBarLabelStyle: styles.tabBarLabel,
          tabBarHideOnKeyboard: true,
          tabBarLabel: t(TAB_LABELS[route.name]),
          tabBarIcon: ({ color, focused, size }) => {
            const iconName = focused ? iconNames.active : iconNames.inactive;

            if (isBlendTab) {
              return (
                <View style={[styles.blendIconShell, { borderColor: color }]}>
                  <Ionicons name={iconName} size={size + 10} color={color} />
                </View>
              );
            }

            return <Ionicons name={iconName} size={size} color={color} />;
          },
        };
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="PulseAI" component={PulseAIScreen} />
      <Tab.Screen name="Blend" component={BlendScreen} />
      <Tab.Screen name="Track" component={TrackScreen} />
      <Tab.Screen name="Me" component={MeScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['3xl'],
    backgroundColor: colors.background.primary,
  },
  title: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: fontSizes['2xl'],
  },
  tabBar: {
    height: 88,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.background.secondary,
    backgroundColor: colors.background.primary,
  },
  tabItem: {
    paddingVertical: spacing.sm,
  },
  tabBarLabel: {
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },
  blendIconShell: {
    minWidth: 56,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.full,
    borderWidth: 1,
    backgroundColor: colors.background.secondary,
    marginTop: -6,
  },
});