import { useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { AntDesign } from '@expo/vector-icons';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '@blendi/shared';

const FOOTER_HORIZONTAL_PADDING = spacing['3xl'];
const FOOTER_VERTICAL_PADDING = spacing['5xl'];
const TOP_HORIZONTAL_PADDING = spacing['3xl'];
const TOP_PADDING = spacing['4xl'];
const BACK_BUTTON_SIZE = 36;
const BACK_BUTTON_TOP_OFFSET = spacing.md;
const TOP_CONTENT_GAP = spacing['3xl'];

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
  const [bottomContentHeight, setBottomContentHeight] = useState(0);

  const handleBottomLayout = (event: LayoutChangeEvent) => {
    setBottomContentHeight(event.nativeEvent.layout.height);
  };

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
              paddingBottom: bottomContentHeight + spacing['4xl'],
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          {topContent}
        </ScrollView>

        <View
          onLayout={handleBottomLayout}
          style={[
            styles.bottomContainer,
            { paddingBottom: insets.bottom + FOOTER_VERTICAL_PADDING },
          ]}
        >
          {bottomContent}
        </View>
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
    paddingHorizontal: TOP_HORIZONTAL_PADDING,
    gap: TOP_CONTENT_GAP,
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
  bottomContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: FOOTER_HORIZONTAL_PADDING,
    paddingTop: FOOTER_VERTICAL_PADDING,
    backgroundColor: colors.background.primary,
  },
});