import { type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { AntDesign } from '@expo/vector-icons';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '@blendi/shared';
import { AuroraBackground } from './AuroraBackground';

const FOOTER_HORIZONTAL_PADDING = spacing['3xl'];
const FOOTER_VERTICAL_PADDING = spacing['5xl'];
const TOP_HORIZONTAL_PADDING = spacing['3xl'];
const TOP_PADDING = spacing['4xl'];
const BACK_BUTTON_SIZE = 36;
const BACK_BUTTON_TOP_OFFSET = spacing.md;

export interface AuthScreenLayoutProps {
  topContent: ReactNode;
  bottomContent: ReactNode;
  showBackButton?: boolean;
}

export function AuthScreenLayout({
  topContent,
  bottomContent,
  showBackButton = false,
}: AuthScreenLayoutProps) {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const insets = useSafeAreaInsets();

  const handleGoBack = () => {
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
        {/* Aurora animado — primeiro filho, cobre toda a tela */}
        <AuroraBackground />

        {showBackButton ? (
          <Pressable
            onPress={handleGoBack}
            style={[styles.backButton, { top: insets.top + BACK_BUTTON_TOP_OFFSET }]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={12}
          >
            <AntDesign name="arrowleft" size={20} color={colors.text.primary} />
          </Pressable>
        ) : null}

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: insets.top + TOP_PADDING + (showBackButton ? BACK_BUTTON_SIZE + spacing.xl : 0),
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          <View style={styles.topContentWrapper}>
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