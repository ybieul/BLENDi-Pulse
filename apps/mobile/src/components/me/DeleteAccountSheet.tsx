import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  borderRadius,
  fontSizes,
  fonts,
  fontWeights,
  spacing,
} from '@blendi/shared';

import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useColors } from '../../hooks/useColors';
import { AuthButton } from '../ui/AuthButton';
import { AuthInput } from '../ui/AuthInput';

const SHEET_RADIUS = 24;
const SUBTITLE_OPACITY = 0.7;
const WARNING_ICON_SIZE = 20;

interface DeleteAccountSheetProps {
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function DeleteAccountSheet({ onConfirm, onClose }: DeleteAccountSheetProps) {
  const { t } = useAppTranslation();
  const colors = useColors();
  const { height } = useWindowDimensions();

  const translateY = useRef(new Animated.Value(height)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const isClosingRef = useRef(false);

  const [confirmationText, setConfirmationText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const confirmPhrase = t('me.deleteAccount.confirmPhrase');
  const isPhraseMatched = confirmationText.trim().toUpperCase() === confirmPhrase.toUpperCase();

  useEffect(() => {
    translateY.setValue(height);

    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        stiffness: 220,
        damping: 26,
        mass: 0.9,
        useNativeDriver: true,
      }),
    ]).start();
  }, [backdropOpacity, height, translateY]);

  const closeSheet = () => {
    if (isClosingRef.current || isSubmitting) {
      return;
    }

    isClosingRef.current = true;

    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: height,
        duration: 220,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      isClosingRef.current = false;

      if (finished) {
        onClose();
      }
    });
  };

  const handleConfirmPress = () => {
    if (!isPhraseMatched || isSubmitting) {
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    // onConfirm resolve apenas quando o backend confirma a exclusão — a sessão
    // local só é limpa pelo caller depois disso, nunca aqui. Em caso de falha,
    // o sheet permanece aberto com o erro visível, sem fingir que a conta foi
    // excluída enquanto ela ainda existe no servidor.
    onConfirm()
      .catch(() => {
        setErrorMessage(t('me.deleteAccount.errorMessage'));
        setIsSubmitting(false);
      });
  };

  const styles = StyleSheet.create({
    modalRoot: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.overlay.black[30],
    },
    kvContainer: {
      justifyContent: 'flex-end',
    },
    sheetContainer: {
      borderTopLeftRadius: SHEET_RADIUS,
      borderTopRightRadius: SHEET_RADIUS,
      borderTopWidth: 1,
      borderColor: colors.overlay.plum[10],
      backgroundColor: colors.background.secondary,
      paddingHorizontal: spacing['3xl'],
      paddingTop: spacing.lg,
      paddingBottom: spacing['4xl'],
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 999,
      backgroundColor: colors.overlay.plum[22],
    },
    title: {
      marginTop: spacing.lg,
      color: colors.text.primary,
      fontFamily: fonts.display,
      fontSize: fontSizes.xl,
      fontWeight: fontWeights.bold,
      textAlign: 'center',
      letterSpacing: -0.3,
    },
    scrollView: {
      marginTop: spacing.lg,
      marginBottom: spacing.lg,
    },
    scrollContent: {
      paddingBottom: spacing.sm,
      gap: spacing.lg,
    },
    warningCard: {
      borderRadius: borderRadius.md,
      borderWidth: 1,
      padding: spacing.lg,
      flexDirection: 'row',
      gap: spacing.md,
    },
    warningCardError: {
      backgroundColor: colors.overlay.error[12],
      borderColor: colors.overlay.error[25],
    },
    warningCardAmber: {
      backgroundColor: colors.overlay.plum[7],
      borderColor: colors.overlay.plum[10],
    },
    warningText: {
      flex: 1,
      color: colors.text.primary,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
      lineHeight: 20,
    },
    instruction: {
      color: colors.text.secondary,
      fontFamily: fonts.body,
      fontSize: 14,
      fontWeight: fontWeights.medium,
      lineHeight: 20,
      opacity: SUBTITLE_OPACITY,
    },
    cancelButton: {
      marginTop: spacing.md,
      alignItems: 'center',
      paddingVertical: spacing.sm,
    },
    cancelButtonText: {
      color: colors.text.secondary,
      fontFamily: fonts.body,
      fontSize: fontSizes.md,
      fontWeight: fontWeights.medium,
    },
  });

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent>
      <View style={styles.modalRoot}>
        <Pressable accessibilityRole="button" onPress={closeSheet} style={StyleSheet.absoluteFillObject}>
          <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
        </Pressable>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.kvContainer}
        >
          <Animated.View
            style={[
              styles.sheetContainer,
              {
                maxHeight: height * 0.86,
                transform: [{ translateY }],
              },
            ]}
          >
            <View style={styles.handle} />

            <Text style={styles.title}>{t('me.deleteAccount.sheetTitle')}</Text>

            <ScrollView
              bounces={false}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              style={styles.scrollView}
            >
              <View style={[styles.warningCard, styles.warningCardError]}>
                <Ionicons name="warning" size={WARNING_ICON_SIZE} color={colors.feedback.error} />
                <Text style={styles.warningText}>{t('me.deleteAccount.warning')}</Text>
              </View>

              <View style={[styles.warningCard, styles.warningCardAmber]}>
                <Ionicons name="card-outline" size={WARNING_ICON_SIZE} color={colors.feedback.warning} />
                <Text style={styles.warningText}>{t('me.deleteAccount.subscriptionWarning')}</Text>
              </View>

              <Text style={styles.instruction}>
                {t('me.deleteAccount.confirmInstruction', { phrase: confirmPhrase })}
              </Text>

              <AuthInput
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!isSubmitting}
                error={errorMessage ?? undefined}
                onChangeText={setConfirmationText}
                placeholder={t('me.deleteAccount.inputPlaceholder')}
                value={confirmationText}
              />
            </ScrollView>

            <AuthButton
              disabled={!isPhraseMatched}
              loading={isSubmitting}
              onPress={handleConfirmPress}
              style={{ backgroundColor: colors.feedback.error }}
            >
              {t('me.deleteAccount.confirmButton')}
            </AuthButton>

            <Pressable
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={closeSheet}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelButtonText}>{t('me.deleteAccount.cancelButton')}</Text>
            </Pressable>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
