// apps/mobile/src/screens/onboarding/OnboardingModelScreen.tsx
// Passo 1 do fluxo de onboarding: seleção do modelo BLENDi.
//
// O usuário escolhe entre Lite, Pro+, Steel, "outro modelo ou modelo antigo"
// e "ainda não tenho um BLENDi" (as duas últimas gravam blendiModel 'Lite' e a
// posse correspondente). Em "outro modelo", um campo opcional aceita marca e
// modelo. O CTA só fica habilitado após a seleção; ao confirmar, o valor é
// gravado no onboarding store (em memória) e o fluxo avança para o objetivo.
//
// Teste no build EAS (25-26/11): contas Apple/Google criadas sem o nome real
// (só o começo do e-mail, `nameNeedsConfirmation`) veem aqui, acima dos
// modelos, os campos Nome (obrigatório) e Sobrenome (opcional, já preenchido
// se a Apple/Google mandou). O nome é salvo (PATCH /users/me) ao continuar —
// não depende do resto do onboarding.

import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import axios from 'axios';

import {
  composeFullName,
  fontSizes,
  fonts,
  OTHER_BLENDER_MODEL_MAX_LENGTH,
  resolvePersonNameParts,
  spacing,
} from '@blendi/shared';
import { api } from '../../config/api';
import { PersonNameFields } from '../../components/profile/PersonNameFields';
import { AuthButton } from '../../components/ui/AuthButton';
import { AuthInput } from '../../components/ui/AuthInput';
import { OnboardingLayout } from '../../components/ui/OnboardingLayout';
import { SelectionCard } from '../../components/ui/SelectionCard';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useColors } from '../../hooks/useColors';
import { useAuthStore } from '../../store/auth.store';
import { useOnboardingStore } from '../../store/onboarding.store';
import { getAxiosErrorTranslationKey } from '../../utils/error.utils';
import { validatePersonName } from '../../utils/personName.utils';
import { BLENDER_OPTIONS, resolveBlenderOption } from '../../utils/blenderOwnership.utils';

type OnboardingModelScreenProps = {
  navigation: {
    navigate: (screen: 'OnboardingGoal') => void;
  };
};

export function OnboardingModelScreen({ navigation }: OnboardingModelScreenProps) {
  const colors = useColors();
  const { t } = useAppTranslation();
  const selectedModel = useOnboardingStore((state) => state.selectedModel);
  const blendiOwnership = useOnboardingStore((state) => state.blendiOwnership);
  const otherBlenderModel = useOnboardingStore((state) => state.otherBlenderModel);
  const setModel = useOnboardingStore((state) => state.setModel);
  const setOtherBlenderModel = useOnboardingStore((state) => state.setOtherBlenderModel);
  const authUser = useAuthStore((state) => state.user);
  const updateUserProfile = useAuthStore((state) => state.updateUserProfile);

  // ── Nome a confirmar (Apple/Google sem nome real) ─────────────────────────
  // O usuário chega pelo hydrate do login, às vezes depois do primeiro
  // render: a etapa aparece quando a marca chega e continua visível depois
  // de salvo (para quem voltar a esta tela).
  const needsName = authUser?.nameNeedsConfirmation === true;
  const [isNameStepVisible, setIsNameStepVisible] = useState(needsName);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState(() => (needsName ? resolvePersonNameParts(authUser ?? {}).lastName : ''));
  const [showNameErrors, setShowNameErrors] = useState(false);
  const [nameSaveError, setNameSaveError] = useState<string | null>(null);
  const [isSavingName, setIsSavingName] = useState(false);
  const isSavingNameRef = useRef(false);

  useEffect(() => {
    if (needsName && !isNameStepVisible) {
      setIsNameStepVisible(true);
      // Sobrenome real (se a Apple/Google mandou) já vem preenchido; o nome
      // não — o salvo é só o começo do e-mail.
      setLastName(resolvePersonNameParts(authUser ?? {}).lastName);
    }
  }, [authUser, isNameStepVisible, needsName]);

  const nameValidation = validatePersonName(firstName, lastName);

  const handleContinue = async () => {
    if (selectedModel === null || isSavingNameRef.current) return;

    if (isNameStepVisible) {
      if (!nameValidation.isValid) {
        setShowNameErrors(true);
        return;
      }

      const current = resolvePersonNameParts(authUser ?? {});
      const nameChanged =
        needsName ||
        nameValidation.firstName !== current.firstName ||
        nameValidation.lastName !== current.lastName;

      if (nameChanged) {
        isSavingNameRef.current = true;
        setIsSavingName(true);
        setNameSaveError(null);
        try {
          await api.patch('/users/me', {
            firstName: nameValidation.firstName,
            lastName: nameValidation.lastName,
          });
          updateUserProfile({
            firstName: nameValidation.firstName,
            lastName: nameValidation.lastName,
            name: composeFullName(nameValidation.firstName, nameValidation.lastName),
            nameNeedsConfirmation: false,
          });
        } catch (error) {
          setNameSaveError(
            t(axios.isAxiosError(error) ? getAxiosErrorTranslationKey(error) : 'errors.network_internal_server_error'),
          );
          return;
        } finally {
          isSavingNameRef.current = false;
          setIsSavingName(false);
        }
      }
    }

    navigation.navigate('OnboardingGoal');
  };

  // Card selecionado: a posse quando não é um BLENDi atual, senão o modelo.
  const selectedOptionKey = selectedModel === null
    ? null
    : blendiOwnership === 'blendi' ? selectedModel : blendiOwnership;

  const opacity    = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 350,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 350,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY]);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
    },
    topContent: {
      gap: spacing.lg,
    },
    title: {
      color: colors.text.primary,
      fontFamily: fonts.display,
      fontSize: fontSizes['4xl'],
      lineHeight: 48,
    },
    subtitle: {
      color: colors.text.secondary,
      fontFamily: fonts.body,
      fontSize: fontSizes.md,
      lineHeight: 24,
    },
    cardList: {
      gap: spacing.md,
      paddingTop: spacing.sm,
    },
    nameBlock: {
      gap: spacing.md,
      paddingBottom: spacing.sm,
    },
    nameTitle: {
      color: colors.text.primary,
      fontFamily: fonts.display,
      fontSize: fontSizes['2xl'],
      lineHeight: 30,
    },
    nameError: {
      color: colors.feedback.error,
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
    },
  });

  return (
    <Animated.View style={[styles.container, { opacity, transform: [{ translateY }] }]}>
      <OnboardingLayout
        step={1}
        topContent={(
          <View style={styles.topContent}>
            {isNameStepVisible ? (
              <View style={styles.nameBlock} testID="onboarding-name-step">
                <Text accessibilityRole="header" style={styles.nameTitle}>
                  {t('onboarding.nameStep.title')}
                </Text>
                <Text style={styles.subtitle}>{t('onboarding.nameStep.subtitle')}</Text>
                <PersonNameFields
                  firstName={firstName}
                  lastName={lastName}
                  onChangeFirstName={(value) => {
                    setFirstName(value);
                    setNameSaveError(null);
                  }}
                  onChangeLastName={(value) => {
                    setLastName(value);
                    setNameSaveError(null);
                  }}
                  firstNameLabel={t('onboarding.nameStep.firstNameLabel')}
                  lastNameLabel={t('onboarding.nameStep.lastNameLabel')}
                  firstNameError={showNameErrors ? nameValidation.firstNameError : null}
                  lastNameError={showNameErrors ? nameValidation.lastNameError : null}
                  editable={!isSavingName}
                  testIDPrefix="onboarding-name"
                />
                {nameSaveError ? (
                  <Text accessibilityRole="alert" style={styles.nameError}>
                    {nameSaveError}
                  </Text>
                ) : null}
              </View>
            ) : null}
            <Text style={styles.title}>{t('onboarding.modelTitle')}</Text>
            <Text style={styles.subtitle}>{t('onboarding.modelSubtitle')}</Text>
            <View style={styles.cardList}>
              {BLENDER_OPTIONS.map(({ key, titleKey, badge, descKey }) => (
                <SelectionCard
                  key={key}
                  title={t(titleKey)}
                  badge={badge}
                  subtitle={t(descKey)}
                  selected={selectedOptionKey === key}
                  onPress={() => {
                    const { blendiModel, blendiOwnership: ownership } = resolveBlenderOption(key);
                    setModel(blendiModel, ownership);
                  }}
                />
              ))}
            </View>
            {selectedOptionKey === 'other' ? (
              <AuthInput
                value={otherBlenderModel}
                onChangeText={setOtherBlenderModel}
                placeholder={t('onboarding.otherModelPlaceholder')}
                maxLength={OTHER_BLENDER_MODEL_MAX_LENGTH}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="done"
              />
            ) : null}
          </View>
        )}
        bottomContent={(
          <AuthButton
            disabled={selectedModel === null || isSavingName}
            loading={isSavingName}
            onPress={() => { void handleContinue(); }}
            testID="onboarding-model-continue"
          >
            {t('onboarding.continue')}
          </AuthButton>
        )}
      />
    </Animated.View>
  );
}
