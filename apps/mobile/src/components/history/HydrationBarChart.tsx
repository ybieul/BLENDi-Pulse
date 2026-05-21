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

import { useDateFormat } from '../../hooks/useDateFormat';
import { useUnits } from '../../hooks/useUnits';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

const BAR_ANIMATION_DURATION = 800;
const SVG_WIDTH_OFFSET = 48;
const BAR_DEFAULT_COLOR = 'rgba(59,130,246,0.60)';
const BAR_SUCCESS_COLOR = 'rgba(34,197,94,0.75)';
const EMPTY_BAR_COLOR = 'rgba(255,255,255,0.16)';
const EMPTY_BAR_HEIGHT_RATIO = 0.16;
const TARGET_LINE_COLOR = 'rgba(34,197,94,0.25)';
const LABEL_COLOR = 'rgba(255,255,255,0.55)';
const TOOLTIP_BACKGROUND = 'rgba(255,255,255,0.07)';
const TOOLTIP_BORDER = 'rgba(255,255,255,0.10)';
const TOOLTIP_WIDTH = 144;
const TOOLTIP_HEIGHT = 58;
const TOOLTIP_SPACING = 8;
const TOOLTIP_TOP_REGION = TOOLTIP_HEIGHT + TOOLTIP_SPACING;

type PeriodValue = 7 | 30 | 90;

export interface HydrationBarChartDatum {
  date: string;
  totalMl: number;
}

interface HydrationBarChartProps {
  data: HydrationBarChartDatum[];
  period: PeriodValue;
  dailyTarget: number;
  animate?: boolean;
}

interface ChartDatum {
  key: string;
  date: string;
  totalMl: number;
  dayCount: number;
  isPlaceholder?: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toDateKey(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function normalizeData(data: HydrationBarChartDatum[], period: PeriodValue): HydrationBarChartDatum[] {
  return [...data]
    .filter((item) => Number.isFinite(item.totalMl) && Number.isFinite(new Date(item.date).getTime()))
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-period);
}

function chunkIntoWeeklyAverages(data: HydrationBarChartDatum[]): ChartDatum[] {
  const weeklyData: ChartDatum[] = [];

  for (let index = 0; index < data.length; index += 7) {
    const weekSlice = data.slice(index, index + 7);

    if (weekSlice.length === 0) {
      continue;
    }

    const total = weekSlice.reduce((sum, item) => sum + item.totalMl, 0);

    weeklyData.push({
      key: `week-${weeklyData.length + 1}`,
      date: weekSlice[0].date,
      totalMl: total / weekSlice.length,
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
      totalMl: 0,
      dayCount: 7,
      isPlaceholder: true,
    }));
  }

  return Array.from({ length: period }, (_, index) => ({
    key: `placeholder-${index + 1}`,
    date: buildPlaceholderDate(period - index - 1),
    totalMl: 0,
    dayCount: 1,
    isPlaceholder: true,
  }));
}

function buildChartData(data: HydrationBarChartDatum[], period: PeriodValue): ChartDatum[] {
  const normalized = normalizeData(data, period);

  if (normalized.length === 0) {
    return buildPlaceholderChartData(period);
  }

  if (period === 90) {
    return chunkIntoWeeklyAverages(normalized);
  }

  return normalized.map((item) => ({
    key: toDateKey(item.date),
    date: item.date,
    totalMl: item.totalMl,
    dayCount: 1,
  }));
}

function isSunday(date: string): boolean {
  return new Date(`${toDateKey(date)}T12:00:00`).getDay() === 0;
}

export function HydrationBarChart({
  data,
  period,
  dailyTarget,
  animate = true,
}: HydrationBarChartProps) {
  const { formatWeekdayShort, formatShortDate } = useDateFormat();
  const { displayVolume: displayMetricVolume } = useUnits('metric');
  const { displayVolume: displayImperialVolume } = useUnits('imperial');
  const progress = useMemo(() => new Animated.Value(0), []);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const svgWidth = Math.max(Dimensions.get('window').width - SVG_WIDTH_OFFSET, 0);
  const chartHeight = 160;
  const chartData = useMemo(() => buildChartData(data, period), [data, period]);

  const barCount = Math.max(chartData.length, 1);
  const slotWidth = svgWidth / barCount;
  const barGap = slotWidth * 0.22;
  const barWidth = Math.max(slotWidth - barGap, 4);
  const maxValue = Math.max(...chartData.map((item) => item.totalMl), 0);
  const yAxisMax = Math.max(maxValue, dailyTarget, 1) * 1.2;

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
  }, [data, period]);

  const labels = useMemo(() => {
    return chartData.map((item, index) => {
      if (period === 7) {
        return formatWeekdayShort(item.date);
      }

      if (period === 30) {
        return isSunday(item.date) ? formatShortDate(item.date) : '';
      }

      return `${index + 1}`;
    });
  }, [chartData, formatShortDate, formatWeekdayShort, period]);

  const targetLineY = chartHeight - ((Math.min(dailyTarget, yAxisMax) / yAxisMax) * chartHeight);
  const selectedDatum = selectedIndex === null ? null : chartData[selectedIndex];
  const tooltipDatum = selectedDatum?.isPlaceholder ? null : selectedDatum;

  const tooltipStyle = useMemo(() => {
    if (selectedIndex === null || !tooltipDatum) {
      return null;
    }

    const centerX = slotWidth * selectedIndex + (slotWidth / 2);
    const totalHeight = (tooltipDatum.totalMl / yAxisMax) * chartHeight;
    const barTop = chartHeight - totalHeight;

    return {
      left: clamp(centerX - (TOOLTIP_WIDTH / 2), 0, Math.max(svgWidth - TOOLTIP_WIDTH, 0)),
      top: clamp(
        TOOLTIP_TOP_REGION + barTop - TOOLTIP_HEIGHT - TOOLTIP_SPACING,
        0,
        Math.max(TOOLTIP_TOP_REGION + chartHeight - TOOLTIP_HEIGHT, 0),
      ),
    };
  }, [chartHeight, tooltipDatum, selectedIndex, slotWidth, svgWidth, yAxisMax]);

  return (
    <View style={[styles.container, { width: svgWidth }]}> 
      <View style={[styles.chartStage, { width: svgWidth, paddingTop: TOOLTIP_TOP_REGION }]}> 
        <Svg height={chartHeight} width={svgWidth}>
          <Line
            x1={0}
            x2={svgWidth}
            y1={targetLineY}
            y2={targetLineY}
            stroke={TARGET_LINE_COLOR}
            strokeWidth={1}
          />

          {chartData.map((item, index) => {
            const x = (slotWidth * index) + (barGap / 2);
            const finalHeight = item.isPlaceholder
              ? chartHeight * EMPTY_BAR_HEIGHT_RATIO
              : (item.totalMl / yAxisMax) * chartHeight;
            const finalY = chartHeight - finalHeight;
            const fill = item.isPlaceholder
              ? EMPTY_BAR_COLOR
              : item.totalMl >= dailyTarget
                ? BAR_SUCCESS_COLOR
                : BAR_DEFAULT_COLOR;

            return (
              <G key={item.key}>
                <AnimatedRect
                  fill={fill}
                  height={progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, finalHeight],
                  })}
                  rx={barWidth / 2}
                  width={barWidth}
                  x={x}
                  y={progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [chartHeight, finalY],
                  })}
                />

                <Rect
                  fill="transparent"
                  height={chartHeight}
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
              <Text style={styles.tooltipPrimary}>{displayMetricVolume(tooltipDatum.totalMl)}</Text>
              <Text style={styles.tooltipSecondary}>{displayImperialVolume(tooltipDatum.totalMl)}</Text>
            </View>

            <TouchableWithoutFeedback onPress={() => setSelectedIndex(null)}>
              <View style={[styles.dismissLayer, { height: chartHeight, top: TOOLTIP_TOP_REGION, width: svgWidth }]} />
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
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tooltipPrimary: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: fontWeights.medium,
    textAlign: 'center',
  },
  tooltipSecondary: {
    color: LABEL_COLOR,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: fontWeights.regular,
    textAlign: 'center',
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
    color: LABEL_COLOR,
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: fontWeights.regular,
    textAlign: 'center',
  },
});