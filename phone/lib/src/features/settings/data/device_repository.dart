import '../../../data/api_client.dart';

class DeviceRepository {
  DeviceRepository(this._client);

  final ApiClient _client;

  Future<void> claimDevice({required String pairingToken, required String idToken}) {
    return _client.post(
      '/devices/claim',
      body: {'pairingToken': pairingToken},
      headers: {
        'Authorization': 'Bearer $idToken',
      },
    );
  }
}
