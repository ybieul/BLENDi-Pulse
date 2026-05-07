import { type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '@blendi/shared';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { AuroraBackground } from './AuroraBackground';
import { AuthProgressDots } from './AuthProgressDots';

const TOTAL_STEPS = 4;
const FOOTER_HORIZONTAL_PADDING = spacing['3xl'];
const FOOTER_VERTICAL_PADDING = spacing['5xl'];
const TOP_HORIZONTAL_PADDING = spacing['3xl'];
const TOP_PADDING = spacing['4xl'];
const BACK_BUTTON_SIZE = 40;
const BACK_BUTTON_TOP_OFFSET = spacing.md;

type RootStackParamList = {
  AuthFlow: undefined;
  OnboardingFlow: undefined;
  AppFlow: undefined;
};

type RootParentNavigation = {
  reset: (state: {
    index: number;
    routes: Array<{ name: keyof RootStackParamList }>;
  }) => void;
};

type OnboardingLayoutNavigation = {
  getParent: () => RootParentNavigation | undefined;
  canGoBack: () => boolean;
  goBack: () => void;
};

export interface OnboardingLayoutProps {
  step: 1 | 2 | 3 | 4;
  topContent: ReactNode;
  bottomContent: ReactNode;
  onBack?: () => void;
}

export function OnboardingLayout({
  step,
  topContent,
  bottomContent,
  onBack,
}: OnboardingLayoutProps) {
  const navigation: OnboardingLayoutNavigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { t } = useAppTranslation();

  const handleGoBack = () => {
    if (onBack) {
      onBack();
      return;
    }

    if (step === 1) {
      const parentNavigation = navigation.getParent();
      if (parentNavigation) {
        parentNavigation.reset({
          index: 0,
          routes: [{ name: 'AuthFlow' }],
        });
        return;
      }
    }

    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoidingView}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.screen}>
        <View style={StyleSheet.absoluteFillObject}>
          <AuroraBackground />
        </View>

        <Pressable
          onPress={handleGoBack}
          style={[styles.backButton, { top: insets.top + BACK_BUTTON_TOP_OFFSET }]}
          accessibilityRole="button"
          accessibilityLabel={t('common.actions.back')}
          hitSlop={12}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text.primary} />
        </Pressable>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: insets.top + TOP_PADDING + BACK_BUTTON_SIZE + spacing.xl,
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          <View style={styles.topContentWrapper}>
            <View style={styles.progressBlock}>
              <AuthProgressDots currentStep={step} totalSteps={TOTAL_STEPS} />
            </View>
            {topContent}
          </View>

          <View style={[styles.bottomWrapper, { paddingBottom: insets.bottom + FOOTER_VERTICAL_PADDING }]}>
            {bottomContent}
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
  },
  topContentWrapper: {
    paddingHorizontal: TOP_HORIZONTAL_PADDING,
  },
  progressBlock: {
    marginBottom: spacing['4xl'],
  },
  bottomWrapper: {
    paddingHorizontal: FOOTER_HORIZONTAL_PADDING,
    paddingTop: FOOTER_VERTICAL_PADDING,
  },
  backButton: {
    position: 'absolute',
    left: TOP_HORIZONTAL_PADDING,
    width: BACK_BUTTON_SIZE,
    height: BACK_BUTTON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
});