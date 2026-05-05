import { useRef, useState } from 'react';
import axios from 'axios';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput as RNTextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { loginSchema } from '@blendi/shared';
import {
  colors,
  fonts,
  fontWeights,
  spacing,
} from '@blendi/shared';
import { AuthButton, AuthInput, AuthScreenLayout, GoogleSignInButton } from '../../components/ui';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useGoogleAuth } from '../../hooks/useGoogleAuth';
import { useAuthStore } from '../../store/auth.store';
import { getApiErrorTranslationKey } from '../../utils/error.utils';
import type { AuthScreenProps } from '../../navigation/types';

interface ApiErrorResponse {
  code?: string;
}

type TranslationKey = Parameters<ReturnType<typeof useAppTranslation>['t']>[0];

export function LoginScreen({ navigation }: AuthScreenProps<'Login'>) {
  const { t } = useAppTranslation();
  const login = useAuthStore((state) => state.login);
  const isSubmitting = useAuthStore((state) => state.isLoading);
  const {
    signInWithGoogle,
    isLoading: isGoogleLoading,
    error: googleError,
    clearError: clearGoogleError,
  } = useGoogleAuth();

  const passwordInputRef = useRef<RNTextInput | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const translateKey = (key: string) => t(key as TranslationKey);

  const clearFormErrors = () => {
    setEmailError(null);
    setPasswordError(null);
    setFormError(null);
  };

  const handleChangeEmail = (nextEmail: string) => {
    setEmail(nextEmail);
    clearFormErrors();
    clearGoogleError();
  };

  const handleChangePassword = (nextPassword: string) => {
    setPassword(nextPassword);
    clearFormErrors();
    clearGoogleError();
  };

  const handleForgotPassword = () => {
    clearFormErrors();
    clearGoogleError();
    navigation.navigate('ForgotPassword');
  };

  const handleNavigateToRegister = () => {
    clearFormErrors();
    clearGoogleError();
    navigation.navigate('Register');
  };

  const handleLogin = async () => {
    clearFormErrors();
    clearGoogleError();

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const message = translateKey(issue.message);

        if (issue.path[0] === 'email') {
          setEmailError(message);
        }

        if (issue.path[0] === 'password') {
          setPasswordError(message);
        }
      }

      return;
    }

    try {
      await login(parsed.data);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const responseData = error.response?.data as ApiErrorResponse | undefined;
        const translationKey = getApiErrorTranslationKey(responseData?.code);
        const translatedMessage = translateKey(translationKey);

        if (responseData?.code === 'auth/invalid-credentials') {
          setPasswordError(translatedMessage);
          return;
        }

        setFormError(translatedMessage);
        return;
      }

      setFormError(translateKey('errors.network_internal_server_error'));
    }
  };

  const handleGoogleSignIn = async () => {
    clearFormErrors();
    await signInWithGoogle();
    // Quando o Google login conclui, o RootNavigator troca para o AppFlow.
    // O AppNavigator já entra em Home como rota inicial por enquanto.
  };

  const topContent = (
    <View>
      <View style={styles.logoContainer}>
        <Text style={styles.logo}>{t('auth.brandWordmark')}</Text>
      </View>

      <View style={styles.headingBlock}>
        <Text style={styles.title}>{t('auth.loginTitle')}</Text>
        <Text style={styles.subtitle}>{t('auth.loginSubtitle')}</Text>
      </View>

      <View style={styles.formBlock}>
        <AuthInput
          value={email}
          onChangeText={handleChangeEmail}
          error={emailError ?? undefined}
          placeholder={t('auth.emailLabel')}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          returnKeyType="next"
          onSubmitEditing={() => passwordInputRef.current?.focus()}
        />

        <View style={styles.passwordFieldWrapper}>
          <AuthInput
            ref={passwordInputRef}
            value={password}
            onChangeText={handleChangePassword}
            error={passwordError ?? undefined}
            placeholder={t('auth.passwordLabel')}
            secureTextEntry={!isPasswordVisible}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            autoComplete="password"
            returnKeyType="done"
            onSubmitEditing={() => void handleLogin()}
          />

          <Pressable
            onPress={() => setIsPasswordVisible((current) => !current)}
            style={styles.passwordToggle}
            accessibilityRole="button"
            accessibilityLabel={
              isPasswordVisible
                ? t('auth.hidePassword')
                : t('auth.showPassword')
            }
            hitSlop={10}
          >
            <Ionicons
              name={isPasswordVisible ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors.text.tertiary}
            />
          </Pressable>
        </View>

        <Pressable onPress={handleForgotPassword} style={styles.forgotPasswordLink}>
          <Text style={styles.forgotPasswordText}>{t('auth.forgotPassword')}</Text>
        </Pressable>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>{t('common.or')}</Text>
          <View style={styles.dividerLine} />
        </View>

        <GoogleSignInButton onPress={() => void handleGoogleSignIn()} isLoading={isGoogleLoading} />

        {formError || googleError ? (
          <Text style={styles.formErrorText}>
            {formError ?? (googleError ? translateKey(googleError) : null)}
          </Text>
        ) : null}
      </View>
    </View>
  );

  const bottomContent = (
    <View>
      <AuthButton onPress={() => void handleLogin()} loading={isSubmitting}>
        {t('auth.loginCta')}
      </AuthButton>

      <Text style={styles.bottomText}>
        {t('auth.noAccount')}{' '}
        <Text style={styles.bottomLink} onPress={handleNavigateToRegister}>
          {t('auth.registerHere')}
        </Text>
      </Text>
    </View>
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
  logoContainer: {
    alignItems: 'center',
    paddingTop: spacing['2xl'],
    marginBottom: spacing['5xl'],
  },
  logo: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: fontWeights.bold,
    letterSpacing: 0.6,
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
  passwordFieldWrapper: {
    position: 'relative',
  },
  passwordToggle: {
    position: 'absolute',
    top: 22,
    right: spacing.xl,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  forgotPasswordLink: {
    alignSelf: 'flex-end',
  },
  forgotPasswordText: {
    color: colors.brand.pulse,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: fontWeights.medium,
  },
  dividerRow: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.text.primary,
    opacity: 0.1,
  },
  dividerText: {
    color: colors.text.tertiary,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: fontWeights.regular,
    textTransform: 'lowercase',
  },
  formErrorText: {
    color: colors.feedback.error,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: fontWeights.regular,
    lineHeight: 18,
    textAlign: 'center',
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
});