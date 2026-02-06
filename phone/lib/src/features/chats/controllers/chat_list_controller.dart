import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../../auth/controllers/auth_controller.dart';
import '../data/chat_cache.dart';
import '../data/chat_models.dart';

final chatListControllerProvider =
    AutoDisposeAsyncNotifierProvider<ChatListController, List<ChatSummary>>(
      ChatListController.new,
    );

class ChatListController extends AutoDisposeAsyncNotifier<List<ChatSummary>> {
  ChatCache get _cache => ref.read(chatCacheProvider);

  @override
  Future<List<ChatSummary>> build() async {
    final cache = _cache;
    final cachedChats = await cache.loadChatSummaries();
    if (cachedChats != null) {
      state = AsyncValue.data(cachedChats);
    }

    final authState = await ref.watch(authControllerProvider.future);
    final session = authState.session;
    if (session == null) {
      await cache.clearAll();
      return const [];
    }
    final repository = ref.watch(chatRepositoryProvider);
    final remote = await repository.fetchChats(session.uid);
    await cache.saveChatSummaries(remote);
    return remote;
  }

  Future<void> refresh() async {
    final result = await AsyncValue.guard(() async {
      final session = ref.read(authControllerProvider).value?.session;
      if (session == null) {
        await _cache.clearAll();
        return const <ChatSummary>[];
      }
      final repository = ref.read(chatRepositoryProvider);
      final chats = await repository.fetchChats(session.uid);
      await _cache.saveChatSummaries(chats);
      return chats;
    });
    state = result;
  }

  Future<ChatSummary> createChat() async {
    final session = ref.read(authControllerProvider).value?.session;
    if (session == null) {
      throw StateError('User not authenticated');
    }

    final repository = ref.read(chatRepositoryProvider);
    final summary = await repository.createChat(uid: session.uid);
    final current = state.asData?.value ?? const <ChatSummary>[];
    final updated = [summary, ...current];
    state = AsyncValue.data(updated);
    await _cache.saveChatSummaries(updated);
    return summary;
  }

  Future<void> deleteChat(String chatId) async {
    final session = ref.read(authControllerProvider).value?.session;
    if (session == null) return;
    final repository = ref.read(chatRepositoryProvider);
    await repository.deleteChat(chatId: chatId, uid: session.uid);
    final current = state.asData?.value ?? const <ChatSummary>[];
    final updated = current.where((chat) => chat.id != chatId).toList();
    state = AsyncValue.data(updated);
    await _cache.saveChatSummaries(updated);
    await _cache.removeChatDetail(chatId);
  }

  Future<void> renameChat({required String chatId, required String title}) async {
    final session = ref.read(authControllerProvider).value?.session;
    if (session == null) return;
    final repository = ref.read(chatRepositoryProvider);
    final updated = await repository.updateChat(
      chatId: chatId,
      uid: session.uid,
      title: title,
    );

    final current = state.asData?.value ?? const <ChatSummary>[];
    final updatedList = current
        .map((chat) => chat.id == chatId ? updated : chat)
        .toList();
    state = AsyncValue.data(updatedList);
    await _cache.saveChatSummaries(updatedList);
  }
}
