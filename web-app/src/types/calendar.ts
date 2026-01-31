export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  type: 'meeting' | 'task' | 'reminder' | 'personal';
  color: string;
  location?: string;
  attendees?: string[];
  isAllDay?: boolean;
}

export interface CalendarView {
  type: 'month' | 'week' | 'day';
  date: Date;
}