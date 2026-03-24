import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, Pressable, StyleSheet, FlatList, TextInput,
  ActivityIndicator, Alert, StatusBar, RefreshControl, Animated, Modal, ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { email as emailApi, type EmailMessage, type EmailAccount, type EmailAnalysis } from '../services/api';
import { colors, spacing, radius, typography } from '../theme/tokens';
import type { AppStackParams } from '../navigation';
import { translations } from '../i18n/translations';
import { users } from '../services/api';

type Nav = NativeStackNavigationProp<AppStackParams, 'Email'>;

function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(dateStr).toLocaleDateString();
}

function getImportanceColor(importance?: string): string {
  switch (importance) {
    case 'high': return colors.danger;
    case 'medium': return colors.warning;
    default: return colors.textMuted;
  }
}

function getCategoryColor(category: string): string {
  switch (category) {
    case 'work': return '#58a6ff';
    case 'private': return colors.success;
    case 'spam': return colors.danger;
    case 'newsletter': return '#b392f0';
    case 'finance': return '#ffcf5a';
    case 'social': return '#f78166';
    default: return colors.textMuted;
  }
}

function extractEmailAddress(from: string | undefined): string {
  if (!from) return 'Unknown';
  const match = from.match(/<(.+)>/);
  return match ? match[1] : from;
}

function extractName(from: string | undefined): string {
  if (!from) return 'Unknown';
  const match = from.match(/^([^<]+)/);
  return match ? match[0].trim() : from;
}

export default function EmailScreen() {
  const nav = useNavigation<Nav>();
  const { user, getToken } = useAuth();

  const [account, setAccount] = useState<EmailAccount | null>(null);
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [analyses, setAnalyses] = useState<Record<string, EmailAnalysis>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [settings, setSettings] = useState<{ language?: string } | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
  const [emailContent, setEmailContent] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [fadeAnim]);

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const token = await getToken();
      
      const [accountRes, analysesRes, settingsRes] = await Promise.all([
        emailApi.listAccounts(token),
        emailApi.getAnalysisHistory(token, 100),
        users.getSettings(user.uid, token).catch(() => null),
      ]);

      setSettings(settingsRes);
      setAccount(accountRes.accounts[0] || null);
      
      const analysesMap: Record<string, EmailAnalysis> = {};
      analysesRes.items.forEach(a => {
        analysesMap[a.messageId] = a;
      });
      setAnalyses(analysesMap);

      if (accountRes.accounts[0]?.connected) {
        const messagesRes = await emailApi.listGmailMessages(token, { maxResults: 100 });
        setMessages(messagesRes.messages || []);
      }
    } catch (e: any) {
      console.log('Email fetch error:', e.message);
    } finally {
      setLoading(false);
    }
  }, [user, getToken]);

  const lang = (settings?.language as string) || 'en';
  const t = (key: string): string => {
    const translationsObj = translations[lang as keyof typeof translations] || translations.en;
    return (translationsObj as Record<string, string>)[key] || key;
  };

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleConnectGmail = async () => {
    if (!user) return;
    try {
      const token = await getToken();
      const authUrlRes = await emailApi.getGmailAuthUrl('zenai://oauth/callback', user.uid);
      Alert.alert(
        'Connect Gmail',
        'You will be redirected to Google to authorize access to your Gmail.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', onPress: () => {
            Alert.alert('OAuth', `URL: ${authUrlRes.authorizationUrl.substring(0, 50)}...`);
          }},
        ]
      );
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleEmailPress = async (message: EmailMessage) => {
    setSelectedEmail(message);
    setEmailContent(null);
    setLoadingContent(true);
    
    try {
      const token = await getToken();
      const fullMessage = await emailApi.getGmailMessage(message.id, token);
      setEmailContent(fullMessage.snippet || fullMessage.raw || 'No content available');
    } catch (e: any) {
      setEmailContent('Failed to load email content');
    } finally {
      setLoadingContent(false);
    }
  };

  const filteredMessages = messages.filter(m => {
    if (searchQuery.trim()) {
      const matchesSearch = 
        (m.subject || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.from || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (analyses[m.id]?.contentSummary || '').toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;
    }
    if (categoryFilter) {
      const categories = analyses[m.id]?.categories || [];
      if (!categories.includes(categoryFilter)) return false;
    }
    return true;
  });

  const usedCategories = Array.from(
    new Set(Object.values(analyses).flatMap(a => a.categories))
  ).sort();

  const renderMessageItem = ({ item, index }: { item: EmailMessage; index: number }) => {
    const analysis = analyses[item.id];
    const importanceColor = getImportanceColor(analysis?.importance);
    const fromName = extractName(item.from);
    const fromEmail = extractEmailAddress(item.from);
    
    return (
      <Animated.View 
        style={{ 
          opacity: fadeAnim,
          transform: [{ translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [20 + index * 5, 0] }) }]
        }}
      >
        <Pressable
          style={({ pressed }) => [
            styles.emailCard, 
            { borderLeftColor: importanceColor, borderLeftWidth: analysis?.importance === 'high' ? 3 : 0 },
            pressed && styles.cardPressed
          ]}
          onPress={() => handleEmailPress(item)}
        >
          <View style={styles.cardHeader}>
            <View style={styles.senderRow}>
              <View style={[styles.senderAvatar, { backgroundColor: importanceColor + '20' }]}>
                <Text style={[styles.senderInitial, { color: importanceColor }]}>
                  {(fromName[0] || fromEmail[0] || '?').toUpperCase()}
                </Text>
              </View>
              <View style={styles.senderInfo}>
                <Text style={styles.senderName} numberOfLines={1}>
                  {analysis?.senderSummary || fromName || fromEmail}
                </Text>
                {analysis?.senderValidated && (
                  <View style={styles.validatedRow}>
                    <Feather name="check-circle" size={10} color={colors.success} />
                    <Text style={styles.validatedText}>verified</Text>
                  </View>
                )}
              </View>
            </View>
            <Text style={styles.emailTime}>{timeAgo(item.date || '')}</Text>
          </View>

          {analysis?.contentSummary ? (
            <View style={styles.aiSummary}>
              <View style={styles.summaryBadge}>
                <Feather name="zap" size={10} color={colors.primary} />
                <Text style={styles.summaryBadgeText}>AI</Text>
              </View>
              <Text style={styles.summaryText} numberOfLines={2}>
                {analysis.contentSummary}
              </Text>
            </View>
          ) : (
            <Text style={styles.emailSubject} numberOfLines={1}>
              {item.subject || '(No subject)'}
            </Text>
          )}

          {analysis && analysis.categories.length > 0 && (
            <View style={styles.categoryRow}>
              {analysis.categories.slice(0, 3).map(cat => (
                <View 
                  key={cat} 
                  style={[
                    styles.categoryTag, 
                    { backgroundColor: getCategoryColor(cat) + '20', borderColor: getCategoryColor(cat) + '40' }
                  ]}
                >
                  <Text style={[styles.categoryText, { color: getCategoryColor(cat) }]}>{cat}</Text>
                </View>
              ))}
            </View>
          )}

          {item.snippet && !analysis?.contentSummary && (
            <Text style={styles.emailSnippet} numberOfLines={2}>{item.snippet}</Text>
          )}
        </Pressable>
      </Animated.View>
    );
  };

  const renderHeader = () => (
    <View style={styles.statsRow}>
      <View style={styles.statPill}>
        <Feather name="inbox" size={14} color={colors.textMuted} />
        <Text style={styles.statText}>{messages.length} emails</Text>
      </View>
      {Object.keys(analyses).length > 0 && (
        <View style={styles.statPill}>
          <Feather name="zap" size={14} color={colors.primary} />
          <Text style={styles.statText}>{Object.keys(analyses).length} analyzed</Text>
        </View>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.textMuted} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      
      <SafeAreaView style={styles.header} edges={['top']}>
        <Pressable onPress={() => nav.goBack()} style={styles.iconBtn} hitSlop={8}>
          <Feather name="arrow-left" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Email</Text>
          {account?.connected && (
            <View style={styles.connectedBadge}>
              <View style={styles.connectedDot} />
              <Text style={styles.connectedText}>Connected</Text>
            </View>
          )}
        </View>
        <Pressable onPress={handleRefresh} style={styles.iconBtn} hitSlop={8}>
          <Feather name="refresh-cw" size={18} color={colors.text} />
        </Pressable>
      </SafeAreaView>

      {!account?.connected ? (
        <Animated.View style={[styles.connectContainer, { opacity: fadeAnim }]}>
          <View style={styles.connectIconWrap}>
            <Feather name="mail" size={48} color={colors.primary} />
          </View>
          <Text style={styles.connectTitle}>Smart Email Inbox</Text>
          <Text style={styles.connectSubtitle}>
            Instantly know what every email is about. AI summarizes content, detects importance, and categorizes automatically.
          </Text>
          
          <View style={styles.featuresList}>
            <View style={styles.featureItem}>
              <Feather name="check-circle" size={16} color={colors.success} />
              <Text style={styles.featureText}>One glance = know everything</Text>
            </View>
            <View style={styles.featureItem}>
              <Feather name="check-circle" size={16} color={colors.success} />
              <Text style={styles.featureText}>AI-powered content summaries</Text>
            </View>
            <View style={styles.featureItem}>
              <Feather name="check-circle" size={16} color={colors.success} />
              <Text style={styles.featureText}>Auto-detect important emails</Text>
            </View>
            <View style={styles.featureItem}>
              <Feather name="check-circle" size={16} color={colors.success} />
              <Text style={styles.featureText}>Smart sender recognition</Text>
            </View>
          </View>

          <Pressable 
            style={({ pressed }) => [styles.connectBtn, pressed && styles.connectBtnPressed]}
            onPress={handleConnectGmail}
          >
            <Feather name="google" size={18} color={colors.primaryText} />
            <Text style={styles.connectBtnText}>Connect Gmail</Text>
          </Pressable>

          <Pressable 
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
            onPress={() => Alert.alert('IMAP', 'IMAP configuration coming soon')}
          >
            <Feather name="server" size={16} color={colors.textMuted} />
            <Text style={styles.secondaryBtnText}>Connect IMAP/SMTP</Text>
          </Pressable>
        </Animated.View>
      ) : (
          <View style={styles.inboxContainer}>
          <View style={styles.searchWrap}>
            <Feather name="search" size={15} color={colors.textMuted} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search emails or AI summaries..."
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

          {usedCategories.length > 0 && (
            <View style={styles.categoryFilterRow}>
              <Pressable
                style={[styles.categoryChip, !categoryFilter && styles.categoryChipActive]}
                onPress={() => setCategoryFilter(null)}
              >
                <Text style={[styles.categoryChipText, !categoryFilter && styles.categoryChipTextActive]}>All</Text>
              </Pressable>
              {usedCategories.map(cat => (
                <Pressable
                  key={cat}
                  style={[styles.categoryChip, categoryFilter === cat && styles.categoryChipActive, { borderColor: getCategoryColor(cat) }]}
                  onPress={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
                >
                  <View style={[styles.categoryDot, { backgroundColor: getCategoryColor(cat) }]} />
                  <Text style={[styles.categoryChipText, categoryFilter === cat && styles.categoryChipTextActive, { color: getCategoryColor(cat) }]}>
                    {cat}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {filteredMessages.length === 0 ? (
            <Animated.View style={[styles.emptyContainer, { opacity: fadeAnim }]}>
              <View style={styles.emptyIconWrap}>
                <Feather name="inbox" size={44} color={colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>No emails</Text>
              <Text style={styles.emptySub}>
                Your inbox is empty or no emails match your search.
              </Text>
            </Animated.View>
          ) : (
            <FlatList
              data={filteredMessages}
              keyExtractor={m => m.id}
              renderItem={renderMessageItem}
              ListHeaderComponent={renderHeader}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl 
                  refreshing={refreshing} 
                  onRefresh={handleRefresh}
                  tintColor={colors.textMuted}
                />
              }
            />
          )}
        </View>
      )}

      <Modal visible={!!selectedEmail} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedEmail && (
              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                <View style={styles.modalHeader}>
                  <Pressable onPress={() => setSelectedEmail(null)} style={styles.modalCloseBtn}>
                    <Feather name="x" size={22} color={colors.text} />
                  </Pressable>
                </View>
                
                <View style={styles.modalSenderRow}>
                  <View style={[styles.senderAvatar, { backgroundColor: getImportanceColor(analyses[selectedEmail.id]?.importance) + '20' }]}>
                    <Text style={[styles.senderInitial, { color: getImportanceColor(analyses[selectedEmail.id]?.importance) }]}>
                      {(extractName(selectedEmail.from)[0] || '?').toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.modalSenderInfo}>
                    <Text style={styles.modalSenderName}>
                      {analyses[selectedEmail.id]?.senderSummary || extractName(selectedEmail.from) || extractEmailAddress(selectedEmail.from)}
                    </Text>
                    <Text style={styles.modalEmailAddress}>{extractEmailAddress(selectedEmail.from)}</Text>
                  </View>
                </View>

                <Text style={styles.modalSubject}>{selectedEmail.subject || '(No subject)'}</Text>
                <Text style={styles.modalDate}>{new Date(selectedEmail.date || '').toLocaleString()}</Text>

                {analyses[selectedEmail.id]?.contentSummary && (
                  <View style={styles.modalAISection}>
                    <View style={styles.summaryBadge}>
                      <Feather name="zap" size={12} color={colors.primary} />
                      <Text style={styles.summaryBadgeText}>AI Summary</Text>
                    </View>
                    <Text style={styles.modalAISummary}>{analyses[selectedEmail.id]?.contentSummary}</Text>
                  </View>
                )}

                {analyses[selectedEmail.id]?.categories.length > 0 && (
                  <View style={styles.categoryRow}>
                    {analyses[selectedEmail.id]?.categories.map(cat => (
                      <View 
                        key={cat} 
                        style={[styles.categoryTag, { backgroundColor: getCategoryColor(cat) + '20', borderColor: getCategoryColor(cat) + '40' }]}
                      >
                        <Text style={[styles.categoryText, { color: getCategoryColor(cat) }]}>{cat}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <View style={styles.modalDivider} />

                {loadingContent ? (
                  <ActivityIndicator color={colors.textMuted} style={{ marginVertical: spacing.lg }} />
                ) : (
                  <Text style={styles.modalBody}>{emailContent || 'No content'}</Text>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingBottom: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  headerCenter: { flex: 1, alignItems: 'center' },
  iconBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  connectedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  connectedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  connectedText: { fontSize: 10, color: colors.success },

  connectContainer: { flex: 1, padding: spacing.xl, alignItems: 'center', justifyContent: 'center' },
  connectIconWrap: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: colors.panel,
    justifyContent: 'center', alignItems: 'center', marginBottom: spacing.lg,
  },
  connectTitle: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: spacing.sm, textAlign: 'center' },
  connectSubtitle: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: spacing.lg },
  
  featuresList: { width: '100%', marginBottom: spacing.xl, gap: spacing.sm },
  featureItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  featureText: { fontSize: 14, color: colors.text },

  connectBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, borderRadius: radius.md,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  connectBtnPressed: { opacity: 0.85 },
  connectBtnText: { color: colors.primaryText, fontWeight: '600', fontSize: 15 },
  
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.panel, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  secondaryBtnPressed: { opacity: 0.75 },
  secondaryBtnText: { color: colors.textMuted, fontSize: 14 },

  inboxContainer: { flex: 1 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.panel, borderRadius: radius.md,
    margin: spacing.md, paddingHorizontal: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  searchIcon: { marginRight: spacing.xs },
  searchInput: { flex: 1, paddingVertical: spacing.sm, fontSize: 15, color: colors.text },
  
  statsRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  statPill: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.panel, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill },
  statText: { fontSize: 12, color: colors.textMuted },

  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: 100 },
  
  emailCard: {
    backgroundColor: colors.panel, borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  cardPressed: { opacity: 0.75 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm },
  senderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  senderAvatar: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  senderInitial: { fontSize: 14, fontWeight: '700' },
  senderInfo: { flex: 1 },
  senderName: { fontSize: 14, fontWeight: '600', color: colors.text },
  validatedRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  validatedText: { fontSize: 10, color: colors.success },
  emailTime: { fontSize: 12, color: colors.textMuted },

  aiSummary: { marginBottom: spacing.sm },
  summaryBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.xs },
  summaryBadgeText: { fontSize: 10, color: colors.primary, fontWeight: '600' },
  summaryText: { fontSize: 14, color: colors.text, lineHeight: 20, fontWeight: '500' },

  emailSubject: { fontSize: 14, color: colors.textMuted, marginBottom: spacing.sm },
  emailSnippet: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: spacing.sm },
  categoryTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1 },
  categoryText: { fontSize: 11, fontWeight: '500' },

  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xxl },
  emptyIconWrap: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.panel, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.md },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  emptySub: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: '90%' },
  modalScroll: { padding: spacing.lg },
  modalHeader: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: spacing.md },
  modalCloseBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  modalSenderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  modalSenderInfo: { flex: 1 },
  modalSenderName: { fontSize: 16, fontWeight: '700', color: colors.text },
  modalEmailAddress: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  modalSubject: { fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  modalDate: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.lg },
  modalAISection: { backgroundColor: colors.panel, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.lg },
  modalAISummary: { fontSize: 14, color: colors.text, lineHeight: 20 },
  modalDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.lg },
  modalBody: { fontSize: 15, color: colors.text, lineHeight: 22 },

  categoryFilterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  categoryChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  categoryChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  categoryChipText: { fontSize: 12, color: colors.textMuted, fontWeight: '500' },
  categoryChipTextActive: { color: colors.primaryText },
  categoryDot: { width: 6, height: 6, borderRadius: 3 },
});