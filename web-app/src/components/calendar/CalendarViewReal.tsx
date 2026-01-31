import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import CacheService from '@/services/cacheService';
import CalendarService, { type CalendarEvent, type GoogleCalendarConnection, type CalendarEventList } from '@/services/calendarService';
import CalendarGrid from './CalendarGrid';
import EventForm from './EventForm';
import EventDetail from './EventDetail';
import CalendarSettings from './CalendarSettings';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Calendar as CalendarIcon, 
  Settings, 
  Plus, 
  Link, 
  Link2Off,
  ChevronLeft,
  ChevronRight,
  CalendarDays
} from 'lucide-react';

type View = 'month' | 'week' | 'day' | 'agenda';
type Mode = 'view' | 'create' | 'detail' | 'settings';

export default function CalendarViewReal() {
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<View>('month');
  const [mode, setMode] = useState<Mode>('view');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [connection, setConnection] = useState<any>(null);

  useEffect(() => {
    if (user) {
      loadCalendarConnection();
    }
  }, [user]);

  useEffect(() => {
    if (connection?.connected) {
      loadEvents();
    }
  }, [connection, currentDate, view]);

  const loadCalendarConnection = async () => {
    try {
      const connectionCacheKey = 'calendar:connection';
      let calendarConnection = CacheService.get<GoogleCalendarConnection>(connectionCacheKey);
      
      if (!calendarConnection) {
        calendarConnection = await CalendarService.getGoogleConnection();
        CacheService.set(connectionCacheKey, calendarConnection, 10 * 60 * 1000);
      }
      
      console.log('Calendar connection status:', calendarConnection);
      setConnection(calendarConnection);
      
      if (calendarConnection.connected) {
        console.log('Calendar connected, loading events...');
        await loadEvents();
      } else {
        console.log('Calendar not connected');
      }
    } catch (error) {
      console.error('Failed to load calendar connection:', error);
      setConnection({ connected: false, error: error.message });
    } finally {
      setLoading(false);
    }
  };

  const loadEvents = async () => {
    if (!connection?.connected) return;

    try {
      const timeMin = new Date(currentDate);
      const timeMax = new Date(currentDate);
      
      if (view === 'month') {
        timeMin.setDate(1);
        timeMax.setMonth(timeMax.getMonth() + 1);
        timeMax.setDate(0);
      } else if (view === 'week') {
        const dayOfWeek = timeMin.getDay();
        timeMin.setDate(timeMin.getDate() - dayOfWeek);
        timeMax.setDate(timeMin.getDate() + 6);
      } else {
        timeMax.setDate(timeMax.getDate() + 1);
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
  };

  const handleConnectGoogle = async () => {
    if (!user) return;

    try {
      setConnecting(true);
      const redirectUri = `${window.location.origin}/calendar-callback`;
      const authUrl = await CalendarService.getGoogleAuthUrl(redirectUri);
      
      // Use redirect instead of popup for better mobile support
      window.location.href = authUrl.authorizationUrl;
    } catch (error) {
      console.error('Failed to initiate Google Calendar OAuth:', error);
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await CalendarService.deleteGoogleConnection();
      setConnection(null);
      setEvents([]);
    } catch (error) {
      console.error('Failed to disconnect calendar:', error);
    }
  };

  const handleCreateEvent = () => {
    setSelectedEvent(null);
    setMode('create');
  };

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setMode('detail');
  };

  const handleEventSaved = (event: CalendarEvent) => {
    CacheService.invalidateView('calendar');
    setMode('view');
    loadEvents();
  };

  const handleEventDeleted = () => {
    CacheService.invalidateView('calendar');
    setMode('view');
    loadEvents();
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

  const getEventStats = () => {
    const today = new Date();
    const todayEvents = events.filter(event => {
      const eventStart = new Date(event.start.dateTime || event.start.date!);
      const eventEnd = new Date(event.end.dateTime || event.end.date!);
      return eventStart.toDateString() === today.toDateString();
    });

    const upcomingEvents = events.filter(event => {
      const eventStart = new Date(event.start.dateTime || event.start.date!);
      return eventStart > today;
    });

    return {
      totalEvents: events.length,
      todayEvents: todayEvents.length,
      upcomingEvents: upcomingEvents.length
    };
  };

  const stats = getEventStats();

  const renderCurrentMode = () => {
    switch (mode) {
      case 'create':
        return (
          <EventForm
            event={selectedEvent}
            currentDate={currentDate}
            onSaved={handleEventSaved}
            onCancel={() => setMode('view')}
          />
        );
      case 'detail':
        return selectedEvent ? (
          <EventDetail
            event={selectedEvent}
            onEdit={() => setMode('create')}
            onDelete={handleEventDeleted}
            onBack={() => setMode('view')}
          />
        ) : null;
      case 'settings':
        return (
          <CalendarSettings
            connection={connection}
            onBack={() => setMode('view')}
            onConnectionChanged={loadCalendarConnection}
          />
        );
      default:
        return (
          <CalendarGrid
            currentDate={currentDate}
            view={view}
            events={events}
            onEventClick={handleEventClick}
            onDateClick={(date) => {
              setCurrentDate(date);
              setView('day');
            }}
          />
        );
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading calendar...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* Sidebar */}
      <div className="w-80 border-r border-border bg-card/50">
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <CalendarIcon className="w-6 h-6 text-primary" />
              <h2 className="text-2xl font-bold text-foreground">Calendar</h2>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMode('settings')}
            >
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
          </div>

          {connection?.connected && (
            <Button
              onClick={handleCreateEvent}
              className="w-full gap-2"
            >
              <Plus className="w-4 h-4" />
              New Event
            </Button>
          )}
        </div>

        {/* Connection Status */}
        <div className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Google Calendar</h3>
          
          {connection?.connected ? (
            <Card className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <div>
                    <div className="font-medium text-sm">Connected</div>
                    <div className="text-xs text-muted-foreground">
                      {connection.scopes?.length} permissions granted
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDisconnect}
                  className="text-destructive"
                >
                  <Link2Off className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="p-4">
              <p className="text-sm text-muted-foreground mb-3">
                Connect your Google Calendar to manage events
              </p>
              <Button
                onClick={handleConnectGoogle}
                disabled={connecting}
                className="w-full gap-2"
              >
                <Link className="w-4 h-4" />
                {connecting ? 'Connecting...' : 'Connect Google Calendar'}
              </Button>
            </Card>
          )}
        </div>

        {/* Navigation */}
        {connection?.connected && (
          <div className="p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Navigation</h3>
            <div className="space-y-2">
              <Button
                variant={view === 'month' ? 'secondary' : 'ghost'}
                className="w-full justify-start"
                onClick={() => setView('month')}
              >
                Month View
              </Button>
              <Button
                variant={view === 'week' ? 'secondary' : 'ghost'}
                className="w-full justify-start"
                onClick={() => setView('week')}
              >
                Week View
              </Button>
              <Button
                variant={view === 'day' ? 'secondary' : 'ghost'}
                className="w-full justify-start"
                onClick={() => setView('day')}
              >
                Day View
              </Button>
            </div>
          </div>
        )}

        {/* Stats */}
        {connection?.connected && (
          <div className="p-4 border-t border-border">
            <h3 className="text-sm font-semibold text-foreground mb-3">Statistics</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total Events</span>
                <Badge variant="secondary">{stats.totalEvents}</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Today</span>
                <Badge variant="secondary">{stats.todayEvents}</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Upcoming</span>
                <Badge variant="secondary">{stats.upcomingEvents}</Badge>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Calendar Header */}
        {connection?.connected && mode === 'view' && (
          <div className="border-b border-border bg-card/50 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={navigatePrevious}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                
                <Button variant="outline" size="sm" onClick={navigateToday}>
                  <CalendarDays className="w-4 h-4 mr-2" />
                  Today
                </Button>
                
                <Button variant="outline" size="sm" onClick={navigateNext}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
                
                <h2 className="text-lg font-semibold text-foreground ml-4">
                  {currentDate.toLocaleDateString('en-US', { 
                    month: 'long', 
                    year: 'numeric',
                    ...(view === 'day' && { day: 'numeric' })
                  })}
                </h2>
              </div>

              <div className="flex gap-1">
                {(['month', 'week', 'day'] as View[]).map((viewType) => (
                  <Button
                    key={viewType}
                    variant={view === viewType ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setView(viewType)}
                  >
                    {viewType.charAt(0).toUpperCase() + viewType.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-hidden">
          {connection?.connected ? (
            renderCurrentMode()
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-md">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <CalendarIcon className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">No calendar connected</h3>
                <p className="text-muted-foreground mb-6">
                  Connect your Google Calendar to start managing your events and appointments.
                </p>
                <Button
                  onClick={handleConnectGoogle}
                  disabled={connecting}
                  size="lg"
                  className="gap-2"
                >
                  <Link className="w-4 h-4" />
                  {connecting ? 'Connecting...' : 'Connect Google Calendar'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}