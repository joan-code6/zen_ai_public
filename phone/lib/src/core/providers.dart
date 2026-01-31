import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

import '../data/api_client.dart';
import '../features/auth/data/auth_repository.dart';
import '../features/chats/data/chat_repository.dart';
import '../features/notes/data/note_repository.dart';
import '../features/settings/data/device_repository.dart';
import 'backend_config.dart';

final httpClientProvider = Provider<http.Client>((ref) {
  return http.Client();
});

final backendConfigRepositoryProvider = Provider<BackendConfigRepository>((
  ref,
) {
  final client = ref.watch(httpClientProvider);
  return BackendConfigRepository(httpClient: client);
});

final backendConfigProvider = FutureProvider<BackendConfig>((ref) async {
  final repo = ref.watch(backendConfigRepositoryProvider);
  return repo.load();
});

final apiClientProvider = Provider<ApiClient>((ref) {
  final config = ref.watch(backendConfigProvider).value;
  if (config == null) {
    throw StateError('Backend configuration not loaded yet');
  }
  return ApiClient(config, httpClient: ref.watch(httpClientProvider));
});

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return AuthRepository(apiClient);
});

final chatRepositoryProvider = Provider<ChatRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return ChatRepository(apiClient);
});

final notesRepositoryProvider = Provider<NotesRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return NotesRepository(apiClient);
});

final deviceRepositoryProvider = Provider<DeviceRepository>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return DeviceRepository(apiClient);
});
