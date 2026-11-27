import type { ComponentProps } from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BlendScreen } from '../screens/BlendScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { MeScreen } from '../screens/MeScreen';
import { TutorialProvider } from '../features/tutorial/TutorialProvider';
import { PulseAINavigator } from './PulseAINavigator';
import { TrackNavigator } from './TrackNavigator';

import {
  borderRadius,
  fontSizes,
  fonts,
  fontWeights,
} from '@blendi/shared';
import { useAppTranslation } from '../hooks/useAppTranslation';
import { useColors } from '../hooks/useColors';
import type { AppTabParamList } from './types';
import {
  BLEND_ICON_SIZE,
  BLEND_SHELL_SIZE,
  getTabBarMetrics,
  TAB_BAR_PADDING_TOP,
  TAB_ITEM_PADDING_VERTICAL,
} from './tabBarMetrics';

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

export function AppNavigator() {
  const colors = useColors();
  const { t } = useAppTranslation();
  const insets = useSafeAreaInsets();
  const metrics = getTabBarMetrics(insets.bottom);

  const styles = StyleSheet.create({
    tabBar: {
      height: metrics.height,
      paddingTop: TAB_BAR_PADDING_TOP,
      paddingBottom: metrics.paddingBottom,
      borderTopWidth: 1,
      borderTopColor: colors.background.secondary,
      backgroundColor: colors.background.primary,
    },
    tabItem: {
      paddingVertical: TAB_ITEM_PADDING_VERTICAL,
    },
    tabBarLabel: {
      fontFamily: fonts.body,
      fontSize: fontSizes.xs,
      fontWeight: fontWeights.medium,
    },
    blendIconBox: metrics.blendIconBox,
    blendIconShell: {
      width: BLEND_SHELL_SIZE,
      height: BLEND_SHELL_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.full,
      borderWidth: 1,
      backgroundColor: colors.background.secondary,
    },
  });

  // CP-C2: o tutorial guiado fica na raiz do AppFlow, por cima das abas.
  return (
    <TutorialProvider>
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
            // O item inteiro (coluna ícone + rótulo, ≥ 44 pt) continua sendo a
            // área de toque; o leitor de tela lê o rótulo da aba ("Blend").
            tabBarAccessibilityLabel: t(TAB_LABELS[route.name]),
            ...(isBlendTab && { tabBarIconStyle: styles.blendIconBox }),
            tabBarIcon: ({ color, focused, size }) => {
              const iconName = focused ? iconNames.active : iconNames.inactive;

              if (isBlendTab) {
                return (
                  <View
                    style={[styles.blendIconShell, { borderColor: color }]}
                    testID={focused ? 'tab-blend-shell-active' : 'tab-blend-shell'}
                  >
                    <Ionicons name={iconName} size={BLEND_ICON_SIZE} color={color} />
                  </View>
                );
              }

              return <Ionicons name={iconName} size={size} color={color} />;
            },
          };
        }}
      >
        <Tab.Screen name="Home" component={HomeScreen} />
        <Tab.Screen name="PulseAI" component={PulseAINavigator} />
        <Tab.Screen name="Blend" component={BlendScreen} />
        <Tab.Screen name="Track" component={TrackNavigator} />
        <Tab.Screen name="Me" component={MeScreen} />
      </Tab.Navigator>
    </TutorialProvider>
  );
}