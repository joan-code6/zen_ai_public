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

type Nav = NativeStackNavigationProp<AuthStackParams, 'Login'>;

export default function LoginScreen() {
  const nav = useNavigation<Nav>();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password) return;
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err: unknown) {
      setError(formatError(err, 'Login failed.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          {/* brand */}
          <View style={s.brand}>
            <Text style={s.brandText}>Zen AI</Text>
            <Text style={s.subtitle}>Sign in to continue</Text>
          </View>

          {/* form */}
          <View style={s.form}>
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
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />

            {!!error && <Text style={s.error}>{error}</Text>}

            <AppButton
              label="Sign In"
              onPress={handleLogin}
              disabled={loading}
              loading={loading}
              style={s.btn}
            />

            <Pressable onPress={() => nav.navigate('ForgotPassword')} style={s.link}>
              <Text style={s.linkText}>Forgot password?</Text>
            </Pressable>
          </View>

          {/* sign up */}
          <View style={s.footer}>
            <Text style={s.footerText}>Don't have an account? </Text>
            <Pressable onPress={() => nav.navigate('Signup')}>
              <Text style={s.footerLink}>Create one</Text>
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
  brand: { alignItems: 'center', marginBottom: spacing.xxl },
  brandText: { fontSize: 36, fontWeight: '700', color: colors.text, letterSpacing: -1 },
  subtitle: { fontSize: typography.body, color: colors.textMuted, marginTop: spacing.xs },
  form: { gap: spacing.sm },
  error: { fontSize: 14, color: colors.danger, marginTop: spacing.xs },
  btn: { marginTop: spacing.xs },
  link: { alignItems: 'center', paddingVertical: spacing.sm },
  linkText: { color: colors.textMuted, fontSize: 14 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl },
  footerText: { color: colors.textMuted, fontSize: 14 },
  footerLink: { color: colors.text, fontSize: 14, fontWeight: '600' },
});
