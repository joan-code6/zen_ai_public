import BaseApiService from './api';

export interface Device {
  deviceId: string;
  hardwareId: string;
  firmwareVersion: string;
  ownerUid?: string;
  status?: 'online' | 'offline';
  lastSeenAt?: string;
  wifiSsid?: string;
  wifiRssi?: number;
  batteryMv?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface DeviceRegistration {
  deviceId: string;
  pairingToken: string;
  expiresAt: string;
}

export interface DeviceRegistrationRequest {
  hardwareId: string;
  firmwareVersion: string;
}

export interface DeviceClaimRequest {
  pairingToken: string;
}

export interface DeviceHeartbeatRequest {
  wifiSsid?: string;
  wifiRssi?: number;
  batteryMv?: number;
  firmwareVersion?: string;
}

class DeviceService {
  private static instance: DeviceService;

  static getInstance(): DeviceService {
    if (!DeviceService.instance) {
      DeviceService.instance = new DeviceService();
    }
    return DeviceService.instance;
  }

  async registerDevice(request: DeviceRegistrationRequest): Promise<DeviceRegistration> {
    const response = await BaseApiService.post<DeviceRegistration>('/devices/register', request);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async claimDevice(token: string, deviceId: string): Promise<{ deviceId: string; status: string }> {
    const response = await BaseApiService.post<{ deviceId: string; status: string }>('/devices/claim', {
      pairingToken: token
    }, {
      headers: {
        'Authorization': `Bearer ${deviceId}`, // This would normally be the user's auth token
      }
    });
    
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async sendHeartbeat(deviceId: string, secret: string, heartbeat: DeviceHeartbeatRequest): Promise<{ status: string }> {
    const response = await BaseApiService.post<{ status: string }>('/devices/heartbeat', heartbeat, {
      headers: {
        'X-Device-Id': deviceId,
        'X-Device-Secret': secret,
      }
    });
    
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async getDeviceState(deviceId: string, secret: string): Promise<Device> {
    const response = await BaseApiService.get<Device>('/devices/state', {
      headers: {
        'X-Device-Id': deviceId,
        'X-Device-Secret': secret,
      }
    });
    
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async getUserDevices(uid: string): Promise<Device[]> {
    const response = await BaseApiService.get<{ devices: Device[] }>(`/devices?uid=${encodeURIComponent(uid)}`);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data?.devices || [];
  }

  async getDeviceDetails(deviceId: string, uid: string): Promise<Device> {
    const response = await BaseApiService.get<Device>(`/devices/${deviceId}?uid=${encodeURIComponent(uid)}`);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async updateDevice(deviceId: string, uid: string, updates: Partial<Device>): Promise<Device> {
    const response = await BaseApiService.patch<Device>(`/devices/${deviceId}`, {
      uid,
      ...updates
    });
    
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async removeDevice(deviceId: string, uid: string): Promise<void> {
    const response = await BaseApiService.delete(`/devices/${deviceId}?uid=${encodeURIComponent(uid)}`);
    if (response.error) {
      throw new Error(response.error.message);
    }
  }

  async unpairDevice(deviceId: string, secret: string): Promise<void> {
    const response = await BaseApiService.delete('/devices/unpair', {
      headers: {
        'X-Device-Id': deviceId,
        'X-Device-Secret': secret,
      }
    });
    
    if (response.error) {
      throw new Error(response.error.message);
    }
  }

  async sendCommand(deviceId: string, uid: string, command: {
    type: string;
    payload?: any;
  }): Promise<{ messageId: string; status: string }> {
    const response = await BaseApiService.post<{ messageId: string; status: string }>(`/devices/${deviceId}/command`, command, {
      headers: {
        'Authorization': `Bearer ${uid}`, // This would normally be the user's auth token
      }
    });
    
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }

  async getDeviceLogs(deviceId: string, uid: string, limit?: number): Promise<Array<{
    timestamp: string;
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    data?: any;
  }>> {
    const params = new URLSearchParams({
      uid: encodeURIComponent(uid),
      ...(limit && { limit: limit.toString() })
    });

    const response = await BaseApiService.get<Array<any>>(`/devices/${deviceId}/logs?${params.toString()}`);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data || [];
  }

  // Utility methods
  formatDeviceId(id: string): string {
    return id.substring(0, 8).toUpperCase();
  }

  isDeviceOnline(device: Device): boolean {
    if (!device.lastSeenAt) return false;
    
    const lastSeen = new Date(device.lastSeenAt);
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    return lastSeen >= fiveMinutesAgo;
  }

  getBatteryLevel(device: Device): number {
    if (!device.batteryMv) return 0;
    
    // Assuming 3.7V is max battery voltage
    const maxVoltage = 3700;
    return Math.min(100, Math.max(0, (device.batteryMv / maxVoltage) * 100));
  }

  getSignalStrength(rssi?: number): 'excellent' | 'good' | 'fair' | 'poor' | 'unknown' {
    if (!rssi) return 'unknown';
    
    if (rssi >= -50) return 'excellent';
    if (rssi >= -60) return 'good';
    if (rssi >= -70) return 'fair';
    return 'poor';
  }

  getFirmwareUpdateAvailable(currentVersion: string, latestVersion: string): boolean {
    // Simple version comparison - in a real app this would be more sophisticated
    const current = currentVersion.split('.').map(Number);
    const latest = latestVersion.split('.').map(Number);
    
    for (let i = 0; i < Math.max(current.length, latest.length); i++) {
      const curr = current[i] || 0;
      const lat = latest[i] || 0;
      
      if (lat > curr) return true;
      if (lat < curr) return false;
    }
    
    return false;
  }

  async checkFirmwareUpdate(deviceId: string, uid: string): Promise<{
    available: boolean;
    currentVersion: string;
    latestVersion: string;
    downloadUrl?: string;
    releaseNotes?: string;
  }> {
    const response = await BaseApiService.get<any>(`/devices/${deviceId}/firmware/check?uid=${encodeURIComponent(uid)}`);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data || {
      available: false,
      currentVersion: 'unknown',
      latestVersion: 'unknown'
    };
  }

  async installFirmwareUpdate(deviceId: string, uid: string, version: string): Promise<{
    messageId: string;
    status: string;
  }> {
    const response = await BaseApiService.post<{ messageId: string; status: string }>(`/devices/${deviceId}/firmware/update`, {
      version
    }, {
      headers: {
        'Authorization': `Bearer ${uid}`, // This would normally be the user's auth token
      }
    });
    
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.data!;
  }
}

export default DeviceService.getInstance();