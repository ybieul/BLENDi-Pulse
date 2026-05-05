import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TextInput as RNTextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { resetPasswordSchema } from '@blendi/shared';
import {
  colors,
  fonts,
  fontWeights,
  spacing,
} from '@blendi/shared';
import { AuthButton, AuthInput, AuthScreenLayout } from '../../components/ui';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { resetPassword } from '../../services/auth.service';
import { getApiErrorTranslationKey } from '../../utils/error.utils';
import type { AuthScreenProps } from '../../navigation/types';

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_IDEAL_LENGTH = 12;
const PASSWORD_STRENGTH_ANIMATION_DURATION = 300;
const SEGMENT_INACTIVE_COLOR = 'rgba(255, 255, 255, 0.10)';
const SEGMENT_ACTIVE_COLORS = [
  colors.feedback.error,
  colors.feedback.warning,
  colors.feedback.warning,
  colors.feedback.success,
] as const;
const CONTENT_FADE_DURATION_MS = 300;
const SUCCESS_TEXT_DURATION_MS = 200;
const SUCCESS_RESET_DELAY_MS = 2500;
const WAVE_SIZE = 80;

type TranslationKey = Parameters<ReturnType<typeof useAppTranslation>['t']>[0];
type ApiErrorResponse = { code?: string };
type ResetPasswordRequest = (input: { resetToken: string; newPassword: string }) => Promise<void>;

interface PasswordStrengthMeterProps {
  password: string;
}

function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  const { t } = useAppTranslation();

  const criteria = useMemo(
    () => [
      password.length >= PASSWORD_MIN_LENGTH,
      /[A-Z]/.test(password),
      /\d/.test(password),
      password.length >= PASSWORD_IDEAL_LENGTH,
    ],
    [password]
  );

  const strengthCount = criteria.filter(Boolean).length;
  const segmentAnimations = useRef(criteria.map((isMet) => new Animated.Value(isMet ? 1 : 0))).current;
  const labelProgress = useRef(new Animated.Value(strengthCount)).current;

  useEffect(() => {
    criteria.forEach((isMet, index) => {
      Animated.timing(segmentAnimations[index], {
        toValue: isMet ? 1 : 0,
        duration: PASSWORD_STRENGTH_ANIMATION_DURATION,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start();
    });
  }, [criteria, segmentAnimations]);

  useEffect(() => {
    Animated.timing(labelProgress, {
      toValue: strengthCount,
      duration: PASSWORD_STRENGTH_ANIMATION_DURATION,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [labelProgress, strengthCount]);

  const strengthLabel =
    password.length === 0
      ? ''
      : strengthCount <= 1
        ? t('auth.passwordStrengthWeak')
        : strengthCount === 2
          ? t('auth.passwordStrengthFair')
          : strengthCount === 3
            ? t('auth.passwordStrengthGood')
            : t('auth.passwordStrengthStrong');

  const labelColor = labelProgress.interpolate({
    inputRange: [0, 1, 2, 3, 4],
    outputRange: [
      colors.text.tertiary,
      colors.feedback.error,
      colors.feedback.warning,
      colors.feedback.warning,
      colors.feedback.success,
    ],
  });

  return (
    <View style={styles.passwordStrengthBlock}>
      <View style={styles.passwordStrengthSegments}>
        {segmentAnimations.map((animation, index) => {
          const backgroundColor = animation.interpolate({
            inputRange: [0, 1],
            outputRange: [SEGMENT_INACTIVE_COLOR, SEGMENT_ACTIVE_COLORS[index]],
          });

          return (
            <Animated.View
              key={`reset-password-strength-${index}`}
              style={[styles.passwordStrengthSegment, { backgroundColor }]}
            />
          );
        })}
      </View>

      <Animated.Text style={[styles.passwordStrengthLabel, { color: labelColor }]}> 
        {strengthLabel}
      </Animated.Text>
    </View>
  );
}

export function ResetPasswordScreen({ navigation, route }: AuthScreenProps<'ResetPassword'>) {
  const { t } = useAppTranslation();
  const { height } = useWindowDimensions();
  const isMountedRef = useRef(true);
  const confirmPasswordInputRef = useRef<RNTextInput | null>(null);
  const requestResetPassword = resetPassword as ResetPasswordRequest;

  const contentOpacity = useRef(new Animated.Value(1)).current;
  const celebrationOpacity = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0)).current;
  const waveScale = useRef(new Animated.Value(0)).current;
  const waveOpacity = useRef(new Animated.Value(0)).current;
  const successTextOpacity = useRef(new Animated.Value(0)).current;
  const successTextTranslateY = useRef(new Animated.Value(12)).current;

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const translateKey = (key: string) => t(key as TranslationKey);
  const passwordsDiffer =
    newPassword.length > 0 && confirmPassword.length > 0 && newPassword !== confirmPassword;
  const passwordStrongEnough = resetPasswordSchema.shape.newPassword.safeParse(newPassword).success;
  const isButtonDisabled =
    isSubmitting ||
    isSuccess ||
    !passwordStrongEnough ||
    passwordsDiffer ||
    newPassword.length === 0 ||
    confirmPassword.length === 0;

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isSuccess) {
      return;
    }

    const timeoutId = setTimeout(() => {
      navigation.reset({
        index: 0,
        routes: [{ name: 'Login' }],
      });
    }, SUCCESS_RESET_DELAY_MS);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [isSuccess, navigation]);

  const validatePassword = (value: string): string | null => {
    if (value.length === 0) {
      return translateKey('errors.validation.required');
    }

    const parsed = resetPasswordSchema.shape.newPassword.safeParse(value);
    if (parsed.success) {
      return null;
    }

    return translateKey(parsed.error.issues[0]?.message ?? 'errors.validation.required');
  };

  const getConfirmPasswordError = (passwordValue: string, confirmValue: string): string | null => {
    if (confirmValue.length === 0) {
      return null;
    }

    if (passwordValue !== confirmValue) {
      return t('auth.passwordsMismatch');
    }

    return null;
  };

  const handleChangeNewPassword = (nextValue: string) => {
    setNewPassword(nextValue);
    setFormError(null);

    if (passwordError) {
      setPasswordError(validatePassword(nextValue));
    }

    if (confirmPassword.length > 0) {
      setConfirmPasswordError(getConfirmPasswordError(nextValue, confirmPassword));
    }
  };

  const handleChangeConfirmPassword = (nextValue: string) => {
    setConfirmPassword(nextValue);
    setFormError(null);
    setConfirmPasswordError(getConfirmPasswordError(newPassword, nextValue));
  };

  const runSuccessAnimation = () => {
    setIsSuccess(true);

    celebrationOpacity.setValue(0);
    checkScale.setValue(0);
    waveScale.setValue(0);
    waveOpacity.setValue(1);
    successTextOpacity.setValue(0);
    successTextTranslateY.setValue(12);

    Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: 0,
        duration: CONTENT_FADE_DURATION_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(celebrationOpacity, {
        toValue: 1,
        duration: CONTENT_FADE_DURATION_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => {
      Animated.spring(checkScale, {
        toValue: 1.2,
        stiffness: 260,
        damping: 16,
        mass: 0.7,
        useNativeDriver: true,
      }).start(() => {
        Animated.timing(checkScale, {
          toValue: 1,
          duration: 150,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      });

      Animated.parallel([
        Animated.timing(waveScale, {
          toValue: 1,
          duration: 500,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(waveOpacity, {
          toValue: 0,
          duration: 500,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(successTextOpacity, {
          toValue: 1,
          duration: SUCCESS_TEXT_DURATION_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(successTextTranslateY, {
          toValue: 0,
          duration: SUCCESS_TEXT_DURATION_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    });
  };

  const handleSubmit = async () => {
    const parsed = resetPasswordSchema.safeParse({
      resetToken: route.params.resetToken,
      newPassword,
    });

    const mismatchError = getConfirmPasswordError(newPassword, confirmPassword);
    setConfirmPasswordError(mismatchError);

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'errors.validation.required';
      setPasswordError(translateKey(message));
      return;
    }

    if (mismatchError) {
      return;
    }

    setPasswordError(null);
    setFormError(null);
    setIsSubmitting(true);

    try {
      await requestResetPassword(parsed.data);

      if (!isMountedRef.current) {
        return;
      }

      setIsSubmitting(false);
      runSuccessAnimation();
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }

      if (axios.isAxiosError(error)) {
        const responseData = error.response?.data as ApiErrorResponse | undefined;
        const translationKey = getApiErrorTranslationKey(responseData?.code);
        setFormError(translateKey(translationKey));
      } else {
        setFormError(translateKey('errors.network_internal_server_error'));
      }
    } finally {
      if (isMountedRef.current && !isSuccess) {
        setIsSubmitting(false);
      }
    }
  };

  const topContent = (
    <View style={[styles.topContentContainer, { minHeight: Math.max(height * 0.55, 420) }]}> 
      <Animated.View style={{ opacity: contentOpacity }}>
        <View style={styles.headingBlock}>
          <Text style={styles.title}>{t('auth.resetPasswordTitle')}</Text>
          <Text style={styles.subtitle}>{t('auth.resetPasswordDescription')}</Text>
        </View>

        <View style={styles.formBlock}>
          <View style={styles.passwordFieldGroup}>
            <AuthInput
              value={newPassword}
              onChangeText={handleChangeNewPassword}
              onBlur={() => setPasswordError(validatePassword(newPassword))}
              error={passwordError ?? undefined}
              placeholder={t('auth.newPasswordLabel')}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              autoComplete="new-password"
              returnKeyType="next"
              onSubmitEditing={() => confirmPasswordInputRef.current?.focus()}
            />

            <PasswordStrengthMeter password={newPassword} />
          </View>

          <AuthInput
            ref={confirmPasswordInputRef}
            value={confirmPassword}
            onChangeText={handleChangeConfirmPassword}
            onBlur={() => setConfirmPasswordError(getConfirmPasswordError(newPassword, confirmPassword))}
            error={confirmPasswordError ?? undefined}
            placeholder={t('auth.confirmPasswordLabel')}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="newPassword"
            autoComplete="new-password"
            returnKeyType="done"
            onSubmitEditing={() => void handleSubmit()}
          />

          {formError ? <Text style={styles.formErrorText}>{formError}</Text> : null}
        </View>
      </Animated.View>

      <Animated.View pointerEvents="none" style={[styles.successOverlay, { opacity: celebrationOpacity }]}> 
        <View style={styles.successVisual}> 
          <Animated.View
            style={[
              styles.successWave,
              {
                opacity: waveOpacity,
                transform: [{ scale: waveScale }],
              },
            ]}
          />

          <Animated.View style={{ transform: [{ scale: checkScale }] }}>
            <Ionicons name="checkmark-circle" size={72} color={colors.feedback.success} />
          </Animated.View>
        </View>

        <Animated.Text
          style={[
            styles.successText,
            {
              opacity: successTextOpacity,
              transform: [{ translateY: successTextTranslateY }],
            },
          ]}
        >
          {t('auth.passwordResetSuccess')}
        </Animated.Text>
      </Animated.View>
    </View>
  );

  const bottomContent = (
    <Animated.View style={{ opacity: contentOpacity }}>
      <AuthButton
        onPress={() => void handleSubmit()}
        loading={isSubmitting}
        disabled={isButtonDisabled}
        style={isButtonDisabled ? styles.disabledButton : undefined}
      >
        {t('auth.resetPasswordCta')}
      </AuthButton>
    </Animated.View>
  );

  return (
    <AuthScreenLayout
      showBackButton={false}
      topContent={topContent}
      bottomContent={bottomContent}
    />
  );
}

const styles = StyleSheet.create({
  topContentContainer: {
    position: 'relative',
    justifyContent: 'center',
  },
  headingBlock: {
    marginBottom: spacing['4xl'],
    gap: spacing.lg,
  },
  title: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: fontWeights.regular,
    lineHeight: 20,
    textAlign: 'center',
  },
  formBlock: {
    gap: spacing.lg,
  },
  passwordFieldGroup: {
    gap: spacing.md,
  },
  passwordStrengthBlock: {
    gap: spacing.md,
  },
  passwordStrengthSegments: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  passwordStrengthSegment: {
    flex: 1,
    height: 3,
    borderRadius: 2,
  },
  passwordStrengthLabel: {
    minHeight: 14,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: fontWeights.medium,
  },
  formErrorText: {
    color: colors.feedback.error,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: fontWeights.regular,
    lineHeight: 18,
    textAlign: 'center',
  },
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successVisual: {
    width: WAVE_SIZE,
    height: WAVE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing['3xl'],
  },
  successWave: {
    position: 'absolute',
    width: WAVE_SIZE,
    height: WAVE_SIZE,
    borderRadius: WAVE_SIZE / 2,
    borderWidth: 1,
    borderColor: colors.feedback.success,
  },
  successText: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
  },
  disabledButton: {
    opacity: 0.45,
  },
});