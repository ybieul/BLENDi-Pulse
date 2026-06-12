// apps/mobile/src/components/me/DailyPulseTimeSheet.tsx
// Bottom sheet para selecionar o horário do Daily Pulse.
// Usa dois scroll-wheels puros (ScrollView) sem dependência nativa extra.
// Mesma arquitetura de animação dos outros sheets do app (BadgeDetailSheet).

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, fontSizes, fontWeights, spacing } from '@blendi/shared';

import { useAppTranslation } from '../../hooks/useAppTranslation';
import { AuthButton } from '../ui/AuthButton';

// ─── Constantes ───────────────────────────────────────────────────────────────

const SHEET_RADIUS = 24;
const SHEET_BORDER_COLOR = 'rgba(255,255,255,0.10)';
const HANDLE_COLOR = 'rgba(255,255,255,0.22)';
const BACKDROP_COLOR = 'rgba(0,0,0,0.55)';
const WHEEL_HIGHLIGHT_BG = 'rgba(255,255,255,0.07)';
const WHEEL_HIGHLIGHT_BORDER = 'rgba(255,255,255,0.14)';
const ITEM_HEIGHT = 48;
const VISIBLE_ITEMS = 5;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const PADDING_VERTICAL = ITEM_HEIGHT * 2;
const DIM_OPACITY = 0.30;
const SEPARATOR_OPACITY = 0.35;
const TITLE_OPACITY = 0.75;

// ─── Dados dos wheels ─────────────────────────────────────────────────────────

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

function twoDigits(n: number): string {
  return String(n).padStart(2, '0');
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface DailyPulseTimeSheetProps {
  visible: boolean;
  initialHour: number;
  initialMinute: number;
  onConfirm: (time: { hour: number; minute: number }) => void;
  onClose: () => void;
}

// ─── WheelColumn ──────────────────────────────────────────────────────────────

interface WheelColumnProps {
  items: number[];
  initialIndex: number;
  onIndexChange: (index: number) => void;
  isOpen: boolean;
}

function WheelColumn({ items, initialIndex, onIndexChange, isOpen }: WheelColumnProps) {
  const scrollRef = useRef<ScrollView>(null);
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);

  useEffect(() => {
    if (!isOpen) return;

    setSelectedIndex(initialIndex);
    const timeoutId = setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: initialIndex * ITEM_HEIGHT,
        animated: false,
      });
    }, 80);

    return () => { clearTimeout(timeoutId); };
  }, [isOpen, initialIndex]);

  const handleScrollEnd = useCallback(
    (event: { nativeEvent: { contentOffset: { y: number } } }) => {
      const raw = event.nativeEvent.contentOffset.y;
      const index = Math.max(0, Math.min(items.length - 1, Math.round(raw / ITEM_HEIGHT)));

      setSelectedIndex(index);
      onIndexChange(index);

      scrollRef.current?.scrollTo({ y: index * ITEM_HEIGHT, animated: true });
    },
    [items.length, onIndexChange],
  );

  return (
    <View style={wheelStyles.column}>
      {/* Centro highlight — fica atrás do texto mas sobre o scroll shadow */}
      <View style={wheelStyles.centerHighlight} pointerEvents="none" />

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        contentContainerStyle={wheelStyles.scrollContent}
        onScrollEndDrag={handleScrollEnd}
        onMomentumScrollEnd={handleScrollEnd}
        scrollEventThrottle={16}
        style={wheelStyles.scroll}
      >
        {items.map((item, idx) => (
          <View key={item} style={wheelStyles.item}>
            <Text
              style={[
                wheelStyles.itemText,
                idx !== selectedIndex && wheelStyles.itemTextDim,
              ]}
            >
              {twoDigits(item)}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── DailyPulseTimeSheet ──────────────────────────────────────────────────────

export function DailyPulseTimeSheet({
  visible,
  initialHour,
  initialMinute,
  onConfirm,
  onClose,
}: DailyPulseTimeSheetProps) {
  const { t } = useAppTranslation();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const translateY = useRef(new Animated.Value(height)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const selectedHourRef = useRef(initialHour);
  const selectedMinuteRef = useRef(initialMinute);

  useEffect(() => {
    if (visible) {
      selectedHourRef.current = initialHour;
      selectedMinuteRef.current = initialMinute;
      setIsMounted(true);
      setIsOpen(false);

      // Pequeno delay para o Modal ficar visível antes de animar
      const openId = setTimeout(() => {
        setIsOpen(true);

        Animated.parallel([
          Animated.timing(backdropOpacity, {
            toValue: 1,
            duration: 200,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.spring(translateY, {
            toValue: 0,
            stiffness: 230,
            damping: 28,
            mass: 0.9,
            useNativeDriver: true,
          }),
        ]).start();
      }, 20);

      return () => { clearTimeout(openId); };
    }

    setIsOpen(false);

    const animation = Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 160,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: height,
        duration: 200,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    animation.start(({ finished }) => {
      if (finished) {
        setIsMounted(false);
        translateY.setValue(height);
      }
    });

    return () => { animation.stop(); };
  }, [visible, backdropOpacity, height, initialHour, initialMinute, translateY]);

  const handleConfirm = useCallback(() => {
    onConfirm({
      hour: selectedHourRef.current,
      minute: selectedMinuteRef.current,
    });
    onClose();
  }, [onConfirm, onClose]);

  if (!isMounted) {
    return null;
  }

  return (
    <Modal transparent visible={isMounted} animationType="none" statusBarTranslucent>
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFillObject}
        >
          <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
        </Pressable>

        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, spacing.xl) },
            { transform: [{ translateY }] },
          ]}
        >
          <View style={styles.handle} />

          <Text style={styles.title}>{t('me.notifications.timePicker.title')}</Text>

          <View style={styles.wheelsRow}>
            <WheelColumn
              items={HOURS}
              initialIndex={initialHour}
              isOpen={isOpen}
              onIndexChange={(idx) => { selectedHourRef.current = idx; }}
            />

            <Text style={styles.separator}>:</Text>

            <WheelColumn
              items={MINUTES}
              initialIndex={initialMinute}
              isOpen={isOpen}
              onIndexChange={(idx) => { selectedMinuteRef.current = idx; }}
            />
          </View>

          <View style={styles.confirmButton}>
            <AuthButton onPress={handleConfirm}>
              {t('me.notifications.timePicker.done')}
            </AuthButton>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const wheelStyles = StyleSheet.create({
  column: {
    width: 80,
    height: WHEEL_HEIGHT,
    overflow: 'hidden',
    position: 'relative',
  },
  centerHighlight: {
    position: 'absolute',
    top: ITEM_HEIGHT * 2,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    backgroundColor: WHEEL_HIGHLIGHT_BG,
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: WHEEL_HIGHLIGHT_BORDER,
    zIndex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: PADDING_VERTICAL,
  },
  item: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: fontWeights.bold,
    letterSpacing: -0.5,
  },
  itemTextDim: {
    opacity: DIM_OPACITY,
  },
});

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BACKDROP_COLOR,
  },
  sheet: {
    backgroundColor: colors.background.secondary,
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    borderTopWidth: 1,
    borderColor: SHEET_BORDER_COLOR,
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingHorizontal: spacing['3xl'],
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: HANDLE_COLOR,
  },
  title: {
    marginTop: spacing.xl,
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    opacity: TITLE_OPACITY,
    letterSpacing: -0.3,
  },
  wheelsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  separator: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: fontWeights.bold,
    opacity: SEPARATOR_OPACITY,
    marginBottom: 4,
  },
  confirmButton: {
    width: '100%',
    marginTop: spacing['3xl'],
  },
});
