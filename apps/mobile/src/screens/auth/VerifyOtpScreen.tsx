import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { forgotPasswordSchema, verifyOtpSchema } from '@blendi/shared';
import {
  borderRadius,
  colors,
  fonts,
  fontWeights,
  spacing,
} from '@blendi/shared';
import { AuthButton, AuthScreenLayout } from '../../components/ui';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { forgotPassword, verifyOtp } from '../../services/auth.service';
import { getApiErrorTranslationKey } from '../../utils/error.utils';
import type { AuthScreenProps } from '../../navigation/types';

const OTP_LENGTH = 6;
const RESEND_COUNTDOWN_SECONDS = 60;
const ACTIVE_PULSE_DURATION_MS = 1000;
const SHAKE_DISTANCE = 4;
const SHAKE_TOTAL_DURATION_MS = 300;
const ERROR_BORDER_DURATION_MS = 600;

type TranslationKey = Parameters<ReturnType<typeof useAppTranslation>['t']>[0];
type ApiErrorResponse = { code?: string };
type VerifyOtpRequest = (input: { email: string; otp: string }) => Promise<string>;
type ForgotPasswordRequest = (input: { email: string }) => Promise<void>;

function maskEmail(email: string): string {
  const [localPart, domain] = email.split('@');

  if (!localPart || !domain) {
    return email;
  }

  const visiblePrefix = localPart.slice(0, 2);
  const maskedLength = Math.max(localPart.length - visiblePrefix.length, 3);
  return `${visiblePrefix}${'*'.repeat(maskedLength)}@${domain}`;
}

export function VerifyOtpScreen({ navigation, route }: AuthScreenProps<'VerifyOtp'>) {
  const { t } = useAppTranslation();
  const inputRef = useRef<TextInput | null>(null);
  const isMountedRef = useRef(true);
  const shakeAnimation = useRef(new Animated.Value(0)).current;
  const errorBorderOpacity = useRef(new Animated.Value(0)).current;
  const resendOpacity = useRef(new Animated.Value(0)).current;
  const pulseAnimation = useRef(new Animated.Value(0)).current;
  const requestVerifyOtp = verifyOtp as VerifyOtpRequest;
  const requestForgotPassword = forgotPassword as ForgotPasswordRequest;

  const [otpCode, setOtpCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(RESEND_COUNTDOWN_SECONDS);
  const [otpErrorMessage, setOtpErrorMessage] = useState<string | null>(null);

  const translateKey = (key: string) => t(key as TranslationKey);
  const maskedEmail = useMemo(() => maskEmail(route.params.email), [route.params.email]);
  const digits = otpCode.split('');
  const activeIndex = otpCode.length >= OTP_LENGTH ? -1 : otpCode.length;
  const pulseScale = pulseAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.03],
  });

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnimation, {
          toValue: 1,
          duration: ACTIVE_PULSE_DURATION_MS / 2,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnimation, {
          toValue: 0,
          duration: ACTIVE_PULSE_DURATION_MS / 2,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    pulseLoop.start();

    return () => {
      pulseLoop.stop();
      isMountedRef.current = false;
    };
  }, [pulseAnimation]);

  useEffect(() => {
    if (secondsRemaining <= 0) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setSecondsRemaining((current) => Math.max(0, current - 1));
    }, 1000);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [secondsRemaining]);

  useEffect(() => {
    Animated.timing(resendOpacity, {
      toValue: secondsRemaining === 0 ? 1 : 0,
      duration: 200,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [resendOpacity, secondsRemaining]);

  useEffect(() => {
    if (otpCode.length !== OTP_LENGTH || isSubmitting) {
      return;
    }

    void submitOtpCode(otpCode);
  }, [isSubmitting, otpCode]);

  const focusInput = () => {
    inputRef.current?.focus();
  };

  const triggerInvalidCodeFeedback = () => {
    const oscillationDuration = SHAKE_TOTAL_DURATION_MS / 7;

    errorBorderOpacity.setValue(1);

    Animated.parallel([
      Animated.sequence([
        Animated.timing(shakeAnimation, {
          toValue: -SHAKE_DISTANCE,
          duration: oscillationDuration,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnimation, {
          toValue: SHAKE_DISTANCE,
          duration: oscillationDuration,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnimation, {
          toValue: -SHAKE_DISTANCE,
          duration: oscillationDuration,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnimation, {
          toValue: SHAKE_DISTANCE,
          duration: oscillationDuration,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnimation, {
          toValue: -SHAKE_DISTANCE,
          duration: oscillationDuration,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnimation, {
          toValue: SHAKE_DISTANCE,
          duration: oscillationDuration,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnimation, {
          toValue: 0,
          duration: oscillationDuration,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(errorBorderOpacity, {
        toValue: 0,
        duration: ERROR_BORDER_DURATION_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const clearOtpState = () => {
    setOtpCode('');
    focusInput();
  };

  const handleChangeOtp = (value: string) => {
    const sanitizedValue = value.replace(/\D/g, '').slice(0, OTP_LENGTH);
    setOtpCode(sanitizedValue);

    if (otpErrorMessage) {
      setOtpErrorMessage(null);
    }
  };

  const submitOtpCode = async (submittedOtp: string): Promise<void> => {
    const parsed = verifyOtpSchema.safeParse({ email: route.params.email, otp: submittedOtp });
    if (!parsed.success) {
      return;
    }

    setIsSubmitting(true);
    setOtpErrorMessage(null);

    try {
      const resetToken = await requestVerifyOtp(parsed.data);

      if (!isMountedRef.current) {
        return;
      }

      navigation.navigate('ResetPassword', { resetToken });
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }

      if (axios.isAxiosError(error)) {
        const responseData = error.response?.data as ApiErrorResponse | undefined;
        const translationKey = getApiErrorTranslationKey(responseData?.code);
        const translatedMessage = translateKey(translationKey);

        setOtpErrorMessage(translatedMessage);

        if (
          responseData?.code === 'auth/otp-invalid' ||
          responseData?.code === 'auth/otp-expired' ||
          responseData?.code === 'auth/otp-max-attempts'
        ) {
          if (
            responseData.code === 'auth/otp-expired' ||
            responseData.code === 'auth/otp-max-attempts'
          ) {
            setSecondsRemaining(0);
          }

          triggerInvalidCodeFeedback();
          clearOtpState();
          setIsSubmitting(false);
          return;
        }
      } else {
        setOtpErrorMessage(translateKey('errors.network_internal_server_error'));
      }
    } finally {
      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    }
  };

  const handleResendCode = async () => {
    const parsed = forgotPasswordSchema.safeParse({ email: route.params.email });
    if (!parsed.success || isResending) {
      return;
    }

    setIsResending(true);
    setOtpErrorMessage(null);
    clearOtpState();
    setSecondsRemaining(RESEND_COUNTDOWN_SECONDS);

    try {
      await requestForgotPassword({ email: parsed.data.email });
    } catch {
      // O fluxo continua disponível localmente mesmo se a API falhar ao reenviar.
    } finally {
      if (isMountedRef.current) {
        setIsResending(false);
      }
    }
  };

  const topContent = (
    <View>
      <View style={styles.headingBlock}>
        <Text style={styles.title}>{t('auth.verifyOtpTitle')}</Text>
        <Text style={styles.subtitle}>{t('auth.verifyOtpDescription')}</Text>
        <Text style={styles.emailHighlight}>{maskedEmail}</Text>
      </View>

      <View style={styles.otpSection}>
        <Pressable onPress={focusInput} style={styles.otpPressable}>
          <Animated.View
            style={[
              styles.otpBoxesRow,
              { transform: [{ translateX: shakeAnimation }] },
            ]}
          >
            {Array.from({ length: OTP_LENGTH }, (_, index) => {
              const isActive = index === activeIndex && !isSubmitting;

              return (
                <Animated.View
                  key={`otp-box-${index}`}
                  style={[
                    styles.otpBox,
                    isActive && { transform: [{ scale: pulseScale }] },
                  ]}
                >
                  <View style={styles.otpBoxBackground} />
                  <View style={styles.otpBoxBorderBase} />
                  {isActive ? <View style={styles.otpBoxBorderActive} /> : null}
                  <Animated.View
                    pointerEvents="none"
                    style={[styles.otpBoxBorderError, { opacity: errorBorderOpacity }]}
                  />
                  <Text style={styles.otpDigit}>{digits[index] ?? ''}</Text>
                </Animated.View>
              );
            })}
          </Animated.View>

          <TextInput
            ref={inputRef}
            style={styles.hiddenInput}
            value={otpCode}
            onChangeText={handleChangeOtp}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            returnKeyType="done"
            maxLength={OTP_LENGTH}
            autoFocus
            caretHidden
            contextMenuHidden
            selectionColor={colors.brand.pulse}
          />
        </Pressable>

        <View style={styles.timerBlock}>
          {secondsRemaining > 0 ? (
            <Text style={styles.timerText}>
              {t('auth.resendCodeIn', { seconds: secondsRemaining })}
            </Text>
          ) : null}

          <Animated.View
            pointerEvents={secondsRemaining === 0 ? 'auto' : 'none'}
            style={[styles.resendContainer, { opacity: resendOpacity }]}
          >
            <Pressable onPress={() => void handleResendCode()} disabled={isResending}>
              <Text style={styles.resendText}>{t('auth.resendCode')}</Text>
            </Pressable>
          </Animated.View>

          {otpErrorMessage ? (
            <Text style={styles.errorText}>{otpErrorMessage}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );

  const bottomContent = (
    <AuthButton
      disabled={!isSubmitting}
      loading={isSubmitting}
      style={!isSubmitting ? styles.disabledButton : undefined}
    >
      {t('auth.verifyOtpCta')}
    </AuthButton>
  );

  return (
    <AuthScreenLayout
      showBackButton
      topContent={topContent}
      bottomContent={bottomContent}
    />
  );
}

const styles = StyleSheet.create({
  headingBlock: {
    alignItems: 'center',
    marginBottom: spacing['6xl'],
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
  emailHighlight: {
    color: colors.brand.pulse,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: fontWeights.medium,
    lineHeight: 20,
    textAlign: 'center',
  },
  otpSection: {
    alignItems: 'center',
  },
  otpPressable: {
    width: '100%',
    alignItems: 'center',
  },
  otpBoxesRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
  },
  otpBox: {
    position: 'relative',
    width: 44,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  otpBoxBackground: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: borderRadius.md,
    backgroundColor: colors.text.primary,
    opacity: 0.05,
  },
  otpBoxBorderBase: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.text.primary,
    opacity: 0.12,
  },
  otpBoxBorderActive: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.brand.pulse,
  },
  otpBoxBorderError: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.feedback.error,
  },
  otpDigit: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
  },
  hiddenInput: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    opacity: 0,
  },
  timerBlock: {
    width: '100%',
    alignItems: 'center',
    marginTop: spacing['3xl'],
    minHeight: 56,
  },
  timerText: {
    color: colors.text.tertiary,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: fontWeights.regular,
    textAlign: 'center',
  },
  resendContainer: {
    marginTop: spacing.md,
  },
  resendText: {
    color: colors.brand.pulse,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: fontWeights.medium,
    textAlign: 'center',
  },
  errorText: {
    marginTop: spacing.md,
    color: colors.feedback.error,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: fontWeights.regular,
    lineHeight: 18,
    textAlign: 'center',
  },
  disabledButton: {
    opacity: 0.45,
  },
});