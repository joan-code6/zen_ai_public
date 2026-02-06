import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import DeviceService, { type Device } from '@/services/deviceService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, 
  Plus, 
  Settings, 
  Wifi, 
  WifiOff, 
  Battery, 
  BatteryCharging,
  Microchip,
  Clock,
  Activity,
  Download,
  RefreshCw,
  X,
  AlertTriangle
} from 'lucide-react';

export default function DevicesView() {
  const { user } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<'list' | 'register' | 'details'>('list');
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [formData, setFormData] = useState({
    hardwareId: '',
    firmwareVersion: '1.0.0'
  });
  const [registering, setRegistering] = useState(false);
  const [registration, setRegistration] = useState<any>(null);

  useEffect(() => {
    if (user) {
      loadDevices();
    }
  }, [user]);

  const loadDevices = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const userDevices = await DeviceService.getUserDevices(user.uid);
      setDevices(userDevices);
    } catch (error) {
      console.error('Failed to load devices:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterDevice = async () => {
    if (!formData.hardwareId.trim()) return;

    try {
      setRegistering(true);
      const result = await DeviceService.registerDevice(formData);
      setRegistration(result);
      setShowRegisterForm(false);
      setFormData({ hardwareId: '', firmwareVersion: '1.0.0' });
      loadDevices();
    } catch (error) {
      console.error('Failed to register device:', error);
    } finally {
      setRegistering(false);
    }
  };

  const handleDeviceClick = (device: Device) => {
    setSelectedDevice(device);
    setCurrentView('details');
  };

  const handleRemoveDevice = async (device: Device) => {
    if (!user || !confirm(`Are you sure you want to remove device "${DeviceService.formatDeviceId(device.deviceId)}"?`)) return;

    try {
      await DeviceService.removeDevice(device.deviceId, user.uid);
      await loadDevices();
      if (selectedDevice?.deviceId === device.deviceId) {
        setSelectedDevice(null);
        setCurrentView('list');
      }
    } catch (error) {
      console.error('Failed to remove device:', error);
    }
  };

  const sendCommand = async (device: Device, command: { type: string; payload?: any }) => {
    if (!user) return;

    try {
      await DeviceService.sendCommand(device.deviceId, user.uid, command);
      // Show success message
      console.log('Command sent to device:', command);
    } catch (error) {
      console.error('Failed to send command:', error);
    }
  };

  const getBatteryIcon = (device: Device): React.ReactElement => {
    // Always return a rendered icon element (not the component type)
    if (!device.batteryMv) return <Battery className="w-4 h-4 text-muted-foreground" />;

    const batteryLevel = DeviceService.getBatteryLevel(device);

    if (batteryLevel > 80) return <Battery className="w-4 h-4 text-green-600" />;
    if (batteryLevel > 20) return <Battery className="w-4 h-4 text-yellow-600" />;
    return <Battery className="w-4 h-4 text-red-600" />;
  };

  const getBatteryColor = (device: Device) => {
    if (!device.batteryMv) return 'text-muted-foreground';
    
    const batteryLevel = DeviceService.getBatteryLevel(device);
    
    if (batteryLevel > 80) return 'text-green-600';
    if (batteryLevel > 20) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getSignalColor = (device: Device) => {
    const strength = DeviceService.getSignalStrength(device.wifiRssi);
    
    switch (strength) {
      case 'excellent': return 'text-green-600';
      case 'good': return 'text-blue-600';
      case 'fair': return 'text-yellow-600';
      case 'poor': return 'text-red-600';
      default: return 'text-muted-foreground';
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading devices...</p>
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
              <Microchip className="w-6 h-6 text-primary" />
              <h2 className="text-2xl font-bold text-foreground">Devices</h2>
            </div>
            
            <Button
              onClick={() => setShowRegisterForm(true)}
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Device
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              variant={currentView === 'list' ? 'secondary' : 'ghost'}
              onClick={() => setCurrentView('list')}
              className="flex-1"
            >
              My Devices
            </Button>
            <Button
              variant={currentView === 'register' ? 'secondary' : 'ghost'}
              onClick={() => setCurrentView('register')}
              className="flex-1"
            >
              Register New
            </Button>
          </div>
        </div>

        {/* Device Stats */}
        <div className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Statistics</h3>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total Devices</span>
              <Badge variant="secondary">{devices.length}</Badge>
            </div>
            
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Online</span>
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                {devices.filter(d => DeviceService.isDeviceOnline(d)).length}
              </Badge>
            </div>
            
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Offline</span>
              <Badge variant="secondary" className="bg-red-100 text-red-800">
                {devices.filter(d => !DeviceService.isDeviceOnline(d)).length}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {currentView === 'list' && (
          <div className="p-6">
            <div className="max-w-6xl mx-auto">
              {devices.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                    <Microchip className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">No devices yet</h3>
                  <p className="text-muted-foreground mb-6">
                    Register your first device to start monitoring and controlling it remotely.
                  </p>
                  <Button
                    onClick={() => setShowRegisterForm(true)}
                    size="lg"
                    className="gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Register Device
                  </Button>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {devices.map((device) => (
                    <Card 
                      key={device.deviceId}
                      className="p-6 hover:shadow-lg transition-all cursor-pointer"
                      onClick={() => handleDeviceClick(device)}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            DeviceService.isDeviceOnline(device) ? 'bg-green-100' : 'bg-gray-100'
                          }`}>
                            {DeviceService.isDeviceOnline(device) ? (
                              <Wifi className="w-5 h-5 text-green-600" />
                            ) : (
                              <WifiOff className="w-5 h-5 text-gray-600" />
                            )}
                          </div>
                          
                          <div>
                            <h3 className="font-semibold text-foreground">
                              {DeviceService.formatDeviceId(device.deviceId)}
                            </h3>
                            <div className="text-xs text-muted-foreground">
                              {device.hardwareId}
                            </div>
                          </div>
                        </div>
                        
                        <Badge
                          variant={DeviceService.isDeviceOnline(device) ? 'secondary' : 'outline'}
                          className="text-xs"
                        >
                          {DeviceService.isDeviceOnline(device) ? 'Online' : 'Offline'}
                        </Badge>
                      </div>

                      <div className="space-y-3">
                        {/* Battery */}
                        {device.batteryMv && (
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              {getBatteryIcon(device)}
                              <span className="text-muted-foreground">Battery</span>
                            </div>
                            <span className={`font-medium ${getBatteryColor(device)}`}>
                              {DeviceService.getBatteryLevel(device)}%
                            </span>
                          </div>
                        )}

                        {/* WiFi */}
                        {device.wifiSsid && (
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <Wifi className="w-4 h-4 text-muted-foreground" />
                              <span className="text-muted-foreground">Network</span>
                            </div>
                            <div className="text-right">
                              <div className="font-medium text-foreground">{device.wifiSsid}</div>
                              {device.wifiRssi && (
                                <div className={`text-xs ${getSignalColor(device)}`}>
                                  {DeviceService.getSignalStrength(device.wifiRssi)} signal
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Firmware */}
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <Settings className="w-4 h-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Firmware</span>
                          </div>
                          <span className="font-medium text-foreground">
                            {device.firmwareVersion}
                          </span>
                        </div>

                        {/* Last Seen */}
                        {device.lastSeenAt && (
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-muted-foreground" />
                              <span className="text-muted-foreground">Last Seen</span>
                            </div>
                            <span className="font-medium text-foreground">
                              {new Date(device.lastSeenAt).toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Quick Actions */}
                      <div className="flex gap-2 pt-3 border-t border-border">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeviceClick(device);
                          }}
                        >
                          <Settings className="w-3 h-3 mr-1" />
                          Details
                        </Button>
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            sendCommand(device, { type: 'reboot' });
                          }}
                        >
                          <RefreshCw className="w-3 h-3 mr-1" />
                          Reboot
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {currentView === 'register' && (
          <div className="p-6">
            <div className="max-w-2xl mx-auto">
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">Register New Device</h3>
                
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="hardwareId">Hardware ID</Label>
                    <Input
                      id="hardwareId"
                      value={formData.hardwareId}
                      onChange={(e) => setFormData(prev => ({ ...prev, hardwareId: e.target.value }))}
                      placeholder="Enter device hardware ID"
                      required
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="firmwareVersion">Firmware Version</Label>
                    <Input
                      id="firmwareVersion"
                      value={formData.firmwareVersion}
                      onChange={(e) => setFormData(prev => ({ ...prev, firmwareVersion: e.target.value }))}
                      placeholder="Enter firmware version"
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={handleRegisterDevice}
                      disabled={registering || !formData.hardwareId.trim()}
                      className="flex-1"
                    >
                      {registering ? 'Registering...' : 'Register Device'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setCurrentView('list')}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </Card>

              {/* Registration Success */}
              {registration && (
                <Card className="p-6 mt-4 bg-green-50/50 border-green-200">
                  <h3 className="text-lg font-semibold text-green-800 mb-4">Registration Successful!</h3>
                  
                  <div className="space-y-3">
                    <div>
                      <strong>Device ID:</strong> {registration.deviceId}
                    </div>
                    <div>
                      <strong>Pairing Token:</strong> {registration.pairingToken}
                    </div>
                    <div>
                      <strong>Expires:</strong> {new Date(registration.expiresAt).toLocaleString()}
                    </div>
                  </div>

                  <p className="text-sm text-green-700 mt-4">
                    Use the pairing token on your device to complete the setup process.
                  </p>
                </Card>
              )}
            </div>
          </div>
        )}

        {currentView === 'details' && selectedDevice && (
          <DeviceDetails
            device={selectedDevice}
            onBack={() => setCurrentView('list')}
            onRemove={handleRemoveDevice}
          />
        )}
      </div>

      {/* Registration Modal */}
      {showRegisterForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <Card className="max-w-md w-full m-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Register Device</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowRegisterForm(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="modalHardwareId">Hardware ID</Label>
                <Input
                  id="modalHardwareId"
                  value={formData.hardwareId}
                  onChange={(e) => setFormData(prev => ({ ...prev, hardwareId: e.target.value }))}
                  placeholder="Enter device hardware ID"
                  autoFocus
                />
              </div>
              
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setShowRegisterForm(false);
                    setCurrentView('register');
                  }}
                  disabled={!formData.hardwareId.trim()}
                  className="flex-1"
                >
                  Continue
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowRegisterForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function DeviceDetails({ device, onBack, onRemove }: {
  device: Device;
  onBack: () => void;
  onRemove: (device: Device) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  const loadLogs = async () => {
    if (!device.ownerUid) return;

    try {
      setLoading(true);
      const deviceLogs = await DeviceService.getDeviceLogs(device.deviceId, device.ownerUid, 100);
      setLogs(deviceLogs);
      setShowLogs(true);
    } catch (error) {
      console.error('Failed to load device logs:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <h2 className="text-xl font-semibold text-foreground">
          {DeviceService.formatDeviceId(device.deviceId)}
        </h2>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Device Info */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Device Information</h3>
          
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Device ID</Label>
              <div className="font-mono text-sm bg-muted/30 p-2 rounded">
                {device.deviceId}
              </div>
            </div>
            
            <div>
              <Label className="text-sm font-medium">Hardware ID</Label>
              <div className="font-mono text-sm bg-muted/30 p-2 rounded">
                {device.hardwareId}
              </div>
            </div>
            
            <div>
              <Label className="text-sm font-medium">Firmware Version</Label>
              <div className="font-mono text-sm bg-muted/30 p-2 rounded">
                {device.firmwareVersion}
              </div>
            </div>
            
            <div>
              <Label className="text-sm font-medium">Status</Label>
              <div className="flex items-center gap-2">
                <Badge
                  variant={DeviceService.isDeviceOnline(device) ? 'secondary' : 'outline'}
                  className={DeviceService.isDeviceOnline(device) ? 'bg-green-100 text-green-800' : ''}
                >
                  {DeviceService.isDeviceOnline(device) ? 'Online' : 'Offline'}
                </Badge>
                
                <span className="text-sm text-muted-foreground">
                  Last seen: {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : 'Never'}
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* Device Status */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Current Status</h3>
          
          <div className="space-y-4">
            {device.batteryMv && (
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Battery Level</Label>
                <div className="flex items-center gap-2">
                  <Battery className="w-4 h-4" />
                  <span className="font-medium">
                    {DeviceService.getBatteryLevel(device)}%
                  </span>
                </div>
              </div>
            )}

            {device.wifiSsid && (
              <div>
                <Label className="text-sm font-medium">Network</Label>
                <div className="space-y-2">
                  <div className="font-medium">{device.wifiSsid}</div>
                  {device.wifiRssi && (
                    <div className="text-sm text-muted-foreground">
                      Signal: {DeviceService.getSignalStrength(device.wifiRssi)} ({device.wifiRssi} dBm)
                    </div>
                  )}
                </div>
              </div>
            )}

            <div>
              <Label className="text-sm font-medium">Owner</Label>
              <div className="font-medium">{device.ownerUid || 'Unclaimed'}</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Actions */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Device Actions</h3>
        
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={() => {/* Reboot */}}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Reboot
            </Button>
            
            <Button variant="outline" onClick={loadLogs} disabled={loading}>
              <Activity className="w-4 h-4 mr-2" />
              {loading ? 'Loading...' : 'View Logs'}
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={() => {/* Update firmware */}}>
              <Download className="w-4 h-4 mr-2" />
              Update Firmware
            </Button>
            
            <Button
              variant="outline"
              onClick={() => onRemove(device)}
              className="text-destructive hover:text-destructive"
            >
              <X className="w-4 h-4 mr-2" />
              Remove Device
            </Button>
          </div>
        </div>
      </Card>

      {/* Device Logs */}
      {showLogs && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-foreground">Device Logs</h3>
            <Button variant="ghost" size="sm" onClick={() => setShowLogs(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          
          <div className="space-y-2 max-h-64 overflow-auto">
            {logs.map((log, index) => (
              <div key={index} className="text-sm font-mono bg-muted/30 p-2 rounded">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">{log.timestamp}</span>
                  <Badge variant="outline" className="text-xs">
                    {log.level}
                  </Badge>
                </div>
                <div>{log.message}</div>
              </div>
            ))}
            
            {logs.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No logs available
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}