import { StyleSheet, View } from 'react-native';
import { colors } from '@blendi/shared';

import { AuroraBackground } from '../components/ui/AuroraBackground';

export function ShoppingListDetailScreen() {
  return (
    <View style={styles.root}>
      <AuroraBackground intensity="reduced" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
});