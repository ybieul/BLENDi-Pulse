// apps/mobile/src/components/pulseAi/ChatMessageSkeleton.tsx
// Skeleton de carregamento exibido como footer da FlatList enquanto o Pulse AI
// processa a resposta. Simula visualmente um cartão de receita sendo montado.

import { StyleSheet, View } from 'react-native';

import { borderRadius, colors, spacing } from '@blendi/shared';
import { SkeletonLoader } from '../ui/SkeletonLoader';

const CARD_HEIGHT = 220;
const SKELETON_CARD_BORDER = 'rgba(255,255,255,0.07)';

export function ChatMessageSkeleton() {
  return (
    <View style={styles.wrapper}>
      {/* Título e subtítulo do card */}
      <SkeletonLoader variant="line" width="58%" height={18} />
      <SkeletonLoader
        variant="line"
        width="38%"
        height={13}
        style={styles.subtitleRow}
      />

      {/* Corpo do card */}
      <View style={styles.card}>
        <SkeletonLoader variant="line" width="80%" height={13} />
        <SkeletonLoader
          variant="line"
          width="65%"
          height={13}
          style={styles.cardRow}
        />
        <SkeletonLoader
          variant="line"
          width="72%"
          height={13}
          style={styles.cardRow}
        />
        <SkeletonLoader
          variant="line"
          width="50%"
          height={13}
          style={styles.cardRow}
        />
        <View style={styles.macroRow}>
          <SkeletonLoader variant="line" width={60} height={28} style={styles.macroPill} />
          <SkeletonLoader variant="line" width={60} height={28} style={styles.macroPill} />
          <SkeletonLoader variant="line" width={60} height={28} style={styles.macroPill} />
          <SkeletonLoader variant="line" width={72} height={28} style={styles.macroPill} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.xl,
    marginTop: spacing.md,
  },
  subtitleRow: {
    marginTop: spacing.md,
  },
  card: {
    marginTop: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: SKELETON_CARD_BORDER,
    backgroundColor: colors.background.secondary,
    padding: spacing.xl,
    minHeight: CARD_HEIGHT,
    justifyContent: 'flex-start',
  },
  cardRow: {
    marginTop: spacing.md,
  },
  macroRow: {
    flexDirection: 'row',
    marginTop: spacing['2xl'],
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  macroPill: {
    borderRadius: borderRadius.full,
  },
});
