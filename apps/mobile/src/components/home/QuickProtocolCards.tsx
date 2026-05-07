import { useMemo } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  colors,
  fonts,
  fontWeights,
  spacing,
} from '@blendi/shared';
import { useAppTranslation } from '../../hooks/useAppTranslation';

const CARD_WIDTH = 140;
const CARD_HEIGHT = 80;
const CARD_RADIUS = 14;
const CARD_GAP = 12;
const CARD_BACKGROUND = 'rgba(255,255,255,0.07)';
const CARD_BORDER = 'rgba(255,255,255,0.10)';
const CARD_HIGHLIGHT = 'rgba(255,255,255,0.04)';

type ProtocolIconName = 'barbell-outline' | 'heart-outline' | 'wine-outline' | 'airplane-outline';

export interface QuickProtocol {
  id: 'gym-protein' | 'active-moms' | 'cocktail-beach' | 'travel';
  title: string;
  prompt: string;
  icon: ProtocolIconName;
}

export interface QuickProtocolCardsProps {
  onProtocolSelect: (protocol: QuickProtocol) => void;
}

export function QuickProtocolCards({ onProtocolSelect }: QuickProtocolCardsProps) {
  const { t } = useAppTranslation();

  const protocols = useMemo<QuickProtocol[]>(() => [
    {
      id: 'gym-protein',
      title: t('home.protocols.gym_protein.name'),
      icon: 'barbell-outline',
      prompt: t('home.protocolPrompts.gym_protein'),
    },
    {
      id: 'active-moms',
      title: t('home.protocols.active_moms.name'),
      icon: 'heart-outline',
      prompt: t('home.protocolPrompts.active_moms'),
    },
    {
      id: 'cocktail-beach',
      title: t('home.protocols.beach_cocktails.name'),
      icon: 'wine-outline',
      prompt: t('home.protocolPrompts.beach_cocktails'),
    },
    {
      id: 'travel',
      title: t('home.protocols.travel.name'),
      icon: 'airplane-outline',
      prompt: t('home.protocolPrompts.travel'),
    },
  ], [t]);

  const renderItem: ListRenderItem<QuickProtocol> = ({ item }) => (
    <Pressable
      onPress={() => { onProtocolSelect(item); }}
      accessibilityRole="button"
      style={styles.card}
    >
      <View style={styles.cardHighlight} />
      <Ionicons name={item.icon} size={18} color={colors.text.primary} />
      <Text style={styles.cardTitle}>{item.title}</Text>
    </Pressable>
  );

  return (
    <FlatList
      data={protocols}
      horizontal
      showsHorizontalScrollIndicator={false}
      initialNumToRender={2}
      maxToRenderPerBatch={2}
      windowSize={3}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      ItemSeparatorComponent={CardSeparator}
      contentContainerStyle={styles.contentContainer}
    />
  );
}

function CardSeparator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  contentContainer: {
    paddingRight: spacing.xs,
  },
  separator: {
    width: CARD_GAP,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BACKGROUND,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  cardHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '48%',
    backgroundColor: CARD_HIGHLIGHT,
  },
  cardTitle: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: fontWeights.medium,
    lineHeight: 18,
  },
});