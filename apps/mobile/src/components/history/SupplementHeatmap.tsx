import { useEffect, useMemo, useRef, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';

import {
  colors,
  fonts,
  fontWeights,
} from '@blendi/shared';

import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useDateFormat } from '../../hooks/useDateFormat';

const GAP = 4;
const BACKDROP_COLOR = 'rgba(0,0,0,0.3)';
const SHEET_BORDER_COLOR = 'rgba(255,255,255,0.10)';
const HANDLE_COLOR = 'rgba(255,255,255,0.22)';
const NO_DATA_COLOR = 'rgba(255,255,255,0.06)';
const PARTIAL_COLOR = 'rgba(245,158,11,0.45)';
const GOOD_COLOR = 'rgba(154,72,147,0.50)';
const PERFECT_COLOR = 'rgba(34,197,94,0.70)';
const CHECK_COLOR = 'rgba(34,197,94,0.90)';
const MISSED_COLOR = 'rgba(248,113,113,0.88)';
const LIST_TEXT_MUTED = 'rgba(255,255,255,0.65)';
const SHEET_RADIUS = 24;

type PeriodValue = 7 | 30 | 90;

export interface SupplementHeatmapDatum {
  date: string;
  adherenceRate: number;
  checkedSupplements: string[];
  missedSupplements: string[];
}

interface SupplementHeatmapProps {
  data: SupplementHeatmapDatum[];
  period: PeriodValue;
}

function getCircleSize(period: PeriodValue): number {
  switch (period) {
    case 7:
      return 34;
    case 30:
      return 24;
    case 90:
      return 16;
  }
}

function hasData(entry: SupplementHeatmapDatum): boolean {
  return entry.checkedSupplements.length > 0 || entry.missedSupplements.length > 0;
}

function getCircleColor(entry: SupplementHeatmapDatum): string {
  if (!hasData(entry)) {
    return NO_DATA_COLOR;
  }

  if (entry.adherenceRate < 0.5) {
    return PARTIAL_COLOR;
  }

  if (entry.adherenceRate < 1) {
    return GOOD_COLOR;
  }

  return PERFECT_COLOR;
}

function getSheetSubtitle(entry: SupplementHeatmapDatum, noDataLabel: string): string {
  if (!hasData(entry)) {
    return noDataLabel;
  }

  return `${Math.round(entry.adherenceRate * 100)}%`;
}

export function SupplementHeatmap({ data, period }: SupplementHeatmapProps) {
  const { t } = useAppTranslation();
  const { formatDate } = useDateFormat();
  const { height } = useWindowDimensions();

  const translateY = useRef(new Animated.Value(height)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [isMounted, setIsMounted] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<SupplementHeatmapDatum | null>(null);

  const circleSize = getCircleSize(period);
  const entries = useMemo(
    () => [...data].sort((left, right) => left.date.localeCompare(right.date)).slice(-period),
    [data, period],
  );

  useEffect(() => {
    translateY.setValue(height);
  }, [height, translateY]);

  useEffect(() => {
    if (!selectedEntry) {
      const animation = Animated.parallel([
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
      ]);

      animation.start(({ finished }) => {
        if (finished) {
          setIsMounted(false);
        }
      });

      return () => {
        animation.stop();
      };
    }

    setIsMounted(true);

    const animation = Animated.parallel([
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
    ]);

    animation.start();

    return () => {
      animation.stop();
    };
  }, [backdropOpacity, height, selectedEntry, translateY]);

  const closeSheet = () => {
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
      if (!finished) {
        return;
      }

      setIsMounted(false);
      setSelectedEntry(null);
    });
  };

  return (
    <>
      <View style={styles.container}>
        <View style={styles.grid}>
          {entries.map((entry) => (
            <Pressable
              key={entry.date}
              accessibilityRole="button"
              onPress={() => setSelectedEntry(entry)}
              style={[
                styles.circle,
                {
                  width: circleSize,
                  height: circleSize,
                  borderRadius: circleSize / 2,
                  backgroundColor: getCircleColor(entry),
                },
              ]}
            />
          ))}
        </View>

        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: NO_DATA_COLOR }]} />
            <Text style={styles.legendLabel}>{t('history.noData')}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: PARTIAL_COLOR }]} />
            <Text style={styles.legendLabel}>{t('history.partial')}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: GOOD_COLOR }]} />
            <Text style={styles.legendLabel}>{t('history.good')}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: PERFECT_COLOR }]} />
            <Text style={styles.legendLabel}>{t('history.perfect')}</Text>
          </View>
        </View>
      </View>

      {isMounted && selectedEntry ? (
        <Modal transparent visible animationType="none" statusBarTranslucent>
          <View style={styles.modalRoot}>
            <Pressable accessibilityRole="button" onPress={closeSheet} style={StyleSheet.absoluteFill}>
              <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
            </Pressable>

            <Animated.View style={[styles.sheetContainer, { transform: [{ translateY }] }]}>
              <View style={styles.handle} />

              <Text style={styles.sheetTitle}>{formatDate(selectedEntry.date)}</Text>
              <Text style={styles.sheetSubtitle}>{getSheetSubtitle(selectedEntry, t('history.noData'))}</Text>

              <ScrollView
                bounces={false}
                contentContainerStyle={styles.sheetContent}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>{t('track.supplements.item_checked')}</Text>
                  {selectedEntry.checkedSupplements.length > 0 ? (
                    selectedEntry.checkedSupplements.map((name) => (
                      <View key={`checked-${name}`} style={styles.listItem}>
                        <Ionicons color={CHECK_COLOR} name="checkmark-circle" size={16} />
                        <Text style={styles.listItemText}>{name}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.emptyText}>{t('history.noData')}</Text>
                  )}
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>{t('track.supplements.item_unchecked')}</Text>
                  {selectedEntry.missedSupplements.length > 0 ? (
                    selectedEntry.missedSupplements.map((name) => (
                      <View key={`missed-${name}`} style={styles.listItem}>
                        <Ionicons color={MISSED_COLOR} name="close-circle" size={16} />
                        <Text style={styles.listItemText}>{name}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.emptyText}>{t('history.noData')}</Text>
                  )}
                </View>
              </ScrollView>
            </Animated.View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  circle: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    color: 'rgba(255,255,255,0.60)',
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: fontWeights.regular,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BACKDROP_COLOR,
  },
  sheetContainer: {
    maxHeight: '72%',
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    borderTopWidth: 1,
    borderColor: SHEET_BORDER_COLOR,
    backgroundColor: colors.background.secondary,
    paddingTop: 16,
    paddingHorizontal: 24,
    paddingBottom: 28,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: HANDLE_COLOR,
  },
  sheetTitle: {
    marginTop: 16,
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: fontWeights.bold,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  sheetSubtitle: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.65)',
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: fontWeights.medium,
    textAlign: 'center',
  },
  sheetContent: {
    gap: 16,
    paddingTop: 20,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: fontWeights.medium,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  listItemText: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: fontWeights.regular,
  },
  emptyText: {
    color: LIST_TEXT_MUTED,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: fontWeights.regular,
  },
});