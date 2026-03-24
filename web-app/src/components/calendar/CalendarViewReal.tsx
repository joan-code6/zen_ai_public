import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTypedTranslation } from '@/hooks/useTranslation';
import CacheService from '@/services/cacheService';
import CalendarService, { type CalendarEvent, type GoogleCalendarConnection, type CalendarEventList } from '@/services/calendarService';
import CalendarGrid from './CalendarGrid';
import EventForm from './EventForm';
import EventDetail from './EventDetail';
import CalendarSettings from './CalendarSettings';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Calendar as CalendarIcon, 
  Settings, 
  Plus, 
  Link,
  ChevronLeft,
  ChevronRight,
  Clock,
  List,
  Grid3X3,
  Menu,
} from 'lucide-react';

type View = 'month' | 'week' | 'day';

interface CalendarState {
  connected: boolean;
  scopes?: string[];
}

export default function CalendarView() {
  const { user } = useAuth();
  const { t } = useTypedTranslation();
  const navigate = useNavigate();
  const params = useParams();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<View>('month');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [connection, setConnection] = useState<CalendarState>({ connected: false });
  const [showSettings, setShowSettings] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const loadEvents = useCallback(async () => {
    if (!connection?.connected) return;

    try {
      setLoading(true);
      let timeMin: Date;
      let timeMax: Date;

      if (view === 'month') {
        timeMin = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        timeMax = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59, 999);
      } else if (view === 'week') {
        const dayOfWeek = currentDate.getDay();
        timeMin = new Date(currentDate);
        timeMin.setDate(currentDate.getDate() - dayOfWeek);
        timeMin.setHours(0, 0, 0, 0);
        timeMax = new Date(timeMin);
        timeMax.setDate(timeMin.getDate() + 6);
        timeMax.setHours(23, 59, 59, 999);
      } else {
        timeMin = new Date(currentDate);
        timeMin.setHours(0, 0, 0, 0);
        timeMax = new Date(currentDate);
        timeMax.setHours(23, 59, 59, 999);
      }

      const cacheKey = `calendar:events:${timeMin.toISOString().split('T')[0]}:${timeMax.toISOString().split('T')[0]}`;
      let eventList = CacheService.get<CalendarEventList>(cacheKey);
      
      if (!eventList) {
        eventList = await CalendarService.getEvents(
          'primary',
          timeMin.toISOString(),
          timeMax.toISOString(),
          100,
          'startTime',
          true
        );
        CacheService.set(cacheKey, eventList, 5 * 60 * 1000);
      }
      
      setEvents(eventList.items || []);
    } catch (error) {
      console.error('Failed to load events:', error);
    } finally {
      setLoading(false);
    }
  }, [connection?.connected, currentDate, view]);

  const loadCalendarConnection = useCallback(async () => {
    try {
      const connectionCacheKey = 'calendar:connection';
      let calendarConnection = CacheService.get<GoogleCalendarConnection>(connectionCacheKey);
      
      if (!calendarConnection) {
        calendarConnection = await CalendarService.getGoogleConnection();
        CacheService.set(connectionCacheKey, calendarConnection, 10 * 60 * 1000);
      }
      
      setConnection(calendarConnection);
      
      if (calendarConnection.connected) {
        await loadEvents();
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.error('Failed to load calendar connection:', error);
      setConnection({ connected: false });
      setLoading(false);
    }
  }, [loadEvents]);

  useEffect(() => {
    if (user) {
      loadCalendarConnection();
    }
  }, [user, loadCalendarConnection]);

  useEffect(() => {
    if (params.eventId && events.length > 0) {
      const event = events.find(e => e.id === params.eventId);
      if (event) {
        setSelectedEvent(event);
      }
    } else if (!params.eventId) {
      setSelectedEvent(null);
    }
  }, [params.eventId, events]);

  useEffect(() => {
    if (connection?.connected) {
      loadEvents();
    }
  }, [connection?.connected, loadEvents]);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('settings') === 'true') {
      setShowSettings(true);
    }
  }, []);

  const handleConnectGoogle = async () => {
    if (!user) return;
    try {
      setConnecting(true);
      const redirectUri = `${window.location.origin}/calendar-callback`;
      const authUrl = await CalendarService.getGoogleAuthUrl(redirectUri);
      window.location.href = authUrl.authorizationUrl;
    } catch (error) {
      console.error('Failed to initiate Google Calendar OAuth:', error);
      setConnecting(false);
    }
  };

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
    navigate(`/calendar/${event.id}`);
  };

  const handleEventSaved = () => {
    CacheService.invalidateView('calendar');
    setIsCreating(false);
    loadEvents();
  };

  const handleEventDeleted = () => {
    setSelectedEvent(null);
    navigate('/calendar');
    CacheService.invalidateView('calendar');
    loadEvents();
  };

  const handleBack = () => {
    setSelectedEvent(null);
    navigate('/calendar');
  };

  const navigatePrevious = () => {
    const newDate = new Date(currentDate);
    if (view === 'month') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else if (view === 'week') {
      newDate.setDate(newDate.getDate() - 7);
    } else {
      newDate.setDate(newDate.getDate() - 1);
    }
    setCurrentDate(newDate);
  };

  const navigateNext = () => {
    const newDate = new Date(currentDate);
    if (view === 'month') {
      newDate.setMonth(newDate.getMonth() + 1);
    } else if (view === 'week') {
      newDate.setDate(newDate.getDate() + 7);
    } else {
      newDate.setDate(newDate.getDate() + 1);
    }
    setCurrentDate(newDate);
  };

  const navigateToday = () => {
    setCurrentDate(new Date());
  };

  const hasConnectedAccount = connection?.connected;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex bg-background">
      {/* Sidebar */}
      <div className="hidden md:flex w-16 sm:w-24 md:w-40 lg:w-64 border-r border-border flex-col bg-sidebar flex-shrink-0 overflow-hidden">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-foreground" />
              <span className="font-semibold text-foreground">{t('navigation.calendar')}</span>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate('/calendar?settings=true')}
              className="h-8 w-8"
              aria-label={t('settings.settings')}
            >
              <Settings className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>
          <Button
            onClick={() => setIsCreating(true)}
            disabled={!hasConnectedAccount}
            className="w-full bg-foreground text-background hover:bg-foreground/90"
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('calendar.newEvent')}
          </Button>
        </div>

        <nav className="flex-1 p-2 space-y-0.5">
          {hasConnectedAccount && (
            <>
              <button
                onClick={() => setView('month')}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                  view === 'month' 
                    ? "bg-sidebar-accent text-foreground font-medium" 
                    : "text-foreground/70 hover:bg-sidebar-accent/50 hover:text-foreground"
                )}
              >
                <Grid3X3 className="w-4 h-4" />
                <span className="flex-1 text-left">{t('calendar.month')}</span>
              </button>
              <button
                onClick={() => setView('week')}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                  view === 'week' 
                    ? "bg-sidebar-accent text-foreground font-medium" 
                    : "text-foreground/70 hover:bg-sidebar-accent/50 hover:text-foreground"
                )}
              >
                <List className="w-4 h-4" />
                <span className="flex-1 text-left">{t('calendar.week')}</span>
              </button>
              <button
                onClick={() => setView('day')}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                  view === 'day' 
                    ? "bg-sidebar-accent text-foreground font-medium" 
                    : "text-foreground/70 hover:bg-sidebar-accent/50 hover:text-foreground"
                )}
              >
                <Clock className="w-4 h-4" />
                <span className="flex-1 text-left">{t('calendar.day')}</span>
              </button>
            </>
          )}
        </nav>

        {hasConnectedAccount && (
          <div className="p-3 border-t border-border">
            <p className="text-xs text-muted-foreground mb-2 px-2">{t('calendar.accounts')}</p>
            <div className="flex items-center gap-2 px-2 py-1.5">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-sm text-foreground/80">Google Calendar</span>
            </div>
          </div>
        )}

        {!hasConnectedAccount && (
          <div className="p-4 border-t border-border">
            <p className="text-sm text-muted-foreground mb-3">{t('calendar.noAccounts')}</p>
            <Button
              onClick={handleConnectGoogle}
              disabled={connecting}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <Link className="w-4 h-4 mr-2" />
              {connecting ? t('common.loading') : t('calendar.connectCalendar')}
            </Button>
          </div>
        )}
      </div>

      {/* Calendar View */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {hasConnectedAccount && !showSettings && !isCreating && !selectedEvent && (
          <div className="border-b border-border">
            <div className="flex items-center justify-between px-4 pl-16 md:pl-4 py-3 gap-2">
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="md:hidden" aria-label={t('navigation.calendar')}>
                      <Menu className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuLabel>{t('navigation.calendar')}</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => setView('month')}>
                      <Grid3X3 className="w-4 h-4" />
                      <span>{t('calendar.month')}</span>
                      {view === 'month' && <Badge variant="secondary">●</Badge>}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setView('week')}>
                      <List className="w-4 h-4" />
                      <span>{t('calendar.week')}</span>
                      {view === 'week' && <Badge variant="secondary">●</Badge>}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setView('day')}>
                      <Clock className="w-4 h-4" />
                      <span>{t('calendar.day')}</span>
                      {view === 'day' && <Badge variant="secondary">●</Badge>}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setIsCreating(true)}>
                      <Plus className="w-4 h-4" />
                      <span>{t('calendar.newEvent')}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/calendar?settings=true')}>
                      <Settings className="w-4 h-4" />
                      <span>{t('settings.settings')}</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="ghost" size="icon" onClick={navigatePrevious} className="h-8 w-8" aria-label="Previous">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={navigateToday} className="h-8">
                  {t('calendar.today')}
                </Button>
                <Button variant="ghost" size="icon" onClick={navigateNext} className="h-8 w-8" aria-label="Next">
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <h2 className="text-lg font-medium text-foreground ml-2">
                  {currentDate.toLocaleDateString('en-US', { 
                    month: 'long', 
                    year: 'numeric',
                    ...(view === 'day' && { day: 'numeric', weekday: 'long' })
                  })}
                </h2>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          {showSettings ? (
            <CalendarSettings
              connection={connection}
              onBack={() => {
                setShowSettings(false);
                navigate('/calendar');
              }}
              onConnectionChanged={loadCalendarConnection}
            />
          ) : isCreating ? (
            <EventForm
              event={null}
              currentDate={currentDate}
              onSaved={handleEventSaved}
              onCancel={() => setIsCreating(false)}
            />
          ) : selectedEvent ? (
            <EventDetail
              event={selectedEvent}
              onEdit={() => {
                setIsCreating(true);
                setSelectedEvent(null);
              }}
              onDelete={handleEventDeleted}
              onBack={handleBack}
            />
          ) :           hasConnectedAccount ? (
            <CalendarGrid
              currentDate={currentDate}
              view={view}
              events={events}
              onEventClick={handleEventClick}
              onDateClick={(date) => {
                setCurrentDate(date);
                setIsCreating(true);
              }}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
              <CalendarIcon className="w-12 h-12 text-muted-foreground mb-4" />
              <h2 className="text-lg font-semibold text-foreground mb-2">
                {t('calendar.noAccountsConnected')}
              </h2>
              <p className="text-muted-foreground mb-6 max-w-sm">
                {t('calendar.connectToStart')}
              </p>
              <Button
                onClick={handleConnectGoogle}
                disabled={connecting}
                className="bg-foreground text-background hover:bg-foreground/90"
              >
                <Link className="w-4 h-4 mr-2" />
                {connecting ? t('common.loading') : t('calendar.connectCalendar')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
