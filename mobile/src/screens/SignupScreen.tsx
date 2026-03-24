import React, { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, typography } from '../theme/tokens';
import type { AuthStackParams } from '../navigation';
import AppButton from '../components/AppButton';
import AppTextInput from '../components/AppTextInput';
import { formatError } from '../utils/error';

type Nav = NativeStackNavigationProp<AuthStackParams, 'Signup'>;

export default function SignupScreen() {
  const nav = useNavigation<Nav>();
  const { signup } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSignup() {
    if (!email.trim() || !password) return;
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setError('');
    setLoading(true);
    try {
      await signup(email.trim(), password, name.trim() || undefined);
    } catch (err: unknown) {
      setError(formatError(err, 'Signup failed.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Pressable style={s.back} onPress={() => nav.goBack()}>
            <Text style={s.backText}>← Back</Text>
          </Pressable>

          <View style={s.brand}>
            <Text style={s.brandText}>Create Account</Text>
            <Text style={s.subtitle}>Join Zen AI</Text>
          </View>

          <View style={s.form}>
            <AppTextInput
              placeholder="Display name (optional)"
              value={name}
              onChangeText={setName}
              returnKeyType="next"
            />
            <AppTextInput
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              returnKeyType="next"
            />
            <AppTextInput
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              returnKeyType="next"
            />
            <AppTextInput
              placeholder="Confirm password"
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleSignup}
            />

            {!!error && <Text style={s.error}>{error}</Text>}

            <AppButton
              label="Create Account"
              onPress={handleSignup}
              disabled={loading}
              loading={loading}
              style={s.btn}
            />
          </View>

          <View style={s.footer}>
            <Text style={s.footerText}>Already have an account? </Text>
            <Pressable onPress={() => nav.navigate('Login')}>
              <Text style={s.footerLink}>Sign in</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  back: { marginBottom: spacing.xl },
  backText: { color: colors.textMuted, fontSize: typography.body },
  brand: { alignItems: 'center', marginBottom: spacing.xxl },
  brandText: { fontSize: 30, fontWeight: '700', color: colors.text, letterSpacing: -1 },
  subtitle: { fontSize: typography.body, color: colors.textMuted, marginTop: spacing.xs },
  form: { gap: spacing.sm },
  error: { fontSize: 14, color: colors.danger, marginTop: spacing.xs },
  btn: { marginTop: spacing.xs },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl },
  footerText: { color: colors.textMuted, fontSize: 14 },
  footerLink: { color: colors.text, fontSize: 14, fontWeight: '600' },
});
