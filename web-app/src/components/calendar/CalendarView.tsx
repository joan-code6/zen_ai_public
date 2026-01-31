import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { CalendarEvent } from '@/types/calendar';
import { useCalendar } from '@/hooks/useCalendar';
import { 
  ChevronLeft, 
  ChevronRight, 
  Clock,
  MapPin,
  Users,
  Plus,
  X,
  Loader2
} from 'lucide-react';

function CalendarView() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'month' | 'week' | 'day'>('month');
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  
  const {
    events,
    isLoading,
    error,
    isConnected,
    loadEventsForView,
    createEvent,
    updateEvent,
    deleteEvent
  } = useCalendar({ autoLoad: true });

  // Load events when view or date changes
  useEffect(() => {
    if (isConnected) {
      loadEventsForView(view, currentDate);
    }
  }, [view, currentDate, isConnected, loadEventsForView]);

  // Convert service events to component events format
  const formattedEvents = useMemo(() => {
    return events.map(event => ({
      id: event.id || '',
      title: event.summary,
      description: event.description,
      start: new Date(event.start.dateTime || event.start.date!),
      end: new Date(event.end.dateTime || event.end.date!),
      type: 'meeting' as const, // Default type
      color: '#3b82f6', // Default color
      location: event.location,
      attendees: event.attendees?.map(a => a.displayName || a.email) || [],
      isAllDay: !!(event.start.date && event.end.date)
    }));
  }, [events]);

  const navigatePrevious = useCallback(() => {
    if (view === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    } else if (view === 'week') {
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() - 7);
      setCurrentDate(newDate);
    } else {
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() - 1);
      setCurrentDate(newDate);
    }
  }, [view, currentDate]);

  const navigateNext = useCallback(() => {
    if (view === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    } else if (view === 'week') {
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() + 7);
      setCurrentDate(newDate);
    } else {
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() + 1);
      setCurrentDate(newDate);
    }
  }, [view, currentDate]);

  const navigateToday = () => {
    setCurrentDate(new Date());
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (view === 'month') {
      e.preventDefault();
      
      if (e.deltaY < 0) {
        navigatePrevious();
      } else if (e.deltaY > 0) {
        navigateNext();
      }
    }
  };

  const visibleEvents = useMemo(() => {
    return formattedEvents.filter(event => {
      if (view === 'month') {
        return event.start.getMonth() === currentDate.getMonth() &&
               event.start.getFullYear() === currentDate.getFullYear();
      } else if (view === 'week') {
        const weekStart = new Date(currentDate);
        weekStart.setDate(currentDate.getDate() - currentDate.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        
        return event.start >= weekStart && event.start <= weekEnd;
      } else {
        return event.start.toDateString() === currentDate.toDateString();
      }
    });
  }, [formattedEvents, currentDate, view]);

  const getEventsForDay = (day: Date) => {
    return visibleEvents.filter(event => 
      event.start.toDateString() === day.toDateString()
    );
  };

  const formatMonthYear = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  // Show loading state
  if (isLoading && formattedEvents.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-card">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-muted-foreground" />
          <p className="text-muted-foreground">Loading calendar...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-card">
        <div className="text-center max-w-md">
          <p className="text-destructive mb-4">{error}</p>
          <button 
            onClick={() => loadEventsForView(view, currentDate)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Show not connected state
  if (!isConnected) {
    return (
      <div className="h-full flex items-center justify-center bg-card">
        <div className="text-center max-w-md">
          <h3 className="text-lg font-semibold text-foreground mb-2">Connect Your Calendar</h3>
          <p className="text-muted-foreground mb-4">
            Connect your Google Calendar to view and manage your events
          </p>
          <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
            Connect Google Calendar
          </button>
        </div>
      </div>
    );
  }

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthDays = (() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }

    return days;
  })();

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="bg-gradient-to-r from-background to-muted/20 border-b border-border p-6">
        <div className="flex items-center justify-between">
          <button
            onClick={navigatePrevious}
            className="p-2.5 rounded-xl hover:bg-muted/50 transition-all hover:scale-105 border border-border/20"
            title="Previous month"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          
          <div className="text-center min-w-[200px]">
            <h2 className="text-2xl font-bold text-foreground mb-1">
              {formatMonthYear(currentDate)}
            </h2>
            <div className="text-sm text-muted-foreground">
              {visibleEvents.length} events this month
            </div>
          </div>
          
          <button
            onClick={navigateNext}
            className="p-2.5 rounded-xl hover:bg-muted/50 transition-all hover:scale-105 border border-border/20"
            title="Next month"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={navigateToday}
            className="px-4 py-2 text-sm font-medium text-foreground bg-muted hover:bg-muted/80 rounded-lg transition-colors"
          >
            Today
          </button>
          <div className="flex bg-muted rounded-lg p-1">
            {(['month', 'week', 'day'] as const).map((viewType) => (
              <button
                key={viewType}
                onClick={() => setView(viewType)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  view === viewType 
                    ? 'bg-background text-foreground shadow-sm' 
                    : 'text-muted-foreground hover:text-foreground'
                  }`}
              >
                {viewType.charAt(0).toUpperCase() + viewType.slice(1)}
              </button>
            ))}
          </div>
          <button 
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium text-sm flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Event
          </button>
        </div>
      </div>

      <div 
        className="flex-1 overflow-auto p-6"
        onWheel={handleWheel}
      >
        <div className="bg-background border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="grid grid-cols-7 gap-px bg-border">
            {weekDays.map((day) => (
              <div key={day} className="bg-muted/30 p-4 text-center border-b border-border">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{day}</div>
              </div>
            ))}
            
            {monthDays.map((day, index) => {
              const dayEvents = day ? getEventsForDay(day) : [];
              const isToday = day?.toDateString() === new Date().toDateString();
              const isCurrentMonth = day?.getMonth() === currentDate.getMonth();
                
              return (
                <div
                  key={index}
                  className={`bg-background min-h-[120px] border-r border-b border-border relative group ${
                    day ? 'hover:bg-muted/50 cursor-pointer transition-colors' : ''
                  } ${isToday ? 'bg-primary/10' : ''} ${!isCurrentMonth ? 'bg-muted/10' : ''}`}
                >
                  {day && (
                    <>
                      <div className={`text-sm font-semibold mb-2 p-2 ${
                        isToday ? 'text-primary bg-primary/20 rounded-full' : 'text-foreground'
                      }`}>
                        {day.getDate()}
                      </div>
                      <div className="space-y-1 px-2 pb-2">
                        {dayEvents.slice(0, 2).map((event) => (
                          <div
                            key={event.id}
                            onClick={() => setSelectedEvent(event)}
                            className="text-xs px-2 py-1 rounded-md cursor-pointer hover:scale-105 transition-all duration-200 font-medium shadow-sm truncate border border-border/20"
                            style={{ 
                              backgroundColor: event.color + '15', 
                              color: event.color,
                              borderColor: event.color + '40'
                            }}
                            title={event.title}
                          >
                            <div className="truncate">{event.title}</div>
                            <div className="text-xs opacity-80">
                              {event.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        ))}
                        {dayEvents.length > 2 && (
                          <div 
                            onClick={() => {
                              const dayEvent = dayEvents[2];
                              if (dayEvent) setSelectedEvent(dayEvent);
                            }}
                            className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors flex items-center gap-1"
                          >
                            <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full"></div>
                            +{dayEvents.length - 2} more
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-background border border-border rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Create New Event</h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
              
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Event Title</label>
                <input
                  type="text"
                  placeholder="Enter event title"
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Date</label>
                <input
                  type="date"
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Start Time</label>
                  <input
                    type="time"
                    className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">End Time</label>
                  <input
                    type="time"
                    className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Location (Optional)</label>
                <input
                  type="text"
                  placeholder="Add location"
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Description (Optional)</label>
                <textarea
                  placeholder="Add description"
                  rows={3}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                />
              </div>
            </div>
              
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="flex-1 px-4 py-2 bg-muted hover:bg-muted/80 rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setIsCreateModalOpen(false);
                }}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
              >
                Create Event
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedEvent && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-background border border-border rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: selectedEvent.color }}
                />
                {selectedEvent.title}
              </h3>
              <button
                onClick={() => setSelectedEvent(null)}
                className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
              
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" />
                {selectedEvent.start.toLocaleDateString()} at {selectedEvent.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {selectedEvent.end && ` - ${selectedEvent.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
              </div>
              
              {selectedEvent.location && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="w-4 h-4" />
                  {selectedEvent.location}
                </div>
              )}
              
              {selectedEvent.attendees && selectedEvent.attendees.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="w-4 h-4" />
                  {selectedEvent.attendees.join(', ')}
                </div>
              )}
              
              {selectedEvent.description && (
                <p className="text-sm text-foreground mt-3">{selectedEvent.description}</p>
              )}
            </div>
            
            <div className="flex gap-2 mt-6">
              <button 
                onClick={() => setSelectedEvent(null)}
                className="flex-1 px-4 py-2 bg-muted hover:bg-muted/80 rounded-lg transition-colors font-medium"
              >
                Close
              </button>
              <button className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium">
                Edit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default React.memo(CalendarView);