import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Linking,
  StyleSheet,
  Text,
  TextInput as RNTextInput,
  View,
} from 'react-native';
import { registerSchema } from '@blendi/shared';
import {
  colors,
  fonts,
  fontWeights,
  spacing,
} from '@blendi/shared';
import {
  AuthButton,
  AuthInput,
  AuthProgressDots,
  AuthScreenLayout,
} from '../../components/ui';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import type { AuthScreenProps } from '../../navigation/types';

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_IDEAL_LENGTH = 12;
const PASSWORD_STRENGTH_ANIMATION_DURATION = 300;
const TERMS_URL = 'https://blendi.app/terms';
const PRIVACY_URL = 'https://blendi.app/privacy';

const SEGMENT_ACTIVE_COLORS = [
  colors.feedback.error,
  colors.feedback.warning,
  colors.feedback.warning,
  colors.feedback.success,
] as const;

const SEGMENT_INACTIVE_COLOR = 'rgba(255, 255, 255, 0.10)';

type TranslationKey = Parameters<ReturnType<typeof useAppTranslation>['t']>[0];
type FieldName = 'name' | 'email' | 'password' | 'confirmPassword';

type FieldErrors = Record<FieldName, string | null>;
type FieldTouched = Record<FieldName, boolean>;

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
              key={`password-strength-${index}`}
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

export function RegisterScreen({ navigation }: AuthScreenProps<'Register'>) {
  const { t } = useAppTranslation();

  const emailInputRef = useRef<RNTextInput | null>(null);
  const passwordInputRef = useRef<RNTextInput | null>(null);
  const confirmPasswordInputRef = useRef<RNTextInput | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({
    name: null,
    email: null,
    password: null,
    confirmPassword: null,
  });
  const [touchedFields, setTouchedFields] = useState<FieldTouched>({
    name: false,
    email: false,
    password: false,
    confirmPassword: false,
  });

  const translateKey = (key: string) => t(key as TranslationKey);

  const validateName = (value: string): string | null => {
    if (value.trim().length === 0) {
      return translateKey('errors.validation.required');
    }

    const parsed = registerSchema.shape.name.safeParse(value);
    if (parsed.success) {
      return null;
    }

    return translateKey(parsed.error.issues[0]?.message ?? 'errors.validation.required');
  };

  const validateEmail = (value: string): string | null => {
    if (value.trim().length === 0) {
      return translateKey('errors.validation.required');
    }

    const parsed = registerSchema.shape.email.safeParse(value);
    if (parsed.success) {
      return null;
    }

    return translateKey(parsed.error.issues[0]?.message ?? 'errors.validation.required');
  };

  const validatePassword = (value: string): string | null => {
    if (value.length === 0) {
      return translateKey('errors.validation.required');
    }

    const parsed = registerSchema.shape.password.safeParse(value);
    if (parsed.success) {
      return null;
    }

    return translateKey(parsed.error.issues[0]?.message ?? 'errors.validation.required');
  };

  const validateConfirmPassword = (value: string, currentPassword: string): string | null => {
    if (value.length === 0) {
      return translateKey('errors.validation.required');
    }

    if (value !== currentPassword) {
      return t('auth.passwordsMismatch');
    }

    return null;
  };

  const getFieldError = (
    fieldName: FieldName,
    nextValues?: Partial<Record<FieldName, string>>
  ): string | null => {
    const values = {
      name,
      email,
      password,
      confirmPassword,
      ...nextValues,
    };

    switch (fieldName) {
      case 'name':
        return validateName(values.name);
      case 'email':
        return validateEmail(values.email);
      case 'password':
        return validatePassword(values.password);
      case 'confirmPassword':
        return validateConfirmPassword(values.confirmPassword, values.password);
    }
  };

  const setFieldTouched = (fieldName: FieldName) => {
    setTouchedFields((current) => ({ ...current, [fieldName]: true }));
  };

  const updateFieldError = (
    fieldName: FieldName,
    nextValues?: Partial<Record<FieldName, string>>
  ) => {
    const nextError = getFieldError(fieldName, nextValues);
    setFieldErrors((current) => ({ ...current, [fieldName]: nextError }));
    return nextError;
  };

  const handleNameChange = (nextValue: string) => {
    setName(nextValue);

    if (touchedFields.name) {
      updateFieldError('name', { name: nextValue });
    }
  };

  const handleEmailChange = (nextValue: string) => {
    setEmail(nextValue);

    if (touchedFields.email) {
      updateFieldError('email', { email: nextValue });
    }
  };

  const handlePasswordChange = (nextValue: string) => {
    setPassword(nextValue);

    if (touchedFields.password) {
      updateFieldError('password', { password: nextValue });
    }

    if (touchedFields.confirmPassword) {
      updateFieldError('confirmPassword', {
        password: nextValue,
        confirmPassword,
      });
    }
  };

  const handleConfirmPasswordChange = (nextValue: string) => {
    setConfirmPassword(nextValue);

    if (touchedFields.confirmPassword) {
      updateFieldError('confirmPassword', { confirmPassword: nextValue });
    }
  };

  const handleSubmit = () => {
    const nextTouchedFields: FieldTouched = {
      name: true,
      email: true,
      password: true,
      confirmPassword: true,
    };

    const nextErrors: FieldErrors = {
      name: getFieldError('name'),
      email: getFieldError('email'),
      password: getFieldError('password'),
      confirmPassword: getFieldError('confirmPassword'),
    };

    setTouchedFields(nextTouchedFields);
    setFieldErrors(nextErrors);

    const hasErrors = Object.values(nextErrors).some(Boolean);
    if (hasErrors) {
      return;
    }

    // O avanço para a etapa 2 será conectado no CP1.3 quando o fluxo de onboarding existir.
  };

  const handleOpenExternalUrl = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      // Melhor esforço: se falhar, mantemos o fluxo local da tela intacto.
    }
  };

  const topContent = (
    <View>
      <View style={styles.progressBlock}>
        <AuthProgressDots currentStep={1} totalSteps={2} />
      </View>

      <View style={styles.headingBlock}>
        <Text style={styles.title}>{t('auth.registerTitle')}</Text>
        <Text style={styles.subtitle}>{t('auth.registerSubtitle')}</Text>
      </View>

      <View style={styles.formBlock}>
        <AuthInput
          value={name}
          onChangeText={handleNameChange}
          onBlur={() => {
            setFieldTouched('name');
            updateFieldError('name');
          }}
          error={fieldErrors.name ?? undefined}
          placeholder={t('auth.fullNameLabel')}
          autoCapitalize="words"
          autoCorrect={false}
          textContentType="name"
          autoComplete="name"
          returnKeyType="next"
          onSubmitEditing={() => emailInputRef.current?.focus()}
        />

        <AuthInput
          ref={emailInputRef}
          value={email}
          onChangeText={handleEmailChange}
          onBlur={() => {
            setFieldTouched('email');
            updateFieldError('email');
          }}
          error={fieldErrors.email ?? undefined}
          placeholder={t('auth.emailLabel')}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          returnKeyType="next"
          onSubmitEditing={() => passwordInputRef.current?.focus()}
        />

        <View style={styles.passwordFieldGroup}>
          <AuthInput
            ref={passwordInputRef}
            value={password}
            onChangeText={handlePasswordChange}
            onBlur={() => {
              setFieldTouched('password');
              updateFieldError('password');
            }}
            error={fieldErrors.password ?? undefined}
            placeholder={t('auth.passwordLabel')}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="newPassword"
            autoComplete="new-password"
            returnKeyType="next"
            onSubmitEditing={() => confirmPasswordInputRef.current?.focus()}
          />

          <PasswordStrengthMeter password={password} />
        </View>

        <AuthInput
          ref={confirmPasswordInputRef}
          value={confirmPassword}
          onChangeText={handleConfirmPasswordChange}
          onBlur={() => {
            setFieldTouched('confirmPassword');
            updateFieldError('confirmPassword');
          }}
          error={fieldErrors.confirmPassword ?? undefined}
          placeholder={t('auth.confirmPasswordLabel')}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          autoComplete="new-password"
          returnKeyType="done"
          onSubmitEditing={() => handleSubmit()}
        />
      </View>
    </View>
  );

  const bottomContent = (
    <View>
      <AuthButton onPress={handleSubmit}>{t('auth.registerCta')}</AuthButton>

      <Text style={styles.bottomText}>
        {t('auth.alreadyHaveAccount')}{' '}
        <Text style={styles.bottomLink} onPress={() => navigation.navigate('Login')}>
          {t('auth.signIn')}
        </Text>
      </Text>

      <Text style={styles.termsText}>
        {t('auth.termsNotice')}{' '}
        <Text style={styles.termsLink} onPress={() => void handleOpenExternalUrl(TERMS_URL)}>
          {t('auth.termsOfService')}
        </Text>{' '}
        {t('auth.termsConnector')}{' '}
        <Text style={styles.termsLink} onPress={() => void handleOpenExternalUrl(PRIVACY_URL)}>
          {t('auth.privacyPolicy')}
        </Text>
        .
      </Text>
    </View>
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
  progressBlock: {
    marginBottom: spacing['4xl'],
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
  bottomText: {
    marginTop: spacing.xl,
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: fontWeights.regular,
    textAlign: 'center',
  },
  bottomLink: {
    color: colors.brand.pulse,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: fontWeights.medium,
  },
  termsText: {
    marginTop: spacing.lg,
    color: colors.text.tertiary,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: fontWeights.regular,
    lineHeight: 16,
    textAlign: 'center',
  },
  termsLink: {
    color: colors.brand.pulse,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: fontWeights.medium,
  },
});