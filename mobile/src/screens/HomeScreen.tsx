import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable as RNPpressable,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { chats as chatsApi, type Chat } from '../services/api';
import { formatError } from '../utils/error';
import { colors, iconSizes, radius, spacing, typography } from '../theme/tokens';
import type { AppStackParams } from '../navigation';
import InputBar from '../components/InputBar';
import { useDrawer } from '../components/DrawerWrapper';

type Nav = NativeStackNavigationProp<AppStackParams, 'Home'>;

function groupChatsByDate(items: Chat[]): { label: string; data: Chat[] }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date(today);
  monthAgo.setDate(monthAgo.getDate() - 30);

  const todayItems: Chat[] = [];
  const weekItems: Chat[] = [];
  const monthItems: Chat[] = [];
  const olderItems: Chat[] = [];

  for (const c of items) {
    const d = new Date(c.updatedAt);
    if (d >= today) todayItems.push(c);
    else if (d >= weekAgo) weekItems.push(c);
    else if (d >= monthAgo) monthItems.push(c);
    else olderItems.push(c);
  }


  // Sort each group by most recent

  const groups = [];
  if (todayItems.length) groups.push({ label: 'Today', data: todayItems });
  if (weekItems.length) groups.push({ label: 'Previous 7 Days', data: weekItems });
  if (monthItems.length) groups.push({ label: 'This Month', data: monthItems });
  if (olderItems.length) groups.push({ label: 'Older', data: olderItems });
  return groups;
}

export default function HomeScreen() {
  const nav = useNavigation<Nav>();
  const { user, getToken } = useAuth();
  const insets = useSafeAreaInsets();
  const { openDrawer, isDrawerOpen, closeDrawer } = useDrawer();

  const [chatList, setChatList] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingStartMessage, setSendingStartMessage] = useState(false);
  const [startInput, setStartInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  // Fetch chats on focus

  const fetchChats = useCallback(async () => {
    if (!user) return;
    try {
      const token = await getToken();
      const res = await chatsApi.list(user.uid, token);
      setChatList(res.items);
    } catch (err: unknown) {
      Alert.alert('Error', formatError(err, 'Could not load chats.'));
    } finally {
      setLoading(false);
    }
  }, [user, getToken]);

  useFocusEffect(useCallback(() => { fetchChats(); }, [fetchChats]));

  async function handleSendFromStart() {
    const text = startInput.trim();
    if (!text || !user || sendingStartMessage) return;

    setSendingStartMessage(true);
    try {
      const token = await getToken();
      const chat = await chatsApi.create(user.uid, token);
      setStartInput('');
      nav.navigate('Chat', {
        chatId: chat.id,
        title: chat.title,
        initialMessage: text,
      });
    } catch (err: unknown) {
      Alert.alert('Error', formatError(err, 'Could not start chat.'));
    } finally {
      setSendingStartMessage(false);
    }
  }


  
  function openDrawerTab(tab: 'Notes' | 'Files' | 'Calendar' | 'Email') {
    if (tab === 'Notes') {
      closeDrawer();
      nav.navigate('Notes');
      return;
    }

    if (tab === 'Email') {
      closeDrawer();
      nav.navigate('Email');
      return;
    }
    if (tab === 'Calendar') {
      closeDrawer();
      nav.navigate('Calendar');
      return;
    }
    Alert.alert(tab, 'Coming soon.');
  }

  const filtered = searchQuery.trim()
    ? chatList.filter(c => (c.title || '').toLowerCase().includes(searchQuery.toLowerCase()))
    : chatList;

  const grouped = groupChatsByDate(filtered);

  const quickActions: Array<{ key: 'Notes' | 'Files' | 'Calendar' | 'Email'; icon: keyof typeof Feather.glyphMap; label: string; color: string }> = [
    { key: 'Notes', icon: 'book-open', label: 'Notes', color: colors.success },
    { key: 'Files', icon: 'folder', label: 'Files', color: '#ffcf5a' },
    { key: 'Calendar', icon: 'calendar', label: 'Calendar', color: '#58a6ff' },
    { key: 'Email', icon: 'mail', label: 'Email', color: '#b392f0' },
  ];

  const suggestions = [
    'Help me write a story',
    'Explain quantum physics',
    'Plan my week',
    'Debug my code',
  ];

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      <SafeAreaView style={s.flex} edges={['top', 'left', 'right']}>
        <Animated.View style={[s.heroWrap, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <View style={s.headerRow}>
            <Pressable onPress={openDrawer} style={s.menuBtn} hitSlop={8}>
              <Feather name="menu" size={24} color={colors.text} />
            </Pressable>
            <View style={s.brandContainer}>
              <View style={s.brandDot} />
              <Text style={s.brandText}>Zen</Text>
            </View>
            <Pressable onPress={() => nav.navigate('Settings')} style={s.settingsBtn} hitSlop={8}>
              <Feather name="settings" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <Text style={s.heroTitle}>
            {user?.displayName ? `Hey ${user.displayName.split(' ')[0]}` : 'Welcome back'}
          </Text>
          <Text style={s.heroSub}>What can I help you with today?</Text>
        </Animated.View>

        <KeyboardAvoidingView
          style={s.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <ScrollView 
            style={s.contentScroll} 
            contentContainerStyle={s.contentScrollInner}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.quickActionsContainer}>
              <Text style={s.sectionLabel}>Quick Actions</Text>
              <View style={s.quickActionsGrid}>
                {quickActions.map(item => (
                  <Pressable
                    key={item.key}
                    style={({ pressed }) => [s.quickActionCard, pressed && s.quickActionCardPressed]}
                    onPress={() => openDrawerTab(item.key)}
                  >
                    <View style={[s.quickActionCircle, { backgroundColor: item.color + '20' }]}>
                      <Feather name={item.icon} size={22} color={item.color} />
                    </View>
                    <Text style={s.quickActionLabel}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={s.suggestionsContainer}>
              <Text style={s.sectionLabel}>Suggestions</Text>
              <View style={s.suggestionsList}>
                {suggestions.map((suggestion, idx) => (
                  <Pressable
                    key={idx}
                    style={({ pressed }) => [s.suggestionChip, pressed && s.suggestionChipPressed]}
                    onPress={() => {
                      setStartInput(suggestion);
                    }}
                  >
                    <Feather name="zap" size={12} color={colors.textMuted} />
                    <Text style={s.suggestionText}>{suggestion}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {chatList.length > 0 && (
              <View style={s.recentChatsContainer}>
                <Text style={s.sectionLabel}>Recent Chats</Text>
                {grouped.slice(0, 2).map(group => (
                  <View key={group.label}>
                    {group.data.slice(0, 3).map(chat => (
                      <Pressable
                        key={chat.id}
                        style={({ pressed }) => [s.chatHistoryItem, pressed && s.chatHistoryItemPressed]}
                        onPress={() => nav.navigate('Chat', { chatId: chat.id, title: chat.title })}
                      >
                        <View style={s.chatHistoryIcon}>
                          <Feather name="message-circle" size={16} color={colors.textMuted} />
                        </View>
                        <Text style={s.chatHistoryTitle} numberOfLines={1}>{chat.title || 'New chat'}</Text>
                        <Feather name="chevron-right" size={16} color={colors.textMuted} />
                      </Pressable>
                    ))}
                  </View>
                ))}
                {chatList.length > 6 && (
                  <Pressable style={s.seeAllBtn} onPress={openDrawer}>
                    <Text style={s.seeAllText}>See all {chatList.length} chats</Text>
                  </Pressable>
                )}
              </View>
            )}
          </ScrollView>

          <View style={{ paddingBottom: insets.bottom }}>
            <InputBar
              value={startInput}
              onChangeText={setStartInput}
              onSend={handleSendFromStart}
              onAttachFile={() => Alert.alert('Coming soon', 'File upload will be available in chats')}
              onVoiceInput={() => Alert.alert('Coming soon', 'Voice input will be available in chats')}
              onModelSelect={() => Alert.alert('Coming soon', 'Model selection will be available in chats')}
              isUploading={sendingStartMessage}
              disabled={sendingStartMessage}
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  menuBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  settingsBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  brandDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  brandText: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.5,
  },

  heroWrap: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  heroTitle: {
    fontSize: typography.h1,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
    letterSpacing: -0.5,
  },
  heroSub: {
    fontSize: typography.body,
    color: colors.textMuted,
  },

  contentScroll: { flex: 1 },
  contentScrollInner: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },

  quickActionsContainer: { marginBottom: spacing.xl },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  quickActionCard: {
    width: '48%',
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickActionCardPressed: { backgroundColor: colors.panelSoft },
  quickActionCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickActionLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },

  suggestionsContainer: { marginBottom: spacing.xl },
  suggestionsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.panel,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  suggestionChipPressed: { backgroundColor: colors.panelSoft },
  suggestionText: {
    color: colors.textMuted,
    fontSize: 13,
  },

  recentChatsContainer: { marginBottom: spacing.lg },
  chatHistoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.xs,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chatHistoryItemPressed: { backgroundColor: colors.panelSoft },
  chatHistoryIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.panelSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatHistoryTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  seeAllBtn: { alignItems: 'center', paddingVertical: spacing.sm },
  seeAllText: { color: colors.success, fontSize: 13, fontWeight: '500' },
});
