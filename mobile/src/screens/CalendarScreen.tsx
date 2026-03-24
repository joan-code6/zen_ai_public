import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, Pressable, StyleSheet, FlatList, TextInput,
  ActivityIndicator, Alert, StatusBar, RefreshControl, Animated, Modal, ScrollView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { calendar as calendarApi, type CalendarConnection, type CalendarEvent, users } from '../services/api';
import { colors, spacing, radius, typography } from '../theme/tokens';
import type { AppStackParams } from '../navigation';
import { translations } from '../i18n/translations';

type Nav = NativeStackNavigationProp<AppStackParams, 'Calendar'>;

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface DayEvent {
  date: Date;
  events: CalendarEvent[];
}

function getMonthDays(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startDayOfWeek = firstDay.getDay();
  
  const days: (Date | null)[] = [];
  for (let i = 0; i < startDayOfWeek; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(new Date(year, month, i));
  }
  return days;
}

function formatTime(dateStr?: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString();
}

function isSameDay(d1?: { dateTime?: string; date?: string }, d2: Date): boolean {
  if (!d1) return false;
  const dateStr = d1.dateTime || d1.date;
  if (!dateStr) return false;
  const eventDate = new Date(dateStr);
  return eventDate.getFullYear() === d2.getFullYear() &&
    eventDate.getMonth() === d2.getMonth() &&
    eventDate.getDate() === d2.getDate();
}

function getEventColor(summary?: string): string {
  if (!summary) return colors.primary;
  const hash = summary.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const eventColors = [colors.primary, colors.success, colors.warning, '#58a6ff', '#b392f0', '#f78166'];
  return eventColors[hash % eventColors.length];
}

export default function CalendarScreen() {
  const nav = useNavigation<Nav>();
  const { user, getToken } = useAuth();

  const [connection, setConnection] = useState<CalendarConnection | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [settings, setSettings] = useState<{ language?: string } | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEventModal, setShowEventModal] = useState<CalendarEvent | null>(null);
  const [newEvent, setNewEvent] = useState({ title: '', description: '', date: '', startTime: '', endTime: '', location: '' });

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [fadeAnim]);

  useEffect(() => {
    Animated.spring(slideAnim, { toValue: showCreateModal ? 1 : 0, useNativeDriver: true }).start();
  }, [showCreateModal, slideAnim]);

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const token = await getToken();
      const [connRes, eventsRes, settingsRes] = await Promise.all([
        calendarApi.getGoogleConnection(token).catch(() => ({ connected: false } as CalendarConnection)),
        calendarApi.listEvents(token, { maxResults: 250 }).catch(() => ({ items: [] })),
        users.getSettings(user.uid, token).catch(() => null),
      ]);

      setConnection(connRes);
      setEvents(eventsRes.items || []);
      setSettings(settingsRes);
    } catch (e: any) {
      console.log('Calendar fetch error:', e.message);
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

  const handleConnectGoogle = async () => {
    if (!user) return;
    try {
      const token = await getToken();
      const authUrlRes = await calendarApi.getGoogleAuthUrl('zenai://oauth/calendar', user.uid);
      Alert.alert(
        t('calendarConnect'),
        t('calendarConnectDesc'),
        [
          { text: t('cancel'), style: 'cancel' },
          { text: t('continue'), onPress: () => {
            Alert.alert('OAuth', `URL: ${authUrlRes.authorizationUrl.substring(0, 50)}...`);
          }},
        ]
      );
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleDisconnect = () => {
    Alert.alert(
      t('calendarDisconnect'),
      t('calendarDisconnectConfirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('calendarDisconnect'), style: 'destructive', onPress: async () => {
          try {
            const token = await getToken();
            await calendarApi.disconnectGoogle(token);
            setConnection({ connected: false, provider: 'google' });
            setEvents([]);
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        }},
      ]
    );
  };

  const handleCreateEvent = async () => {
    if (!newEvent.title.trim() || !newEvent.date || !newEvent.startTime || !newEvent.endTime) {
      Alert.alert('Error', t('calendarFillRequired'));
      return;
    }

    try {
      const token = await getToken();
      const startDateTime = `${newEvent.date}T${newEvent.startTime}:00`;
      const endDateTime = `${newEvent.date}T${newEvent.endTime}:00`;

      await calendarApi.createEvent(token, {
        event: {
          summary: newEvent.title,
          description: newEvent.description,
          start: { dateTime: startDateTime },
          end: { dateTime: endDateTime },
          location: newEvent.location,
        },
      });

      setShowCreateModal(false);
      setNewEvent({ title: '', description: '', date: '', startTime: '', endTime: '', location: '' });
      await fetchData();
      Alert.alert(t('calendarEventCreated'));
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleDeleteEvent = (event: CalendarEvent) => {
    Alert.alert(
      t('calendarDeleteEvent'),
      t('calendarDeleteConfirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('delete'), style: 'destructive', onPress: async () => {
          try {
            const token = await getToken();
            await calendarApi.deleteEvent(event.id, token);
            setShowEventModal(null);
            await fetchData();
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        }},
      ]
    );
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthDays = getMonthDays(year, month);

  const getEventsForDate = (date: Date): CalendarEvent[] => {
    return events.filter(e => isSameDay(e.start, date) || isSameDay(e.end, date));
  };

  const selectedDateEvents = getEventsForDate(selectedDate);

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
  };

  const renderCalendarDay = (date: Date | null, index: number) => {
    if (!date) {
      return <View key={`empty-${index}`} style={styles.dayCell} />;
    }

    const isToday = new Date().toDateString() === date.toDateString();
    const isSelected = date.toDateString() === selectedDate.toDateString();
    const dayEvents = getEventsForDate(date);

    return (
      <Pressable
        key={date.toISOString()}
        style={[
          styles.dayCell,
          isToday && styles.dayCellToday,
          isSelected && styles.dayCellSelected,
        ]}
        onPress={() => setSelectedDate(date)}
      >
        <Text style={[
          styles.dayNumber,
          isToday && styles.dayNumberToday,
          isSelected && styles.dayNumberSelected,
        ]}>
          {date.getDate()}
        </Text>
        {dayEvents.length > 0 && (
          <View style={styles.eventDots}>
            {dayEvents.slice(0, 3).map((e, i) => (
              <View key={i} style={[styles.eventDot, { backgroundColor: getEventColor(e.summary) }]} />
            ))}
          </View>
        )}
      </Pressable>
    );
  };

  const renderWeekView = () => {
    const startOfWeek = new Date(selectedDate);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    
    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(d.getDate() + i);
      return d;
    });

    return (
      <View style={styles.weekContainer}>
        {weekDays.map((date, i) => {
          const isToday = new Date().toDateString() === date.toDateString();
          const isSelected = date.toDateString() === selectedDate.toDateString();
          const dayEvents = getEventsForDate(date);

          return (
            <Pressable
              key={i}
              style={[
                styles.weekDayColumn,
                isSelected && styles.weekDaySelected,
              ]}
              onPress={() => setSelectedDate(date)}
            >
              <Text style={styles.weekDayName}>{DAYS[i]}</Text>
              <View style={[
                styles.weekDayNumber,
                isToday && styles.weekDayNumberToday,
                isSelected && styles.weekDayNumberSelected,
              ]}>
                <Text style={[
                  styles.weekDayNumberText,
                  isToday && styles.weekDayNumberTextToday,
                  isSelected && styles.weekDayNumberTextSelected,
                ]}>{date.getDate()}</Text>
              </View>
              <View style={styles.weekEvents}>
                {dayEvents.slice(0, 2).map((e, j) => (
                  <View key={j} style={[styles.weekEventPill, { backgroundColor: getEventColor(e.summary) + '30' }]}>
                    <Text style={[styles.weekEventText, { color: getEventColor(e.summary) }]} numberOfLines={1}>
                      {e.summary}
                    </Text>
                  </View>
                ))}
                {dayEvents.length > 2 && (
                  <Text style={styles.moreEventsText}>+{dayEvents.length - 2} more</Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    );
  };

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
          <Text style={styles.headerTitle}>{t('calendar') || 'Calendar'}</Text>
          {connection?.connected && (
            <View style={styles.connectedBadge}>
              <View style={styles.connectedDot} />
              <Text style={styles.connectedText}>{t('calendarConnected') || 'Connected'}</Text>
            </View>
          )}
        </View>
        <Pressable onPress={handleRefresh} style={styles.iconBtn} hitSlop={8}>
          <Feather name="refresh-cw" size={18} color={colors.text} />
        </Pressable>
      </SafeAreaView>

      {!connection?.connected ? (
        <Animated.View style={[styles.connectContainer, { opacity: fadeAnim }]}>
          <View style={styles.connectIconWrap}>
            <Feather name="calendar" size={48} color={colors.primary} />
          </View>
          <Text style={styles.connectTitle}>{t('calendarTitle') || 'Smart Calendar'}</Text>
          <Text style={styles.connectSubtitle}>
            {t('calendarSubtitle') || 'Sync with Google Calendar to see your events, schedule meetings, and stay organized.'}
          </Text>
          
          <View style={styles.featuresList}>
            <View style={styles.featureItem}>
              <Feather name="check-circle" size={16} color={colors.success} />
              <Text style={styles.featureText}>{t('calendarFeature1') || 'View all your events in one place'}</Text>
            </View>
            <View style={styles.featureItem}>
              <Feather name="check-circle" size={16} color={colors.success} />
              <Text style={styles.featureText}>{t('calendarFeature2') || 'Create and manage events'}</Text>
            </View>
            <View style={styles.featureItem}>
              <Feather name="check-circle" size={16} color={colors.success} />
              <Text style={styles.featureText}>{t('calendarFeature3') || 'Month and week views'}</Text>
            </View>
          </View>

          <Pressable 
            style={({ pressed }) => [styles.connectBtn, pressed && styles.connectBtnPressed]}
            onPress={handleConnectGoogle}
          >
            <Feather name="google" size={18} color={colors.primaryText} />
            <Text style={styles.connectBtnText}>{t('calendarConnectGoogle') || 'Connect Google Calendar'}</Text>
          </Pressable>
        </Animated.View>
      ) : (
        <Animated.View style={[styles.calendarContainer, { opacity: fadeAnim }]}>
          <View style={styles.monthNav}>
            <Pressable onPress={prevMonth} style={styles.navBtn}>
              <Feather name="chevron-left" size={24} color={colors.text} />
            </Pressable>
            <Pressable onPress={goToToday}>
              <Text style={styles.monthTitle}>{MONTHS[month]} {year}</Text>
            </Pressable>
            <Pressable onPress={nextMonth} style={styles.navBtn}>
              <Feather name="chevron-right" size={24} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.viewToggle}>
            <Pressable 
              style={[styles.toggleBtn, viewMode === 'month' && styles.toggleBtnActive]}
              onPress={() => setViewMode('month')}
            >
              <Text style={[styles.toggleText, viewMode === 'month' && styles.toggleTextActive]}>
                {t('calendarMonth') || 'Month'}
              </Text>
            </Pressable>
            <Pressable 
              style={[styles.toggleBtn, viewMode === 'week' && styles.toggleBtnActive]}
              onPress={() => setViewMode('week')}
            >
              <Text style={[styles.toggleText, viewMode === 'week' && styles.toggleTextActive]}>
                {t('calendarWeek') || 'Week'}
              </Text>
            </Pressable>
          </View>

          {viewMode === 'month' ? (
            <View style={styles.monthGrid}>
              <View style={styles.weekdayRow}>
                {DAYS.map(day => (
                  <View key={day} style={styles.weekdayCell}>
                    <Text style={styles.weekdayText}>{day}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.daysGrid}>
                {monthDays.map((date, i) => renderCalendarDay(date, i))}
              </View>
            </View>
          ) : (
            renderWeekView()
          )}

          <View style={styles.selectedEventsSection}>
            <View style={styles.selectedHeader}>
              <Text style={styles.selectedDateText}>
                {selectedDate.toLocaleDateString(lang, { weekday: 'long', month: 'long', day: 'numeric' })}
              </Text>
              <Pressable 
                style={styles.addEventBtn}
                onPress={() => {
                  setNewEvent(prev => ({ ...prev, date: selectedDate.toISOString().split('T')[0] }));
                  setShowCreateModal(true);
                }}
              >
                <Feather name="plus" size={18} color={colors.primaryText} />
              </Pressable>
            </View>

            {selectedDateEvents.length === 0 ? (
              <View style={styles.noEvents}>
                <Text style={styles.noEventsText}>{t('calendarNoEvents') || 'No events'}</Text>
              </View>
            ) : (
              <FlatList
                data={selectedDateEvents}
                keyExtractor={e => e.id}
                renderItem={({ item }) => (
                  <Pressable 
                    style={styles.eventCard}
                    onPress={() => setShowEventModal(item)}
                  >
                    <View style={[styles.eventColorBar, { backgroundColor: getEventColor(item.summary) }]} />
                    <View style={styles.eventContent}>
                      <Text style={styles.eventTitle}>{item.summary || '(No title)'}</Text>
                      <Text style={styles.eventTime}>
                        {formatTime(item.start?.dateTime)} - {formatTime(item.end?.dateTime)}
                      </Text>
                      {item.location && (
                        <Text style={styles.eventLocation}>
                          <Feather name="map-pin" size={10} color={colors.textMuted} /> {item.location}
                        </Text>
                      )}
                    </View>
                    <Feather name="chevron-right" size={18} color={colors.textMuted} />
                  </Pressable>
                )}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>
        </Animated.View>
      )}

      <Modal visible={showCreateModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <Animated.View style={[
            styles.modalContent,
            { transform: [{ translateY: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [400, 0] }) }] }
          ]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('calendarNewEvent') || 'New Event'}</Text>
              <Pressable onPress={() => setShowCreateModal(false)}>
                <Feather name="x" size={22} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalForm} showsVerticalScrollIndicator={false}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t('calendarTitle') || 'Title'} *</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('calendarTitlePlaceholder') || 'Event title'}
                  placeholderTextColor={colors.textMuted}
                  value={newEvent.title}
                  onChangeText={text => setNewEvent(prev => ({ ...prev, title: text }))}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t('calendarDate') || 'Date'} *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textMuted}
                  value={newEvent.date}
                  onChangeText={text => setNewEvent(prev => ({ ...prev, date: text }))}
                />
              </View>

              <View style={styles.timeRow}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>{t('calendarStartTime') || 'Start'} *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="HH:MM"
                    placeholderTextColor={colors.textMuted}
                    value={newEvent.startTime}
                    onChangeText={text => setNewEvent(prev => ({ ...prev, startTime: text }))}
                  />
                </View>
                <View style={{ width: spacing.md }} />
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>{t('calendarEndTime') || 'End'} *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="HH:MM"
                    placeholderTextColor={colors.textMuted}
                    value={newEvent.endTime}
                    onChangeText={text => setNewEvent(prev => ({ ...prev, endTime: text }))}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t('calendarLocation') || 'Location'}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('calendarLocationPlaceholder') || 'Add location'}
                  placeholderTextColor={colors.textMuted}
                  value={newEvent.location}
                  onChangeText={text => setNewEvent(prev => ({ ...prev, location: text }))}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t('calendarDescription') || 'Description'}</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder={t('calendarDescriptionPlaceholder') || 'Add description'}
                  placeholderTextColor={colors.textMuted}
                  value={newEvent.description}
                  onChangeText={text => setNewEvent(prev => ({ ...prev, description: text }))}
                  multiline
                  numberOfLines={3}
                />
              </View>

              <View style={styles.modalActions}>
                <Pressable 
                  style={({ pressed }) => [styles.cancelBtn, pressed && styles.btnPressed]}
                  onPress={() => setShowCreateModal(false)}
                >
                  <Text style={styles.cancelBtnText}>{t('cancel')}</Text>
                </Pressable>
                <Pressable 
                  style={({ pressed }) => [styles.submitBtn, pressed && styles.btnPressed]}
                  onPress={handleCreateEvent}
                >
                  <Text style={styles.submitBtnText}>{t('calendarCreate') || 'Create Event'}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>

      <Modal visible={!!showEventModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            {showEventModal && (
              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{showEventModal.summary || '(No title)'}</Text>
                  <Pressable onPress={() => setShowEventModal(null)}>
                    <Feather name="x" size={22} color={colors.text} />
                  </Pressable>
                </View>

                <View style={styles.eventDetailRow}>
                  <Feather name="clock" size={16} color={colors.textMuted} />
                  <Text style={styles.eventDetailText}>
                    {formatDate(showEventModal.start?.dateTime)} • {formatTime(showEventModal.start?.dateTime)} - {formatTime(showEventModal.end?.dateTime)}
                  </Text>
                </View>

                {showEventModal.location && (
                  <View style={styles.eventDetailRow}>
                    <Feather name="map-pin" size={16} color={colors.textMuted} />
                    <Text style={styles.eventDetailText}>{showEventModal.location}</Text>
                  </View>
                )}

                {showEventModal.description && (
                  <View style={styles.eventDescription}>
                    <Text style={styles.eventDescriptionText}>{showEventModal.description}</Text>
                  </View>
                )}

                <View style={styles.modalActions}>
                  <Pressable 
                    style={({ pressed }) => [styles.deleteBtn, pressed && styles.btnPressed]}
                    onPress={() => handleDeleteEvent(showEventModal)}
                  >
                    <Feather name="trash-2" size={16} color={colors.danger} />
                    <Text style={styles.deleteBtnText}>{t('delete')}</Text>
                  </Pressable>
                </View>
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
  },
  connectBtnPressed: { opacity: 0.85 },
  connectBtnText: { color: colors.primaryText, fontWeight: '600', fontSize: 15 },

  calendarContainer: { flex: 1 },
  monthNav: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  navBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  monthTitle: { fontSize: 18, fontWeight: '700', color: colors.text },

  viewToggle: {
    flexDirection: 'row', marginHorizontal: spacing.md, marginBottom: spacing.md,
    backgroundColor: colors.panel, borderRadius: radius.md, padding: 4,
  },
  toggleBtn: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderRadius: radius.sm },
  toggleBtnActive: { backgroundColor: colors.primary },
  toggleText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  toggleTextActive: { color: colors.primaryText },

  monthGrid: { paddingHorizontal: spacing.sm },
  weekdayRow: { flexDirection: 'row', marginBottom: spacing.xs },
  weekdayCell: { flex: 1, alignItems: 'center', paddingVertical: spacing.xs },
  weekdayText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: `${100/7}%`, aspectRatio: 1, padding: 2 },
  dayCellToday: {},
  dayCellSelected: { backgroundColor: colors.panel, borderRadius: radius.sm },
  dayNumber: { fontSize: 14, fontWeight: '500', color: colors.text, textAlign: 'center', marginTop: 4 },
  dayNumberToday: { color: colors.primary, fontWeight: '700' },
  dayNumberSelected: { color: colors.primaryText, fontWeight: '700' },
  eventDots: { flexDirection: 'row', justifyContent: 'center', gap: 2, marginTop: 2 },
  eventDot: { width: 4, height: 4, borderRadius: 2 },

  weekContainer: { flexDirection: 'row', paddingHorizontal: spacing.xs },
  weekDayColumn: { flex: 1, alignItems: 'center', paddingVertical: spacing.xs },
  weekDaySelected: { backgroundColor: colors.panel, borderRadius: radius.sm },
  weekDayName: { fontSize: 10, color: colors.textMuted, marginBottom: 4 },
  weekDayNumber: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  weekDayNumberToday: { backgroundColor: colors.primary },
  weekDayNumberSelected: { backgroundColor: colors.primary },
  weekDayNumberText: { fontSize: 14, fontWeight: '600', color: colors.text },
  weekDayNumberTextToday: { color: colors.primaryText },
  weekDayNumberTextSelected: { color: colors.primaryText },
  weekEvents: { width: '100%', paddingHorizontal: 2, gap: 2 },
  weekEventPill: { paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 },
  weekEventText: { fontSize: 8, fontWeight: '500' },
  moreEventsText: { fontSize: 8, color: colors.textMuted, textAlign: 'center' },

  selectedEventsSection: {
    flex: 1, marginTop: spacing.md, paddingHorizontal: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  selectedHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.md,
  },
  selectedDateText: { fontSize: 16, fontWeight: '600', color: colors.text },
  addEventBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  noEvents: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  noEventsText: { fontSize: 14, color: colors.textMuted },
  eventCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.panel,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  eventColorBar: { width: 4, height: '100%', minHeight: 40, borderRadius: 2, marginRight: spacing.md },
  eventContent: { flex: 1 },
  eventTitle: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 2 },
  eventTime: { fontSize: 13, color: colors.textMuted },
  eventLocation: { fontSize: 12, color: colors.textMuted, marginTop: 2 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalContent: { 
    backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, 
    borderTopRightRadius: radius.xl, maxHeight: '85%',
  },
  modalHandle: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: 'center', marginTop: spacing.sm },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  modalScroll: { padding: spacing.lg },
  modalForm: { padding: spacing.lg },
  
  inputGroup: { marginBottom: spacing.md },
  inputLabel: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.panel, borderRadius: radius.md, paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  timeRow: { flexDirection: 'row' },
  
  modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg, paddingBottom: spacing.xl },
  cancelBtn: { flex: 1, paddingVertical: spacing.md, alignItems: 'center', borderRadius: radius.md, backgroundColor: colors.panel },
  cancelBtnText: { color: colors.text, fontWeight: '600' },
  submitBtn: { flex: 1, paddingVertical: spacing.md, alignItems: 'center', borderRadius: radius.md, backgroundColor: colors.primary },
  submitBtnText: { color: colors.primaryText, fontWeight: '600' },
  deleteBtn: { 
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingVertical: spacing.md, alignItems: 'center', borderRadius: radius.md, 
    backgroundColor: colors.danger + '20', borderWidth: 1, borderColor: colors.danger + '40' 
  },
  deleteBtnText: { color: colors.danger, fontWeight: '600' },
  btnPressed: { opacity: 0.75 },

  eventDetailRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  eventDetailText: { fontSize: 14, color: colors.textMuted },
  eventDescription: { backgroundColor: colors.panel, padding: spacing.md, borderRadius: radius.md, marginTop: spacing.sm },
  eventDescriptionText: { fontSize: 14, color: colors.text, lineHeight: 20 },
});
