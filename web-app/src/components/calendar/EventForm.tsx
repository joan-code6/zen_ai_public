import { useState, useEffect } from 'react';
import { type CalendarEvent } from '@/services/calendarService';
import CalendarService from '@/services/calendarService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, 
  Save, 
  Calendar, 
  Clock, 
  MapPin,
  Users,
  Trash2
} from 'lucide-react';

interface EventFormProps {
  event: CalendarEvent | null;
  currentDate: Date;
  onSaved: (event: CalendarEvent) => void;
  onCancel: () => void;
}

export default function EventForm({ event, currentDate, onSaved, onCancel }: EventFormProps) {
  const [title, setTitle] = useState(event?.summary || '');
  const [description, setDescription] = useState(event?.description || '');
  const [startDate, setStartDate] = useState(
    event?.start?.dateTime?.split('T')[0] || 
    event?.start?.date || 
    currentDate.toISOString().split('T')[0]
  );
  const [startTime, setStartTime] = useState(
    event?.start?.dateTime?.split('T')[1]?.substring(0, 5) || '09:00'
  );
  const [endDate, setEndDate] = useState(
    event?.end?.dateTime?.split('T')[0] || 
    event?.end?.date || 
    currentDate.toISOString().split('T')[0]
  );
  const [endTime, setEndTime] = useState(
    event?.end?.dateTime?.split('T')[1]?.substring(0, 5) || '10:00'
  );
  const [location, setLocation] = useState(event?.location || '');
  const [isAllDay, setIsAllDay] = useState(!!event?.start?.date);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (event) {
      setTitle(event.summary || '');
      setDescription(event.description || '');
      setLocation(event.location || '');
      setIsAllDay(!!event.start?.date);
      
      if (event.start?.dateTime) {
        setStartDate(event.start.dateTime.split('T')[0]);
        setStartTime(event.start.dateTime.split('T')[1]?.substring(0, 5));
      } else if (event.start?.date) {
        setStartDate(event.start.date);
      }
      
      if (event.end?.dateTime) {
        setEndDate(event.end.dateTime.split('T')[0]);
        setEndTime(event.end.dateTime.split('T')[1]?.substring(0, 5));
      } else if (event.end?.date) {
        setEndDate(event.end.date);
      }
    }
  }, [event]);

  const handleSave = async () => {
    if (!title.trim()) return;

    try {
      setSaving(true);
      
      const eventData: CalendarEvent = {
        summary: title.trim(),
        description: description.trim(),
        location: location.trim(),
        start: isAllDay 
          ? { date: startDate }
          : { dateTime: `${startDate}T${startTime}:00` },
        end: isAllDay 
          ? { date: endDate }
          : { dateTime: `${endDate}T${endTime}:00` },
      };

      if (event?.id) {
        // Update existing event
        await CalendarService.patchEvent(event.id, eventData);
      } else {
        // Create new event
        await CalendarService.createEvent({ event: eventData });
      }
      
      onSaved(eventData);
    } catch (error) {
      console.error('Failed to save event:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!event?.id) return;

    if (!confirm('Are you sure you want to delete this event?')) return;

    try {
      setSaving(true);
      await CalendarService.deleteEvent(event.id);
      onSaved(event); // This will trigger a refresh
    } catch (error) {
      console.error('Failed to delete event:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card/50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <h2 className="text-lg font-semibold text-foreground">
              {event ? 'Edit Event' : 'New Event'}
            </h2>
          </div>
          
          <div className="flex items-center gap-2">
            {event?.id && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={saving}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            )}
            
            <Button
              onClick={handleSave}
              disabled={saving || !title.trim()}
              className="gap-2"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Title */}
          <div>
            <Label htmlFor="title">Event Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter event title"
              className="text-lg"
            />
          </div>

          {/* All Day Toggle */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="allDay"
              checked={isAllDay}
              onChange={(e) => setIsAllDay(e.target.checked)}
              className="w-4 h-4"
            />
            <Label htmlFor="allDay" className="text-sm font-medium">
              All day event
            </Label>
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              {!isAllDay && (
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="mt-2"
                />
              )}
            </div>

            <div>
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
              />
              {!isAllDay && (
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  min={startDate === endDate ? startTime : undefined}
                  className="mt-2"
                />
              )}
            </div>
          </div>

          {/* Location */}
          <div>
            <Label htmlFor="location">Location</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Add location"
                className="pl-10"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add description"
              rows={6}
              className="resize-none"
            />
          </div>

          {/* Quick Suggestions */}
          <Card className="p-4 bg-muted/30">
            <h3 className="text-sm font-semibold text-foreground mb-3">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStartDate(currentDate.toISOString().split('T')[0]);
                  setEndDate(currentDate.toISOString().split('T')[0]);
                  setIsAllDay(true);
                }}
              >
                <Calendar className="w-3 h-3 mr-2" />
                All Day Today
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const tomorrow = new Date(currentDate);
                  tomorrow.setDate(tomorrow.getDate() + 1);
                  setStartDate(tomorrow.toISOString().split('T')[0]);
                  setEndDate(tomorrow.toISOString().split('T')[0]);
                  setIsAllDay(true);
                }}
              >
                <Clock className="w-3 h-3 mr-2" />
                All Day Tomorrow
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStartTime('09:00');
                  setEndTime('10:00');
                  setIsAllDay(false);
                }}
              >
                <Clock className="w-3 h-3 mr-2" />
                1 Hour Meeting
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStartTime('14:00');
                  setEndTime('15:00');
                  setIsAllDay(false);
                }}
              >
                <Clock className="w-3 h-3 mr-2" />
                Afternoon Meeting
              </Button>
            </div>
          </Card>

          {/* Event Tips */}
          <Card className="p-4 bg-blue-50/50 border-blue-200">
            <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Calendar Tips
            </h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Events sync with your Google Calendar account</li>
              <li>• Set reminders by adding text like "remind me" in the description</li>
              <li>• Invite attendees by adding their email addresses in the description</li>
              <li>• Use recurring events for regularly scheduled meetings</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}