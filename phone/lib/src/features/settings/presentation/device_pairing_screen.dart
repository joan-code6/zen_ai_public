import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:network_info_plus/network_info_plus.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../../core/providers.dart';
import '../../auth/data/auth_models.dart';

final Guid _serviceUuid = Guid('7c2c2001-3e64-4d89-a6fb-01bd1e78b541');
final Guid _credentialsCharUuid = Guid('7c2c2002-3e64-4d89-a6fb-01bd1e78b541');
final Guid _pairingCharUuid = Guid('7c2c2003-3e64-4d89-a6fb-01bd1e78b541');
final Guid _statusCharUuid = Guid('7c2c2004-3e64-4d89-a6fb-01bd1e78b541');

class DevicePairingScreen extends ConsumerStatefulWidget {
  const DevicePairingScreen({super.key, required this.session});

  final AuthSession session;

  @override
  ConsumerState<DevicePairingScreen> createState() => _DevicePairingScreenState();
}

// device paring screen state
class _DevicePairingScreenState extends ConsumerState<DevicePairingScreen> {
  final TextEditingController _ssidController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  final List<ScanResult> _devices = [];
  StreamSubscription<List<ScanResult>>? _scanSubscription;
  bool _isScanning = false;
  bool _isPairing = false;
  String? _statusMessage;

  @override
  void initState() {
    super.initState();
    _loadCurrentWifiSsid();
    _startScan();
  }

  @override
  void dispose() {
    _scanSubscription?.cancel();
    FlutterBluePlus.stopScan();
    _ssidController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _loadCurrentWifiSsid() async {
    try {
      // Request location permission if needed for WiFi info
      if (Platform.isAndroid) {
        final status = await Permission.locationWhenInUse.request();
        if (!status.isGranted) {
          return;
        }
      }
      final info = NetworkInfo();
      final wifiName = await info.getWifiName();
      if (wifiName != null && wifiName.isNotEmpty) {
        // Remove surrounding quotes if present
        final cleanedSsid = wifiName.replaceAll(RegExp(r'^"|"$'), '');
        setState(() {
          _ssidController.text = cleanedSsid;
        });
      }
    } catch (e) {
      // Ignore errors, user can enter manually
    }
  }

  Future<void> _startScan() async {
    if (_isScanning) return;
    setState(() {
      _isScanning = true;
      _statusMessage = 'Searching for displays…';
      _devices.clear();
    });
    await _ensurePermissions();
    await FlutterBluePlus.stopScan();
    _scanSubscription?.cancel();
    _scanSubscription = FlutterBluePlus.scanResults.listen((results) {
      final filtered = results.where(_matchesZenDisplay).toList()
        ..sort((a, b) => b.rssi.compareTo(a.rssi));
      setState(() {
        _devices
          ..clear()
          ..addAll(filtered);
      });
    });
    try {
      await FlutterBluePlus.startScan(timeout: const Duration(seconds: 8));
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Scan failed: $error')),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isScanning = false;
          _statusMessage = _devices.isEmpty
              ? 'No displays found. Move closer and try again.'
              : 'Select your display below';
        });
      }
    }
  }

  bool _matchesZenDisplay(ScanResult result) {
    final advertName = result.advertisementData.advName.toLowerCase();
    final deviceName = result.device.platformName.toLowerCase();
    return advertName.contains('zen') || deviceName.contains('zen');
  }

  Future<void> _pairDevice(ScanResult result) async {
    final ssid = _ssidController.text.trim();
    final password = _passwordController.text;
    if (ssid.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter your Wi-Fi SSID first.')),
      );
      return;
    }
    final idToken = widget.session.idToken;
    if (idToken == null || idToken.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Missing authentication token. Sign in again.')),
      );
      return;
    }

    setState(() {
      _isPairing = true;
      _statusMessage = 'Connecting to ${result.device.platformName}…';
    });

    try {
      await FlutterBluePlus.stopScan();
      await result.device.connect(timeout: const Duration(seconds: 12));
      final services = await result.device.discoverServices();
      final service = services.firstWhere((svc) => svc.serviceUuid == _serviceUuid);
      final credentialsChar = service.characteristics.firstWhere(
        (char) => char.characteristicUuid == _credentialsCharUuid,
      );
      final pairingChar = service.characteristics.firstWhere(
        (char) => char.characteristicUuid == _pairingCharUuid,
      );
      final statusChar = service.characteristics.firstWhere(
        (char) => char.characteristicUuid == _statusCharUuid,
      );

      // Send Wi-Fi credentials first
      setState(() {
        _statusMessage = 'Sending Wi-Fi credentials…';
      });
      final payload = utf8.encode('$ssid\n$password');
      await credentialsChar.write(payload, withoutResponse: true);
      
      // Wait for device to connect to Wi-Fi and register (up to 15 seconds)
      setState(() {
        _statusMessage = 'Waiting for device to connect…';
      });
      
      // Poll the status characteristic until the device reports it's
      // waiting_for_claim or registered. Give the device ample time to
      // complete Wi‑Fi connection and backend registration (up to 2 minutes).
      String? currentStatus;
      const int pollIntervalMs = 500;
      const int maxWaitMs = 120000; // 2 minutes
      final int start = DateTime.now().millisecondsSinceEpoch;
      while (DateTime.now().millisecondsSinceEpoch - start < maxWaitMs) {
        await Future<void>.delayed(const Duration(milliseconds: pollIntervalMs));
        try {
          final statusBytes = await statusChar.read();
          currentStatus = utf8.decode(statusBytes, allowMalformed: true);
          print('Device status poll: $currentStatus');
          if (currentStatus.contains('registered') || currentStatus.contains('waiting_for_claim')) {
            break;
          }
          // Update UI every few seconds so the user sees progress
          if (mounted && ((DateTime.now().millisecondsSinceEpoch - start) % 5000) < pollIntervalMs) {
            setState(() {
              _statusMessage = 'Waiting for device to register (${((DateTime.now().millisecondsSinceEpoch - start)/1000).round()}s)…';
            });
          }
        } catch (e) {
          print('Status read error: $e');
        }
      }

      // If the device never reached a claimable state within our timeout,
      // bail out gracefully without attempting to read the token or call
      // the claim API. This avoids racing the backend registration.
      if (currentStatus == null || !(currentStatus.contains('registered') || currentStatus.contains('waiting_for_claim'))) {
        if (mounted) {
          setState(() {
            _statusMessage = 'Timed out waiting for device to become claimable. Please try again.';
          });
        }
        // Do not proceed to read pairing token or call claim; disconnect and return.
        await result.device.disconnect();
        setState(() {
          _isPairing = false;
        });
        _startScan();
        return;
      }

      // Now read the pairing token
      setState(() {
        _statusMessage = 'Retrieving pairing token…';
      });
      
      final response = await pairingChar.read();
      print('Raw response bytes: $response');
      String token;
      try {
        final decodedResponse = utf8.decode(response);
        print('Decoded response: $decodedResponse');
        final data = jsonDecode(decodedResponse) as Map<String, dynamic>;
        token = (data['token'] as String?)?.trim() ?? '';

        // Verify that the deviceId in the pairing payload matches the
        // BLE device we connected to. The device advertises a name like
        // "ZenDisplay-8916" where the suffix is the last 4 hex chars of
        // the deviceId. This avoids claiming a different nearby display.
        final payloadDeviceId = (data['deviceId'] as String?) ?? '';
        if (payloadDeviceId.isNotEmpty) {
          final expectedSuffix = payloadDeviceId.length >= 4
              ? payloadDeviceId.substring(payloadDeviceId.length - 4).toUpperCase()
              : '';
          final advertName = result.device.platformName.isNotEmpty
              ? result.device.platformName
              : result.advertisementData.advName;
          final advertSuffix = advertName.contains('-')
              ? advertName.split('-').last.toUpperCase()
              : advertName.toUpperCase();
          if (expectedSuffix.isNotEmpty && advertSuffix.isNotEmpty && expectedSuffix != advertSuffix) {
            // Mismatch — abort claiming to avoid grabbing the wrong device.
            final msg = 'BLE device mismatch: payload deviceId suffix $expectedSuffix does not match $advertSuffix';
            print(msg);
            if (mounted) {
              setState(() {
                _statusMessage = 'Found token for a different display. Try again near the correct device.';
              });
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text(msg)),
              );
            }
            return;
          }
        }
      } catch (e) {
        // If not valid UTF-8 or not JSON, assume the bytes are the token as hex string
        token = response.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
        print('Assuming binary token: $token');
      }
      if (token.isEmpty) {
        throw const FormatException('Display did not return a pairing token');
      }

      await ref.read(deviceRepositoryProvider).claimDevice(
            pairingToken: token,
            idToken: idToken,
          );
      if (mounted) {
        setState(() {
          _statusMessage = 'Display linked successfully!';
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Display connected. It may take a few seconds to sync.')),
        );
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          _statusMessage = 'Pairing failed: $error';
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Pairing failed: $error')),
        );
      }
    } finally {
      await result.device.disconnect();
      setState(() {
        _isPairing = false;
      });
      _startScan();
    }
  }

  Future<void> _ensurePermissions() async {
    if (Platform.isAndroid) {
      final statuses = await <Permission>[
        Permission.bluetoothScan,
        Permission.bluetoothConnect,
        Permission.locationWhenInUse,
      ].request();
      final denied = statuses.values.where((status) => !status.isGranted);
      if (denied.isNotEmpty) {
        throw StateError('Bluetooth permissions are required.');
      }
    } else if (Platform.isIOS) {
      final status = await Permission.bluetooth.request();
      if (!status.isGranted) {
        throw StateError('Bluetooth permission is required.');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Connect e-ink display')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Provision over Bluetooth',
                style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 12),
              Text(
                'Stand near your display, enable Bluetooth, and enter the Wi-Fi network the display should join. '
                'We will send the credentials securely over BLE and automatically bind the device to your account.',
                style: theme.textTheme.bodyMedium,
              ),
              const SizedBox(height: 24),
              TextField(
                controller: _ssidController,
                decoration: const InputDecoration(
                  labelText: 'Wi-Fi SSID',
                  hintText: 'e.g. Home Network',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _passwordController,
                decoration: const InputDecoration(
                  labelText: 'Wi-Fi password',
                ),
                obscureText: false,
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  ElevatedButton.icon(
                    onPressed: _isScanning ? null : _startScan,
                    icon: const Icon(Icons.radar),
                    label: Text(_isScanning ? 'Scanning…' : 'Scan for displays'),
                  ),
                  const SizedBox(width: 16),
                  if (_isPairing) const CircularProgressIndicator(),
                ],
              ),
              if (_statusMessage != null) ...[
                const SizedBox(height: 12),
                Text(
                  _statusMessage!,
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.secondary),
                ),
              ],
              const SizedBox(height: 16),
              Expanded(
                child: _devices.isEmpty
                    ? Center(
                        child: Text(
                          _isScanning
                              ? 'Scanning…'
                              : 'No Zen displays nearby. Ensure it shows the Bluetooth pairing screen.',
                          textAlign: TextAlign.center,
                        ),
                      )
                    : ListView.builder(
                        itemCount: _devices.length,
                        itemBuilder: (context, index) {
                          final result = _devices[index];
                          final name = result.device.platformName.isNotEmpty
                              ? result.device.platformName
                              : result.advertisementData.advName;
                          return Card(
                            child: ListTile(
                              leading: const Icon(Icons.devices_other),
                              title: Text(name.isEmpty ? 'Unnamed device' : name),
                              subtitle: Text('RSSI ${result.rssi} dBm'),
                              trailing: const Icon(Icons.chevron_right),
                              onTap: _isPairing ? null : () => _pairDevice(result),
                            ),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
