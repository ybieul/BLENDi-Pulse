import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { forgotPasswordSchema } from '@blendi/shared';
import { colors, fonts, fontWeights, spacing } from '@blendi/shared';
import { AuthButton, AuthInput, AuthScreenLayout } from '../../components/ui';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { forgotPassword } from '../../services/auth.service';
import type { AuthScreenProps } from '../../navigation/types';

const MINIMUM_LOADING_MS = 800;

type TranslationKey = Parameters<ReturnType<typeof useAppTranslation>['t']>[0];
type ForgotPasswordRequest = (input: { email: string }) => Promise<void>;

export function ForgotPasswordScreen({ navigation }: AuthScreenProps<'ForgotPassword'>) {
  const { t } = useAppTranslation();
  const isMountedRef = useRef(true);
  const requestForgotPassword = forgotPassword as ForgotPasswordRequest;

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const translateKey = (key: string) => t(key as TranslationKey);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const validateEmail = (value: string): string | null => {
    if (value.trim().length === 0) {
      return translateKey('errors.validation.required');
    }

    const parsed = forgotPasswordSchema.shape.email.safeParse(value);
    if (parsed.success) {
      return null;
    }

    return translateKey(parsed.error.issues[0]?.message ?? 'errors.validation.required');
  };

  const handleChangeEmail = (nextValue: string) => {
    setEmail(nextValue);

    if (emailError) {
      setEmailError(validateEmail(nextValue));
    }
  };

  const sendRecoveryCode = async (nextEmail: string): Promise<void> => {
    try {
      await requestForgotPassword({ email: nextEmail });
    } catch {
      // O fluxo é intencionalmente resiliente: a próxima tela abre mesmo se a API falhar.
    }
  };

  const handleSubmit = async () => {
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'errors.validation.required';
      setEmailError(translateKey(message));
      return;
    }

    setEmailError(null);
    setIsSubmitting(true);

    void sendRecoveryCode(parsed.data.email);

    await new Promise((resolve) => {
      setTimeout(resolve, MINIMUM_LOADING_MS);
    });

    if (!isMountedRef.current) {
      return;
    }

    navigation.navigate('VerifyOtp', { email: parsed.data.email });
  };

  const topContent = (
    <View>
      <View style={styles.iconBlock}>
        <Ionicons name="mail-outline" size={48} color={colors.brand.pulse} />
      </View>

      <View style={styles.headingBlock}>
        <Text style={styles.title}>{t('auth.forgotPasswordTitle')}</Text>
        <Text style={styles.subtitle}>{t('auth.forgotPasswordDescription')}</Text>
      </View>

      <View style={styles.formBlock}>
        <AuthInput
          value={email}
          onChangeText={handleChangeEmail}
          onBlur={() => setEmailError(validateEmail(email))}
          error={emailError ?? undefined}
          placeholder={t('auth.emailLabel')}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          returnKeyType="done"
          onSubmitEditing={() => void handleSubmit()}
        />
      </View>
    </View>
  );

  const bottomContent = (
    <AuthButton onPress={() => void handleSubmit()} loading={isSubmitting}>
      {t('auth.forgotPasswordCta')}
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
  iconBlock: {
    alignItems: 'center',
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
    marginTop: spacing['4xl'],
  },
});