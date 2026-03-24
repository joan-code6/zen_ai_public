import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, Pressable, StyleSheet, FlatList,
  TextInput, ActivityIndicator, Alert, StatusBar,
  Animated, TouchableWithoutFeedback, Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { notes as notesApi, type Note } from '../services/api';
import { colors, spacing, radius, typography } from '../theme/tokens';
import type { AppStackParams } from '../navigation';

type Nav = NativeStackNavigationProp<AppStackParams, 'Notes'>;

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function NotesScreen() {
  const nav = useNavigation<Nav>();
  const { user, getToken } = useAuth();
  const insets = useSafeAreaInsets();

  const [notesList, setNotesList] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const listAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(listAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, listAnim]);

  // ── load notes ─────────────────────────────────────────────────────────
  const fetchNotes = useCallback(async () => {
    if (!user) return;
    try {
      const token = await getToken();
      const res = await notesApi.list(user.uid, token);
      setNotesList(res.items);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }, [user, getToken]);

  useFocusEffect(useCallback(() => { fetchNotes(); }, [fetchNotes]));

  // ── search ─────────────────────────────────────────────────────────────
  async function handleSearch(q: string) {
    setSearchQuery(q);
    if (!q.trim()) {
      setLoading(true);
      await fetchNotes();
      return;
    }
    setSearching(true);
    try {
      const token = await getToken();
      const res = await notesApi.search(user!.uid, token, q.trim());
      setNotesList(res.items);
    } catch {
      setNotesList(prev => prev.filter(n =>
        (n.title + n.content).toLowerCase().includes(q.toLowerCase())
      ));
    } finally {
      setSearching(false);
    }
  }

  // ── delete ─────────────────────────────────────────────────────────────
  function handleDelete(note: Note) {
    Alert.alert('Delete Note', `Delete "${note.title || 'Untitled'}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            const token = await getToken();
            await notesApi.delete(note.id, user!.uid, token);
            setNotesList(prev => prev.filter(n => n.id !== note.id));
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  }

  const isEmpty = !loading && notesList.length === 0;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      <SafeAreaView style={s.header} edges={['top']}>
        <Pressable onPress={() => nav.goBack()} style={s.iconBtn} hitSlop={8}>
          <Feather name="arrow-left" size={20} color={colors.text} />
        </Pressable>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>Notes</Text>
          {!loading && notesList.length > 0 && (
            <Text style={s.headerCount}>{notesList.length} notes</Text>
          )}
        </View>
        <Pressable
          style={s.addBtn}
          onPress={() => nav.navigate('NoteEdit', {})}
          hitSlop={8}
        >
          <Feather name="plus" size={22} color={colors.text} />
        </Pressable>
      </SafeAreaView>

      {/* search */}
      <View style={s.searchWrap}>
        <Feather name="search" size={15} color={colors.textMuted} style={s.searchIcon} />
        <TextInput
          style={s.searchInput}
          placeholder="Search notes..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={handleSearch}
          returnKeyType="search"
        />
        {searching && <ActivityIndicator size="small" color={colors.textMuted} />}
        {!!searchQuery && !searching && (
          <Pressable onPress={() => handleSearch('')} hitSlop={8}>
            <Feather name="x" size={15} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.textMuted} style={{ marginTop: spacing.xxl }} />
      ) : isEmpty ? (
        <Animated.View style={[s.empty, { opacity: fadeAnim }]}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View>
            <View style={s.emptyIconWrap}>
              <Feather name="book-open" size={44} color={colors.success} />
            </View>
            <Text style={s.emptyTitle}>No notes yet</Text>
            <Text style={s.emptySub}>
              Create notes to give the AI context about you. The AI can also create and update notes automatically during chats.
            </Text>
            <Pressable
              style={s.emptyBtn}
              onPress={() => nav.navigate('NoteEdit', {})}
            >
              <Feather name="plus" size={18} color={colors.primaryText} />
              <Text style={s.emptyBtnText}>Create First Note</Text>
            </Pressable>
            </View>
          </TouchableWithoutFeedback>
        </Animated.View>
      ) : (
        <Animated.View style={{ flex: 1, opacity: listAnim }}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={s.flex}>
            <FlatList
            data={notesList}
            keyExtractor={n => n.id}
            contentContainerStyle={s.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: note, index }) => (
              <Animated.View
                style={{
                  opacity: listAnim,
                  transform: [{
                    translateY: listAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] })
                  }]
                }}
              >
                <Pressable
                  style={({ pressed }) => [s.card, pressed && s.cardPressed]}
                  onPress={() => nav.navigate('NoteEdit', { noteId: note.id })}
                  onLongPress={() => handleDelete(note)}
                >
                  <View style={s.cardHeader}>
                    <View style={s.cardIcon}>
                      <Feather name="file-text" size={16} color={colors.success} />
                    </View>
                    <View style={s.cardTop}>
                      <Text style={s.cardTitle} numberOfLines={1}>
                        {note.title || 'Untitled'}
                      </Text>
                      <Text style={s.cardTime}>{timeAgo(note.updatedAt)}</Text>
                    </View>
                  </View>
                  {!!note.content && (
                    <Text style={s.cardPreview} numberOfLines={2}>{note.content}</Text>
                  )}
                  {note.keywords.length > 0 && (
                    <View style={s.tags}>
                      {note.keywords.slice(0, 4).map(kw => (
                        <View key={kw} style={s.tag}>
                          <Text style={s.tagText}>{kw}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  <View style={s.cardActions}>
                    <Pressable 
                      style={s.cardActionBtn}
                      onPress={() => handleDelete(note)}
                      hitSlop={8}
                    >
                      <Feather name="trash-2" size={14} color={colors.danger} />
                    </Pressable>
                  </View>
                </Pressable>
              </Animated.View>
            )}
          />
          </View>
          </TouchableWithoutFeedback>
        </Animated.View>
      )}

      {/* FAB */}
      {!isEmpty && (
        <Animated.View 
          style={[
            s.fab, 
            { 
              bottom: insets.bottom + 20,
              opacity: fadeAnim,
              transform: [{
                scale: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] })
              }]
            }
          ]}
        >
          <Pressable
            style={({ pressed }) => [s.fabBtn, pressed && s.fabBtnPressed]}
            onPress={() => nav.navigate('NoteEdit', {})}
          >
            <Feather name="plus" size={22} color={colors.primaryText} />
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingBottom: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerCount: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  iconBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  addBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.panel, borderRadius: radius.md,
    margin: spacing.md, paddingHorizontal: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  searchIcon: { marginRight: spacing.xs },
  searchInput: { flex: 1, paddingVertical: spacing.sm, fontSize: 15, color: colors.text },

  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xxl, gap: spacing.md },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.success + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  emptySub: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 21 },
  emptyBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: spacing.sm,
    backgroundColor: colors.primary, 
    borderRadius: radius.md, 
    paddingHorizontal: spacing.xl, 
    paddingVertical: spacing.md 
  },
  emptyBtnText: { color: colors.primaryText, fontWeight: '600', fontSize: 15 },

  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: 80 },
  card: {
    backgroundColor: colors.panel,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPressed: { opacity: 0.75 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  cardIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.success + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTop: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  cardTime: { fontSize: 12, color: colors.textMuted, marginLeft: spacing.sm },
  cardPreview: { fontSize: 13, color: colors.textMuted, lineHeight: 19, marginBottom: spacing.sm, marginTop: spacing.xs },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.xs },
  cardActionBtn: { padding: spacing.xs },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tag: { backgroundColor: colors.chip, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { fontSize: 11, color: colors.textMuted },

  fab: { position: 'absolute', right: spacing.xl },
  fabBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 },
  fabBtnPressed: { opacity: 0.85 },
});
