import { useState } from 'react';
import CalendarService from '@/services/calendarService';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Link, Link2Off, RefreshCw, Settings } from 'lucide-react';

interface CalendarSettingsProps {
  connection: any;
  onBack: () => void;
  onConnectionChanged: () => void;
}

export default function CalendarSettings({ connection, onBack, onConnectionChanged }: CalendarSettingsProps) {
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect your Google Calendar? This will remove access to your calendar events.')) return;

    try {
      setDisconnecting(true);
      await CalendarService.deleteGoogleConnection();
      onConnectionChanged();
      onBack();
    } catch (error) {
      console.error('Failed to disconnect calendar:', error);
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSyncNow = async () => {
    try {
      setSyncing(true);
      // Force a sync by reloading events
      onConnectionChanged();
    } catch (error) {
      console.error('Failed to sync calendar:', error);
    } finally {
      setSyncing(false);
    }
  };

  const getPermissions = () => {
    if (!connection?.scopes) return [];

    const scopeDescriptions: Record<string, string> = {
      'https://www.googleapis.com/auth/calendar.events': 'Read and write events',
      'https://www.googleapis.com/auth/calendar.readonly': 'Read-only access',
      'https://www.googleapis.com/auth/calendar': 'Full calendar access',
    };

    return connection.scopes.map((scope: string) => 
      scopeDescriptions[scope] || scope
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card/50 p-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h2 className="text-lg font-semibold text-foreground">Calendar Settings</h2>
        </div>
      </div>

      {/* Settings Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Connection Status */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              Google Calendar Connection
              {connection?.connected && (
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              )}
            </h3>
            
            {connection?.connected ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-green-50/50 border border-green-200 rounded-lg">
                  <div>
                    <div className="font-medium text-foreground">Connected</div>
                    <div className="text-sm text-muted-foreground">
                      Successfully connected to Google Calendar
                    </div>
                    {connection.expiresAt && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Token expires: {new Date(connection.expiresAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                  
                  {connection.hasRefreshToken && (
                    <Badge variant="outline" className="text-xs">
                      Auto-refresh enabled
                    </Badge>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-foreground">Permissions Granted</div>
                      <div className="text-sm text-muted-foreground">
                        {connection.scopes?.length || 0} permissions
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        // Show permissions details
                      }}
                    >
                      View Details
                    </Button>
                  </div>

                  {connection.scopes && connection.scopes.length > 0 && (
                    <div className="bg-muted/30 rounded-lg p-3">
                      <ul className="text-sm text-muted-foreground space-y-1">
                        {getPermissions().map((permission, index) => (
                          <li key={index} className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                            {permission}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <Settings className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground">Not connected to Google Calendar</p>
              </div>
            )}
          </Card>

          {/* Actions */}
          {connection?.connected && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Actions</h3>
              
              <div className="space-y-3">
                <Button
                  variant="outline"
                  onClick={handleSyncNow}
                  disabled={syncing}
                  className="w-full justify-start gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Syncing...' : 'Sync Now'}
                </Button>

                <div className="pt-4 border-t border-border">
                  <h4 className="text-sm font-semibold text-foreground mb-3 text-destructive">Danger Zone</h4>
                  
                  <Button
                    variant="outline"
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="w-full justify-start gap-2 text-destructive hover:text-destructive border-destructive"
                  >
                    <Link2Off className="w-4 h-4" />
                    {disconnecting ? 'Disconnecting...' : 'Disconnect Google Calendar'}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Information */}
          <Card className="p-6 bg-muted/30">
            <h3 className="text-lg font-semibold text-foreground mb-4">Calendar Information</h3>
            
            <div className="space-y-4 text-sm">
              <div>
                <h4 className="font-medium text-foreground mb-2">What gets synced?</h4>
                <ul className="text-muted-foreground space-y-1 ml-4">
                  <li>• All events from your primary Google Calendar</li>
                  <li>• Event titles, descriptions, and locations</li>
                  <li>• Event times and dates (including all-day events)</li>
                  <li>• Event attendees and RSVP status</li>
                  <li>• Recurring events and exceptions</li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-medium text-foreground mb-2">Privacy & Security</h4>
                <ul className="text-muted-foreground space-y-1 ml-4">
                  <li>• We use OAuth 2.0 for secure authentication</li>
                  <li>• Your password is never stored or transmitted</li>
                  <li>• Access can be revoked at any time</li>
                  <li>• We only request permissions needed for calendar features</li>
                  <li>• All data is transmitted over HTTPS</li>
                </ul>
              </div>

              <div>
                <h4 className="font-medium text-foreground mb-2">Features</h4>
                <ul className="text-muted-foreground space-y-1 ml-4">
                  <li>• Real-time calendar synchronization</li>
                  <li>• Create, edit, and delete events</li>
                  <li>• Multiple calendar views (month, week, day)</li>
                  <li>• Event search and filtering</li>
                  <li>• Automatic timezone handling</li>
                </ul>
              </div>
            </div>
          </Card>

          {/* Troubleshooting */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Troubleshooting</h3>
            
            <div className="space-y-4 text-sm">
              <div>
                <h4 className="font-medium text-foreground mb-2">Events not showing up?</h4>
                <ul className="text-muted-foreground space-y-1 ml-4">
                  <li>• Try clicking "Sync Now" above</li>
                  <li>• Check if events are in your primary calendar</li>
                  <li>• Verify calendar permissions in Google Settings</li>
                  <li>• Try disconnecting and reconnecting</li>
                </ul>
              </div>

              <div>
                <h4 className="font-medium text-foreground mb-2">Can't create events?</h4>
                <ul className="text-muted-foreground space-y-1 ml-4">
                  <li>• Ensure you have write permissions for the calendar</li>
                  <li>• Check if Google Calendar has sufficient quota</li>
                  <li>• Verify your account is in good standing</li>
                </ul>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}