import React from 'react';
import { StyleSheet, TextInput, type TextInputProps, type ViewStyle } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/tokens';

interface AppTextInputProps extends TextInputProps {
  style?: ViewStyle;
}

export default function AppTextInput({ style, ...props }: AppTextInputProps) {
  return (
    <TextInput
      {...props}
      style={[s.input, style]}
      placeholderTextColor={props.placeholderTextColor ?? colors.textMuted}
    />
  );
}

const s = StyleSheet.create({
  input: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: typography.body,
    color: colors.text,
  },
});
