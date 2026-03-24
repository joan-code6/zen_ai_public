import React, { createContext, useContext, useState, useRef, useCallback, useEffect, ReactNode } from 'react';
import { Animated, Dimensions, PanResponder, Pressable, StyleSheet, View, Text, FlatList, TextInput, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { chats as chatsApi, type Chat } from '../services/api';
import { colors, spacing, radius, typography } from '../theme/tokens';
import type { AppStackParams } from '../navigation';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type DrawerContextType = {
  openDrawer: () => void;
  closeDrawer: () => void;
  isDrawerOpen: boolean;
};

const DrawerContext = createContext<DrawerContextType>({
  openDrawer: () => {},
  closeDrawer: () => {},
  isDrawerOpen: false,
});

export const useDrawer = () => useContext(DrawerContext);

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

  const groups = [];
  if (todayItems.length) groups.push({ label: 'Today', data: todayItems });
  if (weekItems.length) groups.push({ label: 'Previous 7 Days', data: weekItems });
  if (monthItems.length) groups.push({ label: 'This Month', data: monthItems });
  if (olderItems.length) groups.push({ label: 'Older', data: olderItems });
  return groups;
}

interface DrawerWrapperProps {
  children: ReactNode;
}

export function DrawerWrapper({ children }: DrawerWrapperProps) {
  const { user, getToken } = useAuth();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParams>>();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [chatList, setChatList] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const drawerAnim = useRef(new Animated.Value(0)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const drawerOpenRef = useRef(isDrawerOpen);

  useEffect(() => {
    drawerOpenRef.current = isDrawerOpen;
  }, [isDrawerOpen]);

  const fetchChats = useCallback(async () => {
    if (!user) return;
    try {
      const token = await getToken();
      const res = await chatsApi.list(user.uid, token);
      setChatList(res.items);
    } catch (err: unknown) {
      // Silent fail for drawer
    } finally {
      setLoading(false);
    }
  }, [user, getToken]);

  useFocusEffect(useCallback(() => { fetchChats(); }, [fetchChats]));

  const openDrawer = useCallback(() => {
    drawerOpenRef.current = true;
    setIsDrawerOpen(true);
    Animated.parallel([
      Animated.timing(drawerAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 0.6, duration: 250, useNativeDriver: true }),
    ]).start();
  }, [drawerAnim, backdropAnim]);

  const closeDrawer = useCallback((navigate?: () => void) => {
    drawerOpenRef.current = false;
    setIsDrawerOpen(false);
    Animated.parallel([
      Animated.timing(drawerAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      if (navigate) navigate();
    });
  }, [drawerAnim, backdropAnim]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => {
        const isOpen = drawerOpenRef.current;
        if (isOpen) {
          return gesture.dx < -10 && Math.abs(gesture.dy) < Math.abs(gesture.dx);
        }
        return gesture.dx > 10 && Math.abs(gesture.dy) < Math.abs(gesture.dx);
      },
      onPanResponderMove: (_, gesture) => {
        const isOpen = drawerOpenRef.current;
        
        if (!isOpen) {
          const newValue = Math.max(0, Math.min(1, gesture.dx / SCREEN_WIDTH));
          drawerAnim.setValue(newValue);
          backdropAnim.setValue(newValue * 0.6);
        } else {
          const newValue = Math.max(0, Math.min(1, 1 + gesture.dx / SCREEN_WIDTH));
          drawerAnim.setValue(newValue);
          backdropAnim.setValue(newValue * 0.6);
        }
      },
      onPanResponderRelease: (_, gesture) => {
        const isOpen = drawerOpenRef.current;
        const velocity = gesture.vx;
        
        if (!isOpen) {
          const shouldOpen = gesture.dx > SCREEN_WIDTH * 0.25 || velocity > 0.5;
          drawerOpenRef.current = shouldOpen;
          setIsDrawerOpen(shouldOpen);
          Animated.parallel([
            Animated.timing(drawerAnim, { toValue: shouldOpen ? 1 : 0, duration: 200, useNativeDriver: true }),
            Animated.timing(backdropAnim, { toValue: shouldOpen ? 0.6 : 0, duration: 200, useNativeDriver: true }),
          ]).start();
        } else {
          const shouldClose = gesture.dx < -SCREEN_WIDTH * 0.25 || velocity < -0.5;
          drawerOpenRef.current = !shouldClose;
          setIsDrawerOpen(!shouldClose);
          Animated.parallel([
            Animated.timing(drawerAnim, { toValue: shouldClose ? 0 : 1, duration: 200, useNativeDriver: true }),
            Animated.timing(backdropAnim, { toValue: shouldClose ? 0 : 0.6, duration: 200, useNativeDriver: true }),
          ]).start();
        }
      },
    }),
  ).current;

  const filtered = searchQuery.trim()
    ? chatList.filter(c => (c.title || '').toLowerCase().includes(searchQuery.toLowerCase()))
    : chatList;

  const grouped = groupChatsByDate(filtered);

  const quickActions = [
    { key: 'Notes', icon: 'book-open', label: 'Notes', color: colors.success },
    { key: 'Files', icon: 'folder', label: 'Files', color: '#ffcf5a' },
    { key: 'Calendar', icon: 'calendar', label: 'Calendar', color: '#58a6ff' },
    { key: 'Email', icon: 'mail', label: 'Email', color: '#b392f0' },
  ];

  const openDrawerTab = (tab: string) => {
    if (tab === 'Notes') {
      closeDrawer(() => navigation.navigate('Notes'));
      return;
    }
    if (tab === 'Email') {
      closeDrawer(() => navigation.navigate('Email'));
      return;
    }
    if (tab === 'Calendar') {
      closeDrawer(() => navigation.navigate('Calendar'));
      return;
    }
    Alert.alert(tab, 'Coming soon.');
  };

  const contextValue = {
    openDrawer,
    closeDrawer,
    isDrawerOpen,
  };

  return (
    <DrawerContext.Provider value={contextValue}>
      <View style={styles.root} {...panResponder.panHandlers}>
        {children}

        {isDrawerOpen && (
          <Pressable style={styles.backdrop} onPress={() => closeDrawer()}>
            <Animated.View
              style={[styles.backdropInner, { opacity: backdropAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) }]}
            />
          </Pressable>
        )}

        <Animated.View style={[styles.drawer, { 
          transform: [{ translateX: drawerAnim.interpolate({ inputRange: [0, 1], outputRange: [-SCREEN_WIDTH, 0] }) }]
        }]}> 
          <View style={[styles.drawerSafe, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
            <View style={styles.drawerHeader}>
              <View style={styles.drawerBrandWrap}>
                <View style={styles.drawerBrandDot} />
                <Text style={styles.drawerBrand}>Zen AI</Text>
              </View>
              <Pressable onPress={() => closeDrawer()} hitSlop={8}>
                <Feather name="x" size={22} color={colors.text} />
              </Pressable>
            </View>

            <View style={styles.drawerSearchWrap}> 
              <Feather name="search" size={15} color={colors.textMuted} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search chats..."
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                returnKeyType="search"
              />
              {!!searchQuery && (
                <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                  <Feather name="x" size={15} color={colors.textMuted} />
                </Pressable>
              )}
            </View>

            <View style={styles.drawerQuickActionsRow}>
              {quickActions.map(item => (
                <Pressable
                  key={item.key}
                  style={({ pressed }) => [styles.drawerQuickActionItem, pressed && styles.quickActionItemPressed]}
                  onPress={() => openDrawerTab(item.key)}
                >
                  <View style={[styles.drawerQuickActionCircle, { backgroundColor: item.color + '20' }]}>
                    <Feather name={item.icon as any} size={18} color={item.color} />
                  </View>
                  <Text style={[styles.drawerQuickActionLabel, item.key === 'Notes' && styles.quickActionLabelActive]}>{item.label}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.divider} />

            <Text style={styles.recentsTitle}>All Chats</Text>

            {loading ? (
              <Animated.View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <Feather name="loader" size={24} color={colors.textMuted} />
              </Animated.View>
            ) : (
              <FlatList
                data={grouped}
                keyExtractor={g => g.label}
                style={styles.chatList}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 20 }}
                renderItem={({ item: group }) => (
                  <View>
                    <Text style={styles.groupLabel}>{group.label}</Text>
                    {group.data.map(chat => (
                      <Pressable
                        key={chat.id}
                        style={({ pressed }) => [styles.chatRow, pressed && styles.chatRowPressed]}
                        onPress={() => {
                          closeDrawer(() => navigation.navigate('Chat', { chatId: chat.id, title: chat.title }));
                        }}
                      >
                        <View style={styles.chatRowIcon}>
                          <Feather name="message-circle" size={14} color={colors.textMuted} />
                        </View>
                        <Text style={styles.chatTitle} numberOfLines={1}>{chat.title || 'New chat'}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              />
            )}

            <View style={styles.userPillWrap}> 
              <Pressable style={styles.userPill} onPress={() => { closeDrawer(() => navigation.navigate('Settings')); }}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {(user?.displayName?.[0] || user?.email?.[0] || '?').toUpperCase()}
                  </Text>
                </View>
                <View style={styles.userInfo}>
                  <Text style={styles.userName} numberOfLines={1}>{user?.displayName || 'Account'}</Text>
                  <Text style={styles.userEmail} numberOfLines={1}>{user?.email}</Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.textMuted} />
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </View>
    </DrawerContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99,
  },
  backdropInner: {
    flex: 1,
    backgroundColor: '#000',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: SCREEN_WIDTH,
    backgroundColor: colors.bg,
    zIndex: 100,
  },
  drawerSafe: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  drawerBrandWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  drawerBrandDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  drawerBrand: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  drawerSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  searchIcon: { marginRight: spacing.xs },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: typography.body,
  },
  drawerQuickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.md,
  },
  drawerQuickActionItem: { alignItems: 'center' },
  quickActionItemPressed: { opacity: 0.7 },
  drawerQuickActionCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  drawerQuickActionLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '500',
  },
  quickActionLabelActive: {
    color: colors.success,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  recentsTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  chatList: { flex: 1 },
  groupLabel: {
    fontSize: 10,
    color: colors.textSoft,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingVertical: spacing.xs,
    marginTop: spacing.sm,
  },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    gap: spacing.sm,
  },
  chatRowPressed: { backgroundColor: colors.panelSoft },
  chatRowIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.panel,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '500',
  },
  userPillWrap: {
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
  },
  userPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.panel,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.panelSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: colors.text, fontWeight: '700', fontSize: 14 },
  userInfo: { flex: 1 },
  userName: { color: colors.text, fontSize: 14, fontWeight: '600' },
  userEmail: { color: colors.textMuted, fontSize: 12 },
});
