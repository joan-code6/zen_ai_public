import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors, iconSizes, spacing, typography } from '../theme/tokens';

interface AppHeaderProps {
  title: string;
  onBack?: () => void;
  rightSlot?: React.ReactNode;
}

export default function AppHeader({ title, onBack, rightSlot }: AppHeaderProps) {
  return (
    <SafeAreaView style={s.header} edges={['top']}>
      {onBack ? (
        <Pressable onPress={onBack} style={s.iconBtn} hitSlop={8}>
          <Feather name="arrow-left" size={iconSizes.lg} color={colors.text} />
        </Pressable>
      ) : (
        <View style={s.iconBtn} />
      )}
      <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
      <View style={s.right}>{rightSlot}</View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: typography.label,
    fontWeight: '600',
    color: colors.text,
  },
  iconBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  right: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
