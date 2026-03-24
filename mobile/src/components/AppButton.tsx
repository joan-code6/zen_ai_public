import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/tokens';

interface AppButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export default function AppButton({ label, onPress, disabled, loading, style }: AppButtonProps) {
  const isDisabled = Boolean(disabled || loading);

  return (
    <Pressable
      style={({ pressed }) => [
        s.btn,
        style,
        isDisabled && s.btnDisabled,
        pressed && !isDisabled && s.btnPressed,
      ]}
      onPress={onPress}
      disabled={isDisabled}
    >
      {loading
        ? <ActivityIndicator color={colors.primaryText} />
        : <Text style={s.btnText}>{label}</Text>}
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  btnPressed: { opacity: 0.85 },
  btnDisabled: { opacity: 0.5 },
  btnText: {
    color: colors.primaryText,
    fontSize: typography.body,
    fontWeight: '600',
  },
});
