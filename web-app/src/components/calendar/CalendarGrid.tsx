import React, { useMemo, useCallback } from 'react';
import { type CalendarEvent } from '@/services/calendarService';

interface CalendarGridProps {
  currentDate: Date;
  view: 'month' | 'week' | 'day' | 'agenda';
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onDateClick: (date: Date) => void;
}

const EVENT_COLORS = [
  '#1a73e8', '#34a853', '#fbbc04', '#ea4335', '#9334e6',
  '#f29900', '#188038', '#c5221f', '#4285f4', '#0d652d'
];

function CalendarGrid({ 
  currentDate, 
  view, 
  events, 
  onEventClick, 
  onDateClick 
}: CalendarGridProps) {
  const getEventsForDate = useCallback((date: Date) => {
    return events.filter(event => {
      const eventStart = new Date(event.start.dateTime || event.start.date!);
      const eventEnd = new Date(event.end.dateTime || event.end.date!);
      const isAllDay = !!(event.start.date && event.end.date);

      if (isAllDay) {
        return eventStart.toDateString() === date.toDateString();
      }
      return date.toDateString() === eventStart.toDateString() ||
             date.toDateString() === eventEnd.toDateString() ||
             (date >= eventStart && date <= eventEnd);
    });
  }, [events]);

  const getEventStart = (event: CalendarEvent): Date => {
    return new Date(event.start.dateTime || event.start.date!);
  };

  const getEventEnd = (event: CalendarEvent): Date => {
    return new Date(event.end.dateTime || event.end.date!);
  };

  const getEventTitle = (event: CalendarEvent): string => {
    return event.summary || '';
  };

  const getEventColor = (event: CalendarEvent): string => {
    if (event.colorId) {
      return EVENT_COLORS[parseInt(event.colorId) % EVENT_COLORS.length];
    }
    return '#3b82f6';
  };

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthDays = useMemo(() => {
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
  }, [currentDate]);

  const getWeekDays = useCallback(() => {
    const startOfWeek = new Date(currentDate);
    const day = startOfWeek.getDay();
    startOfWeek.setDate(startOfWeek.getDate() - day);
    startOfWeek.setHours(0, 0, 0, 0);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      days.push(date);
    }
    return days;
  }, [currentDate]);

  const dayHours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

  const isToday = (date: Date) => date.toDateString() === new Date().toDateString();
  const isCurrentMonth = (date: Date) => date.getMonth() === currentDate.getMonth();
  const formatTime = (date: Date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const renderMonthView = () => (
    <div className="bg-background border border-border rounded-xl overflow-hidden">
      <div className="grid grid-cols-7 gap-px bg-border">
        {/* Week day headers */}
        {weekDays.map((day) => (
          <div key={day} className="bg-muted/30 p-2 text-center">
            <div className="text-xs font-semibold text-muted-foreground uppercase">
              {day}
            </div>
          </div>
        ))}
        
        {/* Calendar days */}
        {monthDays.map((day, index) => {
          const dayEvents = day ? getEventsForDate(day) : [];
          const today = day ? isToday(day) : false;
          const currentMonth = day ? isCurrentMonth(day) : false;

          return (
            <div
              key={index}
              className={`bg-background min-h-[100px] p-2 border-r border-b border-border relative ${
                day ? 'hover:bg-muted/50 cursor-pointer' : ''
              } ${today ? 'bg-primary/10' : ''} ${!currentMonth ? 'bg-muted/10' : ''}`}
              onClick={() => day && onDateClick(day)}
            >
              {day && (
                <>
                  <div className={`text-sm font-semibold mb-1 ${
                    today ? 'text-primary bg-primary/20 rounded-full w-6 h-6 flex items-center justify-center' : 'text-foreground'
                  }`}>
                    {day.getDate()}
                  </div>
                  <div className="space-y-1">
                    {dayEvents.slice(0, 2).map((event) => (
                      <div
                        key={event.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onEventClick(event);
                        }}
                        className="text-xs px-1 py-0.5 rounded truncate cursor-pointer hover:scale-105 transition-transform"
                        style={{ 
                          backgroundColor: getEventColor(event) + '20',
                          color: getEventColor(event),
                          border: `1px solid ${getEventColor(event)}40`
                        }}
                         title={getEventTitle(event)}
                        >
                          {getEventTitle(event)}
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <div 
                        className="text-xs text-muted-foreground cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
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
  );

  const renderWeekView = () => {
    const weekDays = getWeekDays();

    return (
      <div className="flex-1 overflow-auto">
        <div className="bg-background border border-border rounded-xl overflow-hidden min-h-full">
          <div className="grid grid-cols-8 gap-px bg-border">
            {/* Time column */}
            <div className="bg-muted/30 p-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase">Time</div>
            </div>
            
            {/* Week day headers */}
            {weekDays.map((day) => (
              <div key={day.toDateString()} className="bg-muted/30 p-2 text-center">
                <div className="text-xs font-semibold text-muted-foreground">
                  {day.toLocaleDateString([], { weekday: 'short' })}
                </div>
                <div className={`text-sm ${isToday(day) ? 'text-primary font-semibold' : 'text-foreground'}`}>
                  {day.getDate()}
                </div>
              </div>
            ))}
            
            {/* Hour rows */}
            {dayHours.map((hour) => (
              <React.Fragment key={hour}>
                <div className="bg-background border-b border-border p-2 text-right text-xs text-muted-foreground">
                  {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
                </div>
                {weekDays.map((day) => {
                  const dayEvents = getEventsForDate(day).filter(event => {
                    const eventStart = getEventStart(event);
                    return eventStart.getHours() === hour;
                  });

                  return (
                    <div
                      key={`${day.toDateString()}-${hour}`}
                      className="bg-background border-b border-border p-1 min-h-[60px] hover:bg-muted/30 cursor-pointer"
                      onClick={() => onDateClick(day)}
                    >
                      {dayEvents.map((event) => (
                        <div
                          key={event.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onEventClick(event);
                          }}
                          className="text-xs px-1 py-0.5 rounded truncate mb-1"
                          style={{ 
                            backgroundColor: getEventColor(event) + '20',
                            color: getEventColor(event),
                            border: `1px solid ${getEventColor(event)}40`
                          }}
                          title={getEventTitle(event)}
                        >
                          {getEventTitle(event)}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderDayView = () => {
    const dayEvents = getEventsForDate(currentDate);

    return (
      <div className="flex-1 overflow-auto">
        <div className="bg-background border border-border rounded-xl overflow-hidden min-h-full">
          <div className="grid grid-cols-2 gap-px bg-border">
            {/* Time column */}
            <div className="bg-muted/30 p-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                {currentDate.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
              </div>
            </div>
            
            <div className="bg-muted/30 p-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Events</div>
            </div>
            
            {/* Hour rows with events */}
            {dayHours.map((hour) => {
              const hourEvents = dayEvents.filter(event => {
                return getEventStart(event).getHours() === hour;
              });

              return (
                <React.Fragment key={hour}>
                  <div className="bg-background border-b border-border p-2 text-right text-xs text-muted-foreground">
                    {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
                  </div>
                  <div className="bg-background border-b border-border p-1 min-h-[60px]">
                    {hourEvents.map((event) => (
                      <div
                        key={event.id}
                        onClick={() => onEventClick(event)}
                        className="text-sm px-2 py-1 rounded mb-1 cursor-pointer hover:scale-105 transition-transform"
                        style={{ 
                          backgroundColor: getEventColor(event) + '20',
                          color: getEventColor(event),
                          border: `1px solid ${getEventColor(event)}40`
                        }}
                        title={getEventTitle(event)}
                      >
                        <div className="font-semibold">{getEventTitle(event)}</div>
                        {event.location && (
                          <div className="text-xs opacity-80">{event.location}</div>
                        )}
                        <div className="text-xs opacity-80">
                          {formatTime(getEventStart(event))} - {formatTime(getEventEnd(event))}
                        </div>
                      </div>
                    ))}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      {view === 'month' && renderMonthView()}
      {view === 'week' && renderWeekView()}
      {view === 'day' && renderDayView()}
    </div>
  );
}

export default React.memo(CalendarGrid);