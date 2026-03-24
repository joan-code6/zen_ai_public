import React, { useState, useEffect } from 'react';
import {
  View, Text, Pressable, StyleSheet, TextInput,
  KeyboardAvoidingView, Platform, ScrollView,
  ActivityIndicator, Alert, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { notes as notesApi, type Note } from '../services/api';
import { colors, spacing, radius } from '../theme/tokens';
import type { AppStackParams } from '../navigation';

type Props = NativeStackScreenProps<AppStackParams, 'NoteEdit'>;

export default function NoteEditScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const { noteId } = route.params as AppStackParams['NoteEdit'];
  const { user, getToken } = useAuth();
  const isNew = !noteId;

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [keywords, setKeywords] = useState('');
  const [triggerWords, setTriggerWords] = useState('');
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(isNew);

  // ── load existing note ─────────────────────────────────────────────────
  useEffect(() => {
    if (!noteId || !user) return;
    (async () => {
      try {
        const token = await getToken();
        const note = await notesApi.get(noteId, user.uid, token);
        setTitle(note.title || '');
        setContent(note.content || '');
        setKeywords(note.keywords?.join(', ') || '');
        setTriggerWords(note.triggerWords?.join(', ') || '');
      } catch (e: any) {
        Alert.alert('Error', e.message);
        nav.goBack();
      } finally {
        setLoading(false);
      }
    })();
  }, [noteId]);

  function markChanged() { setHasChanges(true); }

  // ── save ───────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!user || saving) return;
    setSaving(true);
    const data = {
      title: title.trim() || undefined,
      content: content,
      keywords: keywords ? keywords.split(',').map(k => k.trim()).filter(Boolean) : [],
      triggerWords: triggerWords ? triggerWords.split(',').map(t => t.trim()).filter(Boolean) : [],
    };
    try {
      const token = await getToken();
      if (isNew) {
        await notesApi.create(user.uid, token, data);
      } else {
        await notesApi.update(noteId!, user.uid, token, data);
      }
      nav.goBack();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not save note.');
    } finally {
      setSaving(false);
    }
  }

  // ── delete ─────────────────────────────────────────────────────────────
  function handleDelete() {
    if (!noteId) return;
    Alert.alert('Delete Note', 'This note will be permanently deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            const token = await getToken();
            await notesApi.delete(noteId, user!.uid, token);
            nav.goBack();
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={[s.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      <SafeAreaView style={s.header} edges={['top']}>
        <Pressable onPress={() => nav.goBack()} style={s.iconBtn} hitSlop={8}>
          <Feather name="x" size={20} color={colors.text} />
        </Pressable>
        <Text style={s.headerTitle}>{isNew ? 'New Note' : 'Edit Note'}</Text>
        <View style={s.headerRight}>
          {!isNew && (
            <Pressable onPress={handleDelete} style={s.iconBtn} hitSlop={8}>
              <Feather name="trash-2" size={18} color="#ff6b6b" />
            </Pressable>
          )}
          <Pressable
            style={[s.saveBtn, (!hasChanges || saving) && s.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!hasChanges || saving}
          >
            {saving
              ? <ActivityIndicator size="small" color={colors.primaryText} />
              : <Text style={s.saveBtnText}>Save</Text>}
          </Pressable>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={s.flex} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          {/* title */}
          <TextInput
            style={s.titleInput}
            placeholder="Note title"
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={t => { setTitle(t); markChanged(); }}
            returnKeyType="next"
            maxLength={128}
          />

          {/* content */}
          <TextInput
            style={s.contentInput}
            placeholder="Write your note here..."
            placeholderTextColor={colors.textMuted}
            value={content}
            onChangeText={t => { setContent(t); markChanged(); }}
            multiline
            textAlignVertical="top"
          />

          {/* keywords */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Feather name="tag" size={14} color={colors.textMuted} />
              <Text style={s.sectionTitle}>Keywords</Text>
            </View>
            <TextInput
              style={s.metaInput}
              placeholder="happy, coding, ideas..."
              placeholderTextColor={colors.textSoft}
              value={keywords}
              onChangeText={t => { setKeywords(t); markChanged(); }}
              autoCapitalize="none"
            />
            <Text style={s.hint}>Comma-separated. Used for search &amp; retrieval.</Text>
          </View>

          {/* trigger words */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Feather name="zap" size={14} color={colors.textMuted} />
              <Text style={s.sectionTitle}>Trigger Words</Text>
            </View>
            <TextInput
              style={s.metaInput}
              placeholder="project, meeting, recipe..."
              placeholderTextColor={colors.textSoft}
              value={triggerWords}
              onChangeText={t => { setTriggerWords(t); markChanged(); }}
              autoCapitalize="none"
            />
            <Text style={s.hint}>
              When you mention these in a chat, this note is automatically surfaced to the AI.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600', color: colors.text },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  iconBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  saveBtn: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 6 },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: colors.primaryText, fontWeight: '600', fontSize: 14 },

  scroll: { padding: spacing.lg, paddingBottom: 60 },
  titleInput: {
    fontSize: 22, fontWeight: '700', color: colors.text,
    marginBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    paddingBottom: spacing.sm,
  },
  contentInput: {
    fontSize: 16, color: colors.text, lineHeight: 24,
    minHeight: 200, marginBottom: spacing.xl,
  },
  section: { marginBottom: spacing.xl },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  metaInput: {
    backgroundColor: colors.panel,
    borderRadius: radius.sm,
    padding: spacing.sm,
    color: colors.text,
    fontSize: 14,
    borderWidth: 1, borderColor: colors.border,
  },
  hint: { fontSize: 12, color: colors.textSoft, marginTop: spacing.xs, lineHeight: 17 },
});
