import { type ComponentProps, useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  borderRadius,
  colors,
  fontSizes,
  fonts,
  fontWeights,
  spacing,
} from '@blendi/shared';
import { AuroraBackground } from '../components/ui/AuroraBackground';
import { AuthButton } from '../components/ui';
import { PRICING_CONFIG } from '../config/pricing.config';
import { usePulseProPurchase } from '../hooks/usePulseProPurchase';
import { useAppTranslation } from '../hooks/useAppTranslation';
import type { RootStackParamList } from '../navigation/types';
import type { PurchasePlanId } from '../services/purchase.service';
import { formatUsdCurrency } from '../utils/pricing.utils';

const TERMS_URL = 'https://blendi.app/terms';
const PRIVACY_URL = 'https://blendi.app/privacy';
const GOLD_GRADIENT = ['#FDE68A', '#F59E0B', '#F97316'] as const;
const BUTTON_GRADIENT = ['#FACC15', '#F59E0B'] as const;
const HERO_GLOW_TOP = ['rgba(245,158,11,0.18)', 'transparent'] as const;
const HERO_GLOW_BOTTOM = ['rgba(236,72,153,0.14)', 'transparent'] as const;
const CARD_BACKGROUND = 'rgba(255,255,255,0.08)';
const CARD_BORDER = 'rgba(255,255,255,0.12)';
const CARD_SELECTED_BACKGROUND = 'rgba(245,158,11,0.16)';
const CARD_SELECTED_BORDER = 'rgba(245,158,11,0.42)';
const BADGE_BACKGROUND = 'rgba(245,158,11,0.18)';
const BADGE_BORDER = 'rgba(245,158,11,0.34)';
const BENEFIT_ICON_BG = 'rgba(245,158,11,0.16)';
const LEGAL_OPACITY = 0.72;

type IoniconName = ComponentProps<typeof Ionicons>['name'];

type UpgradeScreenProps = NativeStackScreenProps<RootStackParamList, 'Upgrade'>;

interface DisplayPlan {
  id: PurchasePlanId;
  title: string;
  description: string;
  priceString: string;
  monthlyEquivalent?: string;
  savingsText?: string;
}

export function UpgradeScreen({ navigation }: UpgradeScreenProps) {
  const insets = useSafeAreaInsets();
  const { t, locale } = useAppTranslation();
  const { activePlanId, isRestoring, purchaseProPlan, restoreProAccess } = usePulseProPurchase();
  const [selectedPlanId, setSelectedPlanId] = useState<PurchasePlanId>('annual');

  const annualSavingsPercent = useMemo(() => {
    const yearlyMonthlyTotal = PRICING_CONFIG.PRO_MONTHLY_PRICE_USD * 12;
    if (yearlyMonthlyTotal <= 0) {
      return 0;
    }

    return Math.max(
      0,
      Math.round(
        ((yearlyMonthlyTotal - PRICING_CONFIG.PRO_ANNUAL_PRICE_USD) / yearlyMonthlyTotal) * 100,
      ),
    );
  }, []);

  const plans = useMemo<DisplayPlan[]>(() => {
    const monthlyPriceString = formatUsdCurrency(locale, PRICING_CONFIG.PRO_MONTHLY_PRICE_USD);
    const annualPriceString = formatUsdCurrency(locale, PRICING_CONFIG.PRO_ANNUAL_PRICE_USD);
    const annualMonthlyEquivalent = formatUsdCurrency(
      locale,
      PRICING_CONFIG.PRO_ANNUAL_PRICE_USD / 12,
    );

    return [
      {
        id: 'monthly',
        title: t('me.upgradeScreen.plans.monthly'),
        description: t('me.upgradeScreen.plans.monthlyDescription'),
        priceString: monthlyPriceString,
      },
      {
        id: 'annual',
        title: t('me.upgradeScreen.plans.annual'),
        description: t('me.upgradeScreen.plans.annualDescription'),
        priceString: annualPriceString,
        monthlyEquivalent: t('me.upgradeScreen.plans.annualEquivalent', {
          price: annualMonthlyEquivalent,
        }),
        savingsText: t('me.upgradeScreen.plans.save', { percent: annualSavingsPercent }),
      },
    ];
  }, [annualSavingsPercent, locale, t]);

  const benefitItems = useMemo(
    () => [
      { key: 'pulse-ai', icon: 'chatbubble-ellipses' as IoniconName, text: t('me.upgradeScreen.benefitPulseAI') },
      { key: 'pantry', icon: 'camera' as IoniconName, text: t('me.upgradeScreen.benefitPantry') },
      { key: 'lists', icon: 'list' as IoniconName, text: t('me.upgradeScreen.benefitLists') },
      { key: 'report', icon: 'stats-chart' as IoniconName, text: t('me.upgradeScreen.benefitReport') },
      { key: 'badge', icon: 'ribbon' as IoniconName, text: t('me.upgradeScreen.benefitBadge') },
    ],
    [t],
  );

  const isPurchasingSelectedPlan = activePlanId === selectedPlanId;
  const isBusy = isRestoring || activePlanId !== null;

  const handleClose = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('AppFlow');
  };

  const handlePurchase = () => {
    void purchaseProPlan(selectedPlanId, { onActivated: handleClose });
  };

  const handleRestore = () => {
    void restoreProAccess({ onActivated: handleClose });
  };

  return (
    <View style={styles.root}>
      <AuroraBackground intensity="full" />

      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        <LinearGradient colors={HERO_GLOW_TOP} style={styles.topGlow} />
        <LinearGradient colors={HERO_GLOW_BOTTOM} style={styles.bottomGlow} />
        <View style={styles.orbPrimary} />
        <View style={styles.orbSecondary} />
      </View>

      <ScrollView
        bounces={false}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing['3xl'] },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerSpacer} />
          <Pressable accessibilityRole="button" onPress={handleClose} style={styles.closeButton}>
            <Ionicons color={colors.text.primary} name="close" size={20} />
          </Pressable>
        </View>

        <View style={styles.heroCard}>
          <LinearGradient colors={GOLD_GRADIENT} style={styles.proBadge}>
            <Text style={styles.proBadgeText}>{t('me.upgradeScreen.badge')}</Text>
          </LinearGradient>

          <Text style={styles.title}>{t('me.upgradeScreen.title')}</Text>
          <Text style={styles.subtitle}>{t('me.upgradeScreen.subtitle')}</Text>
        </View>

        <View style={styles.benefitsCard}>
          {benefitItems.map((benefit) => (
            <View key={benefit.key} style={styles.benefitRow}>
              <View style={styles.benefitIconShell}>
                <Ionicons color={colors.feedback.success} name={benefit.icon} size={18} />
              </View>
              <Text style={styles.benefitText}>{benefit.text}</Text>
            </View>
          ))}
        </View>

        <View style={styles.planRow}>
          {plans.map((plan) => {
            const isSelected = plan.id === selectedPlanId;

            return (
              <Pressable
                key={plan.id}
                accessibilityRole="button"
                disabled={isBusy}
                onPress={() => {
                  setSelectedPlanId(plan.id);
                }}
                style={[
                  styles.planCard,
                  isSelected ? styles.planCardSelected : null,
                ]}
              >
                <View style={styles.planTopRow}>
                  <Text style={[styles.planTitle, isSelected ? styles.planTitleSelected : null]}>
                    {plan.title}
                  </Text>
                  {isSelected ? (
                    <Ionicons color={colors.feedback.success} name="checkmark-circle" size={18} />
                  ) : null}
                </View>

                {plan.savingsText ? (
                  <View style={styles.saveBadge}>
                    <Text style={styles.saveBadgeText}>{plan.savingsText}</Text>
                  </View>
                ) : null}

                <Text style={styles.planPrice}>{plan.priceString}</Text>
                <Text style={styles.planDescription}>{plan.description}</Text>

                {plan.monthlyEquivalent ? (
                  <Text style={styles.planEquivalent}>{plan.monthlyEquivalent}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.ctaSection}>
          <View style={styles.ctaButtonShell}>
            <LinearGradient colors={BUTTON_GRADIENT} style={StyleSheet.absoluteFillObject} />
            <AuthButton
              disabled={isBusy}
              loading={isPurchasingSelectedPlan}
              onPress={handlePurchase}
              style={styles.ctaButton}
            >
              {selectedPlanId === 'annual'
                ? t('me.upgradeScreen.ctaAnnual')
                : t('me.upgradeScreen.ctaMonthly')}
            </AuthButton>
          </View>
        </View>

        <Text style={styles.restoreDescription}>{t('me.upgradeScreen.restoreDescription')}</Text>

        <View style={styles.footerLinks}>
          <Pressable accessibilityRole="button" disabled={isBusy} onPress={handleRestore}>
            <Text style={styles.footerLink}>{t('common.actions.restore')}</Text>
          </Pressable>
          <Text style={styles.footerSeparator}>·</Text>
          <Pressable accessibilityRole="button" onPress={() => { void Linking.openURL(TERMS_URL); }}>
            <Text style={styles.footerLink}>{t('auth.termsOfService')}</Text>
          </Pressable>
          <Text style={styles.footerSeparator}>·</Text>
          <Pressable accessibilityRole="button" onPress={() => { void Linking.openURL(PRIVACY_URL); }}>
            <Text style={styles.footerLink}>{t('auth.privacyPolicy')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  content: {
    paddingHorizontal: spacing.xl,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing['2xl'],
  },
  headerSpacer: {
    width: 44,
    height: 44,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  heroCard: {
    alignItems: 'center',
    marginBottom: spacing['2xl'],
  },
  proBadge: {
    width: 92,
    height: 92,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    shadowColor: '#F59E0B',
    shadowOpacity: 0.32,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  proBadgeText: {
    color: '#2D1600',
    fontFamily: fonts.display,
    fontSize: 30,
    fontWeight: fontWeights.bold,
    letterSpacing: 0.8,
  },
  title: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 30,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
    lineHeight: 36,
  },
  subtitle: {
    marginTop: spacing.md,
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    lineHeight: 24,
    textAlign: 'center',
    maxWidth: 340,
  },
  benefitsCard: {
    backgroundColor: CARD_BACKGROUND,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: spacing.xl,
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  benefitIconShell: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BENEFIT_ICON_BG,
    borderWidth: 1,
    borderColor: BADGE_BORDER,
  },
  benefitText: {
    flex: 1,
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    lineHeight: 22,
  },
  planRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  planCard: {
    flex: 1,
    backgroundColor: CARD_BACKGROUND,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: spacing.lg,
    minHeight: 184,
  },
  planCardSelected: {
    backgroundColor: CARD_SELECTED_BACKGROUND,
    borderColor: CARD_SELECTED_BORDER,
    shadowColor: '#F59E0B',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  planTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  planTitle: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
  },
  planTitleSelected: {
    color: '#FFE7A6',
  },
  saveBadge: {
    alignSelf: 'flex-start',
    backgroundColor: BADGE_BACKGROUND,
    borderWidth: 1,
    borderColor: BADGE_BORDER,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    marginBottom: spacing.md,
  },
  saveBadgeText: {
    color: '#FFE7A6',
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  planPrice: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: fontWeights.bold,
    marginBottom: spacing.xs,
  },
  planDescription: {
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    lineHeight: 20,
  },
  planEquivalent: {
    marginTop: spacing.sm,
    color: '#FFE7A6',
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    lineHeight: 18,
  },
  ctaSection: {
    marginBottom: spacing.md,
  },
  ctaButtonShell: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#F59E0B',
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  ctaButton: {
    backgroundColor: 'transparent',
  },
  restoreDescription: {
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  footerLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  footerLink: {
    color: colors.text.secondary,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    opacity: LEGAL_OPACITY,
    textDecorationLine: 'underline',
  },
  footerSeparator: {
    color: colors.text.secondary,
    opacity: LEGAL_OPACITY,
  },
  topGlow: {
    position: 'absolute',
    top: -40,
    left: -20,
    right: -20,
    height: 220,
  },
  bottomGlow: {
    position: 'absolute',
    left: -20,
    right: -20,
    bottom: 0,
    height: 220,
  },
  orbPrimary: {
    position: 'absolute',
    top: 92,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(245,158,11,0.14)',
  },
  orbSecondary: {
    position: 'absolute',
    left: -50,
    bottom: 140,
    width: 160,
    height: 160,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(236,72,153,0.12)',
  },
});
