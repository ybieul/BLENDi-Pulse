import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { colors, fonts, fontWeights, spacing } from '@blendi/shared';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import type { ShareCardFormat } from './RecipeShareCard';

const BACKDROP_COLOR = 'rgba(0,0,0,0.32)';
const SHEET_BACKGROUND = 'rgba(21,10,20,0.98)';
const SHEET_BORDER = 'rgba(255,255,255,0.10)';
const HANDLE_COLOR = 'rgba(255,255,255,0.22)';
const OPTION_BACKGROUND = 'rgba(255,255,255,0.05)';
const OPTION_BORDER = 'rgba(255,255,255,0.10)';
const PREVIEW_FILL = 'rgba(154,72,147,0.18)';
const PREVIEW_BORDER = 'rgba(154,72,147,0.42)';
const PREVIEW_FRAME_BACKGROUND = 'rgba(255,255,255,0.04)';

export interface ShareFormatSheetProps {
  visible: boolean;
  onSelect: (format: ShareCardFormat) => void;
  onClose: () => void;
}

interface FormatOption {
  format: ShareCardFormat;
  label: string;
  width: number;
  height: number;
}

export function ShareFormatSheet({ visible, onSelect, onClose }: ShareFormatSheetProps) {
  const { height } = useWindowDimensions();
  const { t } = useAppTranslation();
  const translateY = useRef(new Animated.Value(height)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [isMounted, setIsMounted] = useState(visible);

  useEffect(() => {
    translateY.setValue(height);
  }, [height, translateY]);

  useEffect(() => {
    if (visible) {
      setIsMounted(true);

      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          stiffness: 240,
          damping: 24,
          mass: 0.9,
          useNativeDriver: true,
        }),
      ]).start();

      return undefined;
    }

    const animation = Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: height,
        duration: 210,
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
  }, [backdropOpacity, height, translateY, visible]);

  if (!isMounted) {
    return null;
  }

  const options: FormatOption[] = [
    {
      format: 'story',
      label: t('share.formatStories'),
      width: 44,
      height: 78,
    },
    {
      format: 'square',
      label: t('share.formatFeed'),
      width: 62,
      height: 62,
    },
  ];

  return (
    <Modal animationType="none" statusBarTranslucent transparent visible={isMounted}>
      <View style={styles.modalRoot}>
        <Pressable accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFillObject}>
          <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
        </Pressable>

        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}> 
          <View style={styles.handle} />
          <Text style={styles.title}>{t('share.chooseFormat')}</Text>
          <Text style={styles.subtitle}>{t('share.shareRecipe')}</Text>

          <View style={styles.optionList}>
            {options.map((option) => (
              <Pressable
                key={option.format}
                accessibilityRole="button"
                onPress={() => {
                  onClose();
                  onSelect(option.format);
                }}
                style={styles.optionButton}
              >
                <View style={styles.previewFrame}>
                  <View
                    style={[
                      styles.previewCard,
                      {
                        width: option.width,
                        height: option.height,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.optionLabel}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: SHEET_BORDER,
    backgroundColor: SHEET_BACKGROUND,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing['2xl'],
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: HANDLE_COLOR,
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontSize: 22,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: fontWeights.regular,
    opacity: 0.7,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  optionList: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  optionButton: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: OPTION_BORDER,
    backgroundColor: OPTION_BACKGROUND,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    gap: spacing.md,
  },
  previewFrame: {
    width: 100,
    height: 100,
    borderRadius: 18,
    backgroundColor: PREVIEW_FRAME_BACKGROUND,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PREVIEW_BORDER,
    backgroundColor: PREVIEW_FILL,
  },
  optionLabel: {
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: fontWeights.medium,
    textAlign: 'center',
  },
});
