import { useEffect, useMemo, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  InteractionManager,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import Svg, {
  G,
  Line,
  Rect,
} from 'react-native-svg';

import {
  colors,
  fonts,
  fontWeights,
} from '@blendi/shared';

import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useDateFormat } from '../../hooks/useDateFormat';
import { SkeletonLoader } from '../ui/SkeletonLoader';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

const BAR_ANIMATION_DURATION = 800;
const SVG_WIDTH_OFFSET = 48;
const CARD_LABEL_COLOR = 'rgba(255,255,255,0.55)';
const PROTEIN_COLOR = 'rgba(154,72,147,0.75)';
const CARBS_COLOR = 'rgba(245,158,11,0.70)';
const REMAINING_COLOR = 'rgba(107,114,128,0.35)';
const EMPTY_BAR_COLOR = 'rgba(255,255,255,0.16)';
const EMPTY_BAR_HEIGHT_RATIO = 0.16;
const TARGET_LINE_COLOR = 'rgba(255,255,255,0.20)';
const TOOLTIP_BACKGROUND = 'rgba(255,255,255,0.07)';
const TOOLTIP_BORDER = 'rgba(255,255,255,0.10)';
const TOOLTIP_WIDTH = 132;
const TOOLTIP_HEIGHT = 78;
const TOOLTIP_SPACING = 8;
const TOOLTIP_TOP_REGION = TOOLTIP_HEIGHT + TOOLTIP_SPACING;

type PeriodValue = 7 | 30 | 90;

export interface MacroBarChartDatum {
  date: string;
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
}

interface MacroBarChartProps {
  data: MacroBarChartDatum[];
  period: PeriodValue;
  calorieTarget: number;
  height?: number;
  animate?: boolean;
  isLoading?: boolean;
}

const LABELS_ROW_ESTIMATED_HEIGHT = 24;

interface ChartDatum extends MacroBarChartDatum {
  key: string;
  dayCount: number;
  isPlaceholder?: boolean;
}

function toDateKey(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function normalizeData(data: MacroBarChartDatum[], period: PeriodValue): MacroBarChartDatum[] {
  return [...data]
    .filter((item) => Number.isFinite(item.calories) && Number.isFinite(new Date(item.date).getTime()))
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-period);
}

function chunkIntoWeeks(data: MacroBarChartDatum[]): ChartDatum[] {
  const weeklyData: ChartDatum[] = [];

  for (let index = 0; index < data.length; index += 7) {
    const weekSlice = data.slice(index, index + 7);

    if (weekSlice.length === 0) {
      continue;
    }

    weeklyData.push({
      key: `week-${weeklyData.length + 1}`,
      date: weekSlice[0].date,
      protein: weekSlice.reduce((sum, item) => sum + item.protein, 0),
      carbs: weekSlice.reduce((sum, item) => sum + item.carbs, 0),
      fat: weekSlice.reduce((sum, item) => sum + item.fat, 0),
      calories: weekSlice.reduce((sum, item) => sum + item.calories, 0),
      dayCount: weekSlice.length,
    });
  }

  return weeklyData.slice(0, 13);
}

function buildPlaceholderDate(offset: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - offset);
  return date.toISOString();
}

function buildPlaceholderChartData(period: PeriodValue): ChartDatum[] {
  if (period === 90) {
    return Array.from({ length: 13 }, (_, index) => ({
      key: `placeholder-week-${index + 1}`,
      date: buildPlaceholderDate((12 - index) * 7),
      protein: 0,
      carbs: 0,
      fat: 0,
      calories: 0,
      dayCount: 7,
      isPlaceholder: true,
    }));
  }

  return Array.from({ length: period }, (_, index) => ({
    key: `placeholder-${index + 1}`,
    date: buildPlaceholderDate(period - index - 1),
    protein: 0,
    carbs: 0,
    fat: 0,
    calories: 0,
    dayCount: 1,
    isPlaceholder: true,
  }));
}

function buildChartData(data: MacroBarChartDatum[], period: PeriodValue): ChartDatum[] {
  const normalized = normalizeData(data, period);

  if (normalized.length === 0) {
    return buildPlaceholderChartData(period);
  }

  if (period === 90) {
    return chunkIntoWeeks(normalized);
  }

  return normalized.map((item) => ({
    ...item,
    key: toDateKey(item.date),
    dayCount: 1,
  }));
}

function isSunday(date: string): boolean {
  return new Date(`${toDateKey(date)}T12:00:00`).getDay() === 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function MacroBarChart({
  data,
  period,
  calorieTarget,
  height = 160,
  animate = true,
  isLoading = false,
}: MacroBarChartProps) {
  const { t } = useAppTranslation();
  const { formatWeekdayShort, formatShortDate } = useDateFormat();
  const progress = useMemo(() => new Animated.Value(0), []);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const svgWidth = Math.max(Dimensions.get('window').width - SVG_WIDTH_OFFSET, 0);

  const chartData = useMemo(() => buildChartData(data, period), [data, period]);

  const barCount = Math.max(chartData.length, 1);
  const slotWidth = svgWidth / barCount;
  const barGap = slotWidth * 0.22;
  const barWidth = Math.max(slotWidth - barGap, 4);
  const normalizedTarget = period === 90 ? calorieTarget * 7 : calorieTarget;
  const maxCalories = Math.max(...chartData.map((item) => item.calories), 0);
  const yAxisMax = Math.max(maxCalories, normalizedTarget, 1) * 1.2;

  useEffect(() => {
    if (!animate) {
      progress.setValue(1);
      return;
    }

    let animation: Animated.CompositeAnimation | null = null;
    const task = InteractionManager.runAfterInteractions(() => {
      progress.stopAnimation();
      progress.setValue(0);

      animation = Animated.timing(progress, {
        toValue: 1,
        duration: BAR_ANIMATION_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      });

      animation.start();
    });

    return () => {
      task.cancel();
      animation?.stop();
      progress.stopAnimation();
    };
  }, [period, progress, animate]);

  useEffect(() => {
    setSelectedIndex(null);
  }, [period, data]);

  const labels = useMemo(() => {
    return chartData.map((item, index) => {
      if (period === 7) {
        return formatWeekdayShort(item.date);
      }

      if (period === 30) {
        return isSunday(item.date) ? formatShortDate(item.date) : '';
      }

      return t('history.week', { number: index + 1 });
    });
  }, [chartData, formatShortDate, formatWeekdayShort, period, t]);

  const selectedDatum = selectedIndex === null ? null : chartData[selectedIndex];
  const tooltipDatum = selectedDatum?.isPlaceholder ? null : selectedDatum;

  const tooltipStyle = useMemo(() => {
    if (selectedIndex === null || !tooltipDatum) {
      return null;
    }

    const centerX = slotWidth * selectedIndex + (slotWidth / 2);
    const proteinCalories = tooltipDatum.protein * 4;
    const carbsCalories = tooltipDatum.carbs * 4;
    const remainingCalories = Math.max(tooltipDatum.calories - proteinCalories - carbsCalories, 0);
    const totalHeight = (tooltipDatum.calories / yAxisMax) * height;
    const barTop = height - totalHeight;

    return {
      left: clamp(centerX - (TOOLTIP_WIDTH / 2), 0, Math.max(svgWidth - TOOLTIP_WIDTH, 0)),
      top: clamp(
        TOOLTIP_TOP_REGION + barTop - TOOLTIP_HEIGHT - TOOLTIP_SPACING,
        0,
        Math.max(TOOLTIP_TOP_REGION + height - TOOLTIP_HEIGHT, 0),
      ),
      remainingCalories,
    };
  }, [height, tooltipDatum, selectedIndex, slotWidth, svgWidth, yAxisMax]);

  const targetLineY = height - ((Math.min(normalizedTarget, yAxisMax) / yAxisMax) * height);

  if (isLoading) {
    return (
      <View style={[styles.container, { width: svgWidth }]}>
        <SkeletonLoader
          variant="card"
          style={{ width: svgWidth, height: height + TOOLTIP_TOP_REGION + LABELS_ROW_ESTIMATED_HEIGHT }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { width: svgWidth }]}>
      <View style={[styles.chartStage, { width: svgWidth, paddingTop: TOOLTIP_TOP_REGION }]}> 
        <Svg height={height} width={svgWidth}>
          <Line
            x1={0}
            x2={svgWidth}
            y1={targetLineY}
            y2={targetLineY}
            stroke={TARGET_LINE_COLOR}
            strokeDasharray="4,3"
            strokeWidth={1}
          />

          {chartData.map((item, index) => {
            const x = (slotWidth * index) + (barGap / 2);
            const proteinCalories = item.protein * 4;
            const carbsCalories = item.carbs * 4;
            const remainingCalories = Math.max(item.calories - proteinCalories - carbsCalories, 0);
            const placeholderHeight = item.isPlaceholder ? height * EMPTY_BAR_HEIGHT_RATIO : 0;

            const proteinHeight = item.isPlaceholder ? 0 : (proteinCalories / yAxisMax) * height;
            const carbsHeight = item.isPlaceholder ? 0 : (carbsCalories / yAxisMax) * height;
            const remainingHeight = item.isPlaceholder
              ? placeholderHeight
              : (remainingCalories / yAxisMax) * height;

            const proteinY = height - proteinHeight;
            const carbsY = proteinY - carbsHeight;
            const remainingY = carbsY - remainingHeight;

            return (
              <G key={item.key}>
                <AnimatedRect
                  fill={PROTEIN_COLOR}
                  height={progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, proteinHeight],
                  })}
                  rx={barWidth / 2}
                  width={barWidth}
                  x={x}
                  y={progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [height, proteinY],
                  })}
                />

                <AnimatedRect
                  fill={CARBS_COLOR}
                  height={progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, carbsHeight],
                  })}
                  rx={barWidth / 2}
                  width={barWidth}
                  x={x}
                  y={progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [height, carbsY],
                  })}
                />

                <AnimatedRect
                  fill={item.isPlaceholder ? EMPTY_BAR_COLOR : REMAINING_COLOR}
                  height={progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, remainingHeight],
                  })}
                  rx={barWidth / 2}
                  width={barWidth}
                  x={x}
                  y={progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [height, remainingY],
                  })}
                />

                <Rect
                  fill="transparent"
                  height={height}
                  onPress={item.isPlaceholder ? undefined : () => setSelectedIndex(index)}
                  width={slotWidth}
                  x={slotWidth * index}
                  y={0}
                />
              </G>
            );
          })}
        </Svg>

        {tooltipDatum && tooltipStyle ? (
          <>
            <View style={[styles.tooltip, { left: tooltipStyle.left, top: tooltipStyle.top }]}> 
              <Text style={[styles.tooltipText, styles.tooltipProtein]}>
                {`${t('common.macros.protein')} ${Math.round(tooltipDatum.protein)}${t('common.units.grams')}`}
              </Text>
              <Text style={[styles.tooltipText, styles.tooltipCarbs]}>
                {`${t('common.macros.carbs')} ${Math.round(tooltipDatum.carbs)}${t('common.units.grams')}`}
              </Text>
              <Text style={[styles.tooltipText, styles.tooltipCalories]}>
                {`${t('common.macros.calories')} ${Math.round(tooltipDatum.calories)} ${t('common.units.kilocalories')}`}
              </Text>
            </View>

            <TouchableWithoutFeedback onPress={() => setSelectedIndex(null)}>
              <View style={[styles.dismissLayer, { height, top: TOOLTIP_TOP_REGION, width: svgWidth }]} />
            </TouchableWithoutFeedback>
          </>
        ) : null}
      </View>

      <View style={[styles.labelsRow, { width: svgWidth }]}> 
        {labels.map((label, index) => (
          <View key={`${chartData[index]?.key ?? index}-label`} style={[styles.labelSlot, { width: slotWidth }]}> 
            <Text numberOfLines={1} style={styles.labelText}>
              {label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
  },
  chartStage: {
    position: 'relative',
  },
  dismissLayer: {
    position: 'absolute',
    left: 0,
    zIndex: 1,
  },
  tooltip: {
    position: 'absolute',
    zIndex: 2,
    width: TOOLTIP_WIDTH,
    minHeight: TOOLTIP_HEIGHT,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TOOLTIP_BORDER,
    backgroundColor: TOOLTIP_BACKGROUND,
    justifyContent: 'center',
    gap: 4,
  },
  tooltipText: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: fontWeights.medium,
  },
  tooltipProtein: {
    color: colors.brand.pulse,
  },
  tooltipCarbs: {
    color: 'rgba(245,158,11,1)',
  },
  tooltipCalories: {
    color: colors.text.primary,
  },
  labelsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 10,
  },
  labelSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelText: {
    color: CARD_LABEL_COLOR,
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: fontWeights.regular,
    textAlign: 'center',
  },
});