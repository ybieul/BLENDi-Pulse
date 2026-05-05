import type { ComponentProps } from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import {
  borderRadius,
  colors,
  fontSizes,
  fonts,
  fontWeights,
  spacing,
} from '@blendi/shared';
import { useAppTranslation } from '../hooks/useAppTranslation';
import { useAuthStore } from '../store/auth.store';
import type { AppTabParamList } from './types';

const Tab = createBottomTabNavigator<AppTabParamList>();

type IoniconName = ComponentProps<typeof Ionicons>['name'];

const TAB_ICONS: Record<keyof AppTabParamList, { active: IoniconName; inactive: IoniconName }> = {
  Home: { active: 'home', inactive: 'home-outline' },
  Recipes: { active: 'restaurant', inactive: 'restaurant-outline' },
  Blend: { active: 'flash', inactive: 'flash-outline' },
  Track: { active: 'analytics', inactive: 'analytics-outline' },
  Me: { active: 'person', inactive: 'person-outline' },
};

const TAB_LABELS = {
  Home: 'navigation.home',
  Recipes: 'navigation.recipes',
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

function HomeScreen() {
  return <AppPlaceholderScreen title="Home" />;
}

function RecipesScreen() {
  return <AppPlaceholderScreen title="Recipes" />;
}

function BlendScreen() {
  return <AppPlaceholderScreen title="Blend" />;
}

function TrackScreen() {
  return <AppPlaceholderScreen title="Track" />;
}

function MeScreen() {
  const { t, locale, changeLocale } = useAppTranslation();
  const logout = useAuthStore((state) => state.logout);

  return (
    <AppPlaceholderScreen title="Me">
      <Text style={styles.subtitle}>{`${t('profile.language.label')}: ${locale}`}</Text>

      <View style={styles.languageActions}>
        <Pressable onPress={() => void changeLocale('en')} style={styles.languageButton}>
          <Text style={styles.languageButtonLabel}>{t('profile.language.en')}</Text>
        </Pressable>

        <Pressable onPress={() => void changeLocale('pt-BR')} style={styles.languageButton}>
          <Text style={styles.languageButtonLabel}>{t('profile.language.pt_BR')}</Text>
        </Pressable>

        {__DEV__ ? (
          <Pressable onPress={() => void logout()} style={styles.languageButton}>
            <Text style={styles.languageButtonLabel}>Dev: reset session</Text>
          </Pressable>
        ) : null}
      </View>
    </AppPlaceholderScreen>
  );
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
                  <Ionicons name={iconName} size={size + 8} color={color} />
                </View>
              );
            }

            return <Ionicons name={iconName} size={size} color={color} />;
          },
        };
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Recipes" component={RecipesScreen} />
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
  subtitle: {
    marginTop: spacing.lg,
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    textAlign: 'center',
  },
  languageActions: {
    width: '100%',
    marginTop: spacing['3xl'],
    gap: spacing.md,
  },
  languageButton: {
    width: '100%',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background.secondary,
  },
  languageButtonLabel: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.medium,
    textAlign: 'center',
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
    minWidth: 52,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.full,
    borderWidth: 1,
    backgroundColor: colors.background.secondary,
    marginTop: -4,
  },
});