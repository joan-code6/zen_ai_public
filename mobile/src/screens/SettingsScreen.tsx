import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ScrollView,
  StatusBar,
  Switch,
  Modal,
  TextInput,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius } from '../theme/tokens';
import type { AppStackParams } from '../navigation';
import { users } from '../services/api';
import { translations } from '../i18n/translations';
import type { UserSettings } from '../services/api';

type Nav = NativeStackNavigationProp<AppStackParams, 'Settings'>;

export default function SettingsScreen() {
  const nav = useNavigation<Nav>();
  const { user, logout, getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<Partial<UserSettings> | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const fade = useRef(new Animated.Value(0)).current;

  function handleLogout() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  }

  async function fetchSettings() {
    if (!user) return;
    setLoading(true);
    try {
      const token = await getToken();
      const data = await users.getSettings(user.uid, token);
      setSettings(data);
    } catch (err) {
      console.warn('Failed to load settings', err);
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings(patch: Partial<UserSettings>) {
    if (!user) return;
    setSettings(prev => ({ ...(prev || {}), ...patch }));
    try {
      const token = await getToken();
      const updated = await users.patchSettings(user.uid, token, patch);
      setSettings(updated);
    } catch (err) {
      console.error('Failed to save settings', err);
      Alert.alert('Save failed', 'Could not update settings.');
    }
  }

  async function handleUpdateDisplayName() {
    if (!user) return;
    setEditingName(false);
    if (!newName || newName === user.displayName) return;
    try {
      const token = await getToken();
      await users.patch(user.uid, token, { displayName: newName });
      // persist in secure store via AuthContext bootstrap isn't trivial here — prompt user to re-login or refresh UI
      Alert.alert('Saved', 'Display name updated. Restart may be required to reflect everywhere.');
    } catch (err) {
      console.error('Failed to update profile', err);
      Alert.alert('Update failed', 'Could not update profile.');
    }
  }

  async function handleDeleteAccount() {
    if (!user) return;
    Alert.alert('Delete Account', 'This will permanently delete your account and data. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          const token = await getToken();
          await users.delete(user.uid, token);
          Alert.alert('Deleted', 'Your account was deleted.');
          await logout();
        } catch (err) {
          console.error('Failed to delete account', err);
          Alert.alert('Delete failed', 'Could not delete account.');
        }
      } },
    ]);
  }

  useEffect(() => {
    fetchSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [fade]);

  const lang = (settings?.language as string) || 'en';
  const t = (key: string): string => {
    const translationsObj = translations[lang as keyof typeof translations] || translations.en;
    return (translationsObj as Record<string, string>)[key] || key;
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      <SafeAreaView style={s.header} edges={['top']}>
        <Pressable onPress={() => nav.goBack()} style={s.iconBtn} hitSlop={8}>
          <Feather name="arrow-left" size={20} color={colors.text} />
        </Pressable>
        <Text style={s.headerTitle}>{t('settings')}</Text>
        <View style={{ width: 36 }} />
      </SafeAreaView>

      <Animated.View style={{ flex: 1, opacity: fade }}>
        <ScrollView style={s.flex} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        <Modal visible={editingName} animationType="slide" transparent>
          <View style={s.modalRoot}>
            <View style={s.modalCard}>
              <Text style={{ fontWeight: '700', marginBottom: 8 }}>{t('editDisplayName')}</Text>
              <TextInput value={newName} onChangeText={setNewName} placeholder={t('displayNamePlaceholder')} style={s.input} />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                <Pressable onPress={() => setEditingName(false)} style={s.modalBtn}><Text>{t('cancel')}</Text></Pressable>
                <Pressable onPress={handleUpdateDisplayName} style={[s.modalBtn, { backgroundColor: colors.primary }]}>
                  <Text style={{ color: '#fff' }}>{t('save')}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {loading && <ActivityIndicator style={{ marginVertical: 12 }} />}

        {/* profile card */}
        <View style={s.profileCard}>
          <View style={s.avatar}>
            <Feather name="user" size={24} color={colors.success} />
          </View>
          <View style={s.profileInfo}>
            <Text style={s.profileName}>{user?.displayName || 'Account'}</Text>
            <Text style={s.profileEmail}>{user?.email}</Text>
          </View>
          <Pressable onPress={() => { setNewName(user?.displayName ?? ''); setEditingName(true); }} style={s.editBtn}>
            <Feather name="edit-2" size={18} color={colors.success} />
          </Pressable>
        </View>

        {/* quick actions */}
        <View style={s.quickActionsRow}>
          <Pressable 
            style={s.quickActionCard}
            onPress={() => nav.navigate('Notes')}
          >
            <View style={[s.quickActionIcon, { backgroundColor: colors.success + '20' }]}>
              <Feather name="book-open" size={20} color={colors.success} />
            </View>
            <Text style={s.quickActionLabel}>Notes</Text>
          </Pressable>
          <Pressable style={s.quickActionCard}>
            <View style={[s.quickActionIcon, { backgroundColor: '#ffcf5a20' }]}>
              <Feather name="bell" size={20} color="#ffcf5a" />
            </View>
            <Text style={s.quickActionLabel}>Notifications</Text>
          </Pressable>
        </View>

        {/* about section */}
        <Text style={s.sectionLabel}>{t('about')}</Text>
        <View style={s.section}>
          <View style={s.row}>
            <Feather name="info" size={16} color={colors.textMuted} />
            <Text style={s.rowLabel}>{t('app')}</Text>
            <Text style={s.rowValue}>Zen AI</Text>
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Feather name="tag" size={16} color={colors.textMuted} />
            <Text style={s.rowLabel}>{t('version')}</Text>
            <Text style={s.rowValue}>1.0.0</Text>
          </View>
        </View>

        {/* notes section */}
        <Text style={s.sectionLabel}>{t('memory')}</Text>
        <View style={s.section}>
          <Pressable
            style={({ pressed }) => [s.row, s.rowTappable, pressed && s.rowPressed]}
            onPress={() => nav.navigate('Notes')}
          >
            <Feather name="book-open" size={16} color={colors.text} />
            <Text style={s.rowLabelIcon}>{t('manageNotes')}</Text>
            <Feather name="chevron-right" size={16} color={colors.textMuted} />
          </Pressable>
        </View>

        {/* preferences section */}
        <Text style={s.sectionLabel}>{t('preferences')}</Text>
        <View style={s.section}>
          <View style={s.row}>
            <Text style={s.rowLabel}>{t('streamResponses')}</Text>
            <Switch value={!!settings?.streamResponses} onValueChange={v => saveSettings({ streamResponses: v })} />
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.rowLabel}>{t('saveConversations')}</Text>
            <Switch value={!!settings?.saveConversations} onValueChange={v => saveSettings({ saveConversations: v })} />
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.rowLabel}>{t('autoScroll')}</Text>
            <Switch value={!!settings?.autoScroll} onValueChange={v => saveSettings({ autoScroll: v })} />
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.rowLabel}>{t('desktopNotifications')}</Text>
            <Switch value={!!settings?.desktopNotifications} onValueChange={v => saveSettings({ desktopNotifications: v })} />
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.rowLabel}>{t('soundEffects')}</Text>
            <Switch value={!!settings?.soundEffects} onValueChange={v => saveSettings({ soundEffects: v })} />
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.rowLabel}>{t('emailUpdates')}</Text>
            <Switch value={!!settings?.emailUpdates} onValueChange={v => saveSettings({ emailUpdates: v })} />
          </View>
        </View>

        <Text style={s.sectionLabel}>{t('appearance')}</Text>
        <View style={s.section}>
          <Pressable style={({ pressed }) => [s.row, s.rowTappable, pressed && s.rowPressed]} onPress={() => {
            const next = settings?.theme === 'dark' ? 'system' : settings?.theme === 'light' ? 'dark' : 'light';
            saveSettings({ theme: next as any });
          }}>
            <Text style={s.rowLabel}>{t('theme')}</Text>
            <Text style={s.rowValue}>{settings?.theme || 'system'}</Text>
          </Pressable>
          <View style={s.divider} />
          <Pressable style={({ pressed }) => [s.row, s.rowTappable, pressed && s.rowPressed]} onPress={() => {
            const order: Array<any> = ['small', 'medium', 'large'];
            const idx = order.indexOf(settings?.fontSize || 'medium');
            const next = order[(idx + 1) % order.length];
            saveSettings({ fontSize: next });
          }}>
            <Text style={s.rowLabel}>{t('fontSize')}</Text>
            <Text style={s.rowValue}>{settings?.fontSize || 'medium'}</Text>
          </Pressable>
        </View>

        <Text style={s.sectionLabel}>{t('language')}</Text>
        <View style={s.section}>
          <View style={s.row}>
            <Text style={s.rowLabel}>{t('aiLanguage')}</Text>
            <Text style={s.rowValue}>{settings?.aiLanguage || 'auto'}</Text>
          </View>
        </View>

        {/* account section */}
        <Text style={s.sectionLabel}>{t('account')}</Text>
        <View style={s.section}>
          <Pressable
            style={({ pressed }) => [s.row, s.rowTappable, pressed && s.rowPressed]}
            onPress={handleLogout}
          >
            <Feather name="log-out" size={16} color="#ff6b6b" />
            <Text style={[s.rowLabelIcon, { color: '#ff6b6b' }]}>{t('signOut')}</Text>
          </Pressable>
          <View style={s.divider} />
          <Pressable
            style={({ pressed }) => [s.row, s.rowTappable, pressed && s.rowPressed]}
            onPress={handleDeleteAccount}
          >
            <Feather name="trash-2" size={16} color="#ff6b6b" />
            <Text style={[s.rowLabelIcon, { color: '#ff6b6b' }]}>{t('deleteAccount')}</Text>
          </Pressable>
        </View>

        </ScrollView>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingBottom: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: colors.text },
  iconBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },

  scroll: { padding: spacing.lg, gap: spacing.xs, paddingBottom: 40 },

  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.panel, borderRadius: radius.lg,
    padding: spacing.lg, marginBottom: spacing.xl,
    borderWidth: 1, borderColor: colors.border,
  },
  avatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.bg,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  avatarText: { color: colors.text, fontWeight: '700', fontSize: 20 },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 17, fontWeight: '700', color: colors.text },
  profileEmail: { fontSize: 13, color: colors.textMuted, marginTop: 2 },

  sectionLabel: {
    fontSize: 11, fontWeight: '600', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: spacing.xs, marginTop: spacing.md, marginLeft: spacing.xs,
  },
  section: {
    backgroundColor: colors.panel,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
  },
  rowTappable: { gap: spacing.sm },
  rowPressed: { backgroundColor: colors.panelSoft },
  rowLabel: { flex: 1, fontSize: 15, color: colors.text },
  rowLabelIcon: { flex: 1, fontSize: 15, color: colors.text },
  rowValue: { fontSize: 15, color: colors.textMuted },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: spacing.md },
  editBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  
  quickActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  quickActionCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.panel,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickActionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },

  modalRoot: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalCard: { width: '90%', backgroundColor: colors.panel, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.sm, marginBottom: spacing.md, backgroundColor: colors.bg, color: colors.text },
  modalBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 },
});
