import { useState } from 'react';
import { type CalendarEvent } from '@/services/calendarService';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, 
  Edit3, 
  Calendar, 
  Clock, 
  MapPin, 
  Users,
  Trash2,
  ExternalLink
} from 'lucide-react';

interface EventDetailProps {
  event: CalendarEvent;
  onEdit: () => void;
  onDelete: () => void;
  onBack: () => void;
}

export default function EventDetail({ event, onEdit, onDelete, onBack }: EventDetailProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const formatDate = (dateString: string, isAllDay: boolean) => {
    if (isAllDay) {
      return new Date(dateString).toLocaleDateString([], {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } else {
      return new Date(dateString).toLocaleString([], {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const isAllDay = !!event.start.date;
  const eventColor = event.colorId ? 
    ['#1a73e8', '#34a853', '#fbbc04', '#ea4335', '#9334e6', '#f29900', '#188038', '#c5221f'][parseInt(event.colorId) % 8] :
    '#3b82f6';

  const isPast = () => {
    const endTime = new Date(event.end.dateTime || event.end.date!);
    return endTime < new Date();
  };

  const isOngoing = () => {
    const now = new Date();
    const startTime = new Date(event.start.dateTime || event.start.date!);
    const endTime = new Date(event.end.dateTime || event.end.date!);
    return now >= startTime && now <= endTime;
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this event?')) return;

    setIsDeleting(true);
    onDelete();
  };

  const getEventStatus = () => {
    if (isOngoing()) {
      return { text: 'Now', color: 'bg-green-100 text-green-800' };
    } else if (isPast()) {
      return { text: 'Past', color: 'bg-gray-100 text-gray-800' };
    } else {
      return { text: 'Upcoming', color: 'bg-blue-100 text-blue-800' };
    }
  };

  const status = getEventStatus();

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card/50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <h2 className="text-lg font-semibold text-foreground">
              Event Details
            </h2>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onEdit}
            >
              <Edit3 className="w-4 h-4 mr-2" />
              Edit
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              disabled={isDeleting}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </div>
      </div>

      {/* Event Details */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Event Header */}
          <Card className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div 
                  className="w-4 h-4 rounded-full border-2"
                  style={{ backgroundColor: eventColor, borderColor: eventColor }}
                />
                <h1 className="text-2xl font-bold text-foreground">
                  {event.summary}
                </h1>
              </div>
              
              <Badge className={status.color}>
                {status.text}
              </Badge>
            </div>

            {event.description && (
              <p className="text-muted-foreground leading-relaxed">
                {event.description}
              </p>
            )}
          </Card>

          {/* Date and Time */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Date & Time
            </h3>
            
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="font-medium text-foreground min-w-[80px]">Start:</div>
                <div className="text-muted-foreground">
                  {formatDate(event.start.dateTime || event.start.date!, isAllDay)}
                  {!isAllDay && (
                    <span className="ml-2">
                      at {formatTime(event.start.dateTime!)}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="font-medium text-foreground min-w-[80px]">End:</div>
                <div className="text-muted-foreground">
                  {formatDate(event.end.dateTime || event.end.date!, isAllDay)}
                  {!isAllDay && (
                    <span className="ml-2">
                      at {formatTime(event.end.dateTime!)}
                    </span>
                  )}
                </div>
              </div>

              {!isAllDay && (
                <div className="flex items-center gap-3">
                  <div className="font-medium text-foreground min-w-[80px]">Duration:</div>
                  <div className="text-muted-foreground">
                    {(() => {
                      const start = new Date(event.start.dateTime!);
                      const end = new Date(event.end.dateTime!);
                      const duration = end.getTime() - start.getTime();
                      const hours = Math.floor(duration / (1000 * 60 * 60));
                      const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
                      
                      if (hours > 0) {
                        return `${hours}h ${minutes > 0 ? minutes + 'm' : ''}`;
                      } else {
                        return `${minutes}m`;
                      }
                    })()}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Location */}
          {event.location && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Location
              </h3>
              
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-foreground">{event.location}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs mt-2"
                    onClick={() => {
                      window.open(`https://maps.google.com/?q=${encodeURIComponent(event.location!)}`, '_blank');
                    }}
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    View on Maps
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Attendees */}
          {event.attendees && event.attendees.length > 0 && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <Users className="w-5 h-5" />
                Attendees ({event.attendees.length})
              </h3>
              
              <div className="space-y-3">
                {event.attendees.map((attendee, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center">
                        <span className="text-xs font-medium">
                          {(attendee.displayName || attendee.email).charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div className="font-medium text-foreground">
                          {attendee.displayName || attendee.email}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {attendee.email}
                        </div>
                      </div>
                    </div>
                    
                    <Badge
                      variant={
                        attendee.responseStatus === 'accepted' ? 'secondary' :
                        attendee.responseStatus === 'declined' ? 'destructive' :
                        attendee.responseStatus === 'tentative' ? 'outline' : 'secondary'
                      }
                      className="text-xs"
                    >
                      {attendee.responseStatus || 'needsAction'}
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Additional Details */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Additional Details</h3>
            
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Event ID:</span>
                <span className="font-mono text-foreground">{event.id}</span>
              </div>
              
              {event.visibility && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Visibility:</span>
                  <span className="capitalize text-foreground">{event.visibility}</span>
                </div>
              )}
              
              {event.transparency && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Show as:</span>
                  <span className="capitalize text-foreground">
                    {event.transparency === 'transparent' ? 'Free' : 'Busy'}
                  </span>
                </div>
              )}
              
              {event.recurrence && event.recurrence.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Recurring:</span>
                  <span className="text-foreground">Yes</span>
                </div>
              )}
            </div>
          </Card>

          {/* Actions */}
          <Card className="p-6">
            <div className="flex gap-3">
              <Button onClick={onEdit} className="flex-1">
                <Edit3 className="w-4 h-4 mr-2" />
                Edit Event
              </Button>
              
              <Button
                variant="outline"
                onClick={handleDelete}
                disabled={isDeleting}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {isDeleting ? 'Deleting...' : 'Delete Event'}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}