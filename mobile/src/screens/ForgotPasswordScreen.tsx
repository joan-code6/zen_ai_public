import React, { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { auth } from '../services/api';
import { colors, spacing, typography } from '../theme/tokens';
import AppButton from '../components/AppButton';
import AppTextInput from '../components/AppTextInput';
import { formatError } from '../utils/error';

export default function ForgotPasswordScreen() {
  const nav = useNavigation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSend() {
    if (!email.trim()) return;
    setError('');
    setLoading(true);
    try {
      await auth.forgotPassword(email.trim());
      setSent(true);
    } catch (err: unknown) {
      setError(formatError(err, 'Failed to send reset email.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.container}>
          <Pressable style={s.back} onPress={() => nav.goBack()}>
            <Text style={s.backText}>← Back</Text>
          </Pressable>

          <Text style={s.title}>Reset Password</Text>
          <Text style={s.subtitle}>
            Enter your email address and we'll send you a reset link.
          </Text>

          {sent ? (
            <View style={s.success}>
              <Text style={s.successText}>
                Reset email sent! Check your inbox.
              </Text>
              <AppButton label="Back to Sign In" onPress={() => nav.goBack()} style={s.btn} />
            </View>
          ) : (
            <View style={s.form}>
              <AppTextInput
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                returnKeyType="done"
                onSubmitEditing={handleSend}
              />
              {!!error && <Text style={s.error}>{error}</Text>}
              <AppButton
                label="Send Reset Link"
                onPress={handleSend}
                disabled={loading}
                loading={loading}
                style={s.btn}
              />
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  container: { flex: 1, padding: spacing.xl, justifyContent: 'center' },
  back: { position: 'absolute', top: spacing.xl, left: spacing.xl },
  backText: { color: colors.textMuted, fontSize: typography.body },
  title: { fontSize: typography.h1, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  subtitle: { fontSize: typography.body, color: colors.textMuted, marginBottom: spacing.xxl, lineHeight: 22 },
  form: { gap: spacing.sm },
  error: { fontSize: 14, color: colors.danger },
  btn: { marginTop: spacing.xs },
  success: { gap: spacing.lg },
  successText: { fontSize: typography.label, color: colors.success, lineHeight: 24 },
});
