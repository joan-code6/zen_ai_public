import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../../auth/controllers/auth_controller.dart';
import '../data/chat_cache.dart';
import '../data/chat_models.dart';
import '../data/chat_repository.dart';

final chatDetailControllerProvider =
    AutoDisposeAsyncNotifierProviderFamily<
      ChatDetailController,
      ChatDetail,
      String
    >(ChatDetailController.new);

class ChatDetailController
    extends AutoDisposeFamilyAsyncNotifier<ChatDetail, String> {
  late final ChatRepository _repository;
  late final String _chatId;
  bool _hasScheduledFirstResponseRefresh = false;

  ChatCache get _cache => ref.read(chatCacheProvider);

  @override
  Future<ChatDetail> build(String chatId) async {
    _chatId = chatId;
    _repository = ref.watch(chatRepositoryProvider);

    final cachedDetail = await _cache.loadChatDetail(chatId);
    if (cachedDetail != null) {
      state = AsyncValue.data(cachedDetail);
    }

    final authState = await ref.watch(authControllerProvider.future);
    final session = authState.session;
    if (session == null) {
      throw StateError('User not authenticated');
    }

    final detail =
        await _repository.fetchChatDetail(chatId: chatId, uid: session.uid);
    await _cache.saveChatDetail(detail);
    return detail;
  }

  Future<void> refresh() async {
    final result = await AsyncValue.guard(_reload);
    state = result;
  }

  Future<void> sendMessage(String content) async {
    final session = ref.read(authControllerProvider).value?.session;
    if (session == null) return;

    final baseDetail = await _ensureDetail();
    final hadAssistantMessages = baseDetail.messages
        .any((message) => message.role == MessageRole.assistant);
    final shouldRefreshTitleAfterStream =
        !hadAssistantMessages &&
        !_hasScheduledFirstResponseRefresh &&
        ((baseDetail.chat.title?.trim().isEmpty ?? true));
    final timestamp = DateTime.now();
    final tempUserId = 'local-user-${timestamp.microsecondsSinceEpoch}';
    final tempAssistantId = 'local-assistant-${timestamp.microsecondsSinceEpoch}';

    final userMessage = ChatMessage(
      id: tempUserId,
      role: MessageRole.user,
      content: content,
      fileIds: const [],
      createdAt: timestamp,
    );

    final assistantPlaceholder = ChatMessage(
      id: tempAssistantId,
      role: MessageRole.assistant,
      content: '',
      fileIds: const [],
      createdAt: timestamp,
    );

    _emitDetail(
      chat: baseDetail.chat,
      files: baseDetail.files,
      messages: [
        ...baseDetail.messages,
        userMessage,
        assistantPlaceholder,
      ],
    );

    try {
      final pair = await _repository.sendMessage(
        chatId: _chatId,
        uid: session.uid,
        content: content,
      );

      _replaceMessage(tempUserId, pair.userMessage);

      final assistantMessage = pair.assistantMessage;
      if (assistantMessage != null) {
        await _streamAssistantMessage(
          placeholderId: tempAssistantId,
          finalMessage: assistantMessage,
          refreshTitleAfterStream: shouldRefreshTitleAfterStream,
        );
      } else {
        _removeMessage(tempAssistantId);
      }
    } catch (error, stack) {
      _emitDetail(
        chat: baseDetail.chat,
        files: baseDetail.files,
        messages: baseDetail.messages,
      );
      Error.throwWithStackTrace(error, stack);
    }
  }

  Future<void> attachFile(PlatformFile file) async {
    final session = ref.read(authControllerProvider).value?.session;
    if (session == null) return;

    final existing = state.value;

    final result = await AsyncValue.guard(() async {
      final uploaded = await _repository.uploadFile(
        chatId: _chatId,
        uid: session.uid,
        file: file,
      );
      final detail = existing ?? await _reload();
      return ChatDetail(
        chat: detail.chat,
        messages: detail.messages,
        files: [...detail.files, uploaded],
      );
    });

    state = result;
    if (result.hasValue) {
      await _cache.saveChatDetail(result.value!);
    }
  }

  Future<void> updateChatMetadata({String? title, String? systemPrompt}) async {
    final session = ref.read(authControllerProvider).value?.session;
    if (session == null) return;

    final existing = state.value;
    final updatedChat = await _repository.updateChat(
      chatId: _chatId,
      uid: session.uid,
      title: title,
      systemPrompt: systemPrompt,
    );

    if (existing != null) {
      final detail = ChatDetail(
        chat: updatedChat,
        messages: existing.messages,
        files: existing.files,
      );
      state = AsyncData(detail);
      await _cache.saveChatDetail(detail);
    } else {
      await refresh();
    }
  }

  Future<ChatDetail> _reload() async {
    final session = ref.read(authControllerProvider).value?.session;
    if (session == null) {
      throw StateError('User not authenticated');
    }
    final detail =
        await _repository.fetchChatDetail(chatId: _chatId, uid: session.uid);
    await _cache.saveChatDetail(detail);
    return detail;
  }

  Future<ChatDetail> _ensureDetail() async {
    final current = state.value;
    if (current != null) {
      return current;
    }
    final detail = await _reload();
    state = AsyncData(detail);
    return detail;
  }

  Future<void> _streamAssistantMessage({
    required String placeholderId,
    required ChatMessage finalMessage,
    bool refreshTitleAfterStream = false,
  }) async {
    final content = finalMessage.content;
    if (content.isEmpty) {
      _replaceMessage(placeholderId, finalMessage);
      if (refreshTitleAfterStream) {
        _scheduleDelayedMetadataRefresh();
      }
      return;
    }

    final tokens = _tokenize(content);
    final buffer = StringBuffer();
    for (final token in tokens) {
      buffer.write(token);
      final partial = ChatMessage(
        id: placeholderId,
        role: MessageRole.assistant,
        content: buffer.toString(),
        fileIds: finalMessage.fileIds,
        createdAt: finalMessage.createdAt,
      );
      _replaceMessage(placeholderId, partial);
      await Future.delayed(const Duration(milliseconds: 24));
    }

    _replaceMessage(placeholderId, finalMessage);
    if (refreshTitleAfterStream) {
      _scheduleDelayedMetadataRefresh();
    }
  }

  List<String> _tokenize(String content) {
    if (content.isEmpty) {
      return const [];
    }

    final matches = RegExp(r'\s+|\S+').allMatches(content);
    if (matches.isEmpty) {
      return [content];
    }

    return [for (final match in matches) match.group(0) ?? ''];
  }

  void _replaceMessage(String targetId, ChatMessage? replacement) {
    final current = state.value;
    if (current == null) return;

    final updated = <ChatMessage>[];
    for (final message in current.messages) {
      if (message.id == targetId) {
        if (replacement != null) {
          updated.add(replacement);
        }
        continue;
      }
      updated.add(message);
    }

    if (replacement != null &&
        !updated.contains(replacement) &&
        current.messages.every((m) => m.id != targetId)) {
      updated.add(replacement);
    }

    _emitDetail(chat: current.chat, files: current.files, messages: updated);
  }

  void _removeMessage(String targetId) {
    final current = state.value;
    if (current == null) return;
    final updated = current.messages.where((m) => m.id != targetId).toList();
    _emitDetail(chat: current.chat, files: current.files, messages: updated);
  }

  void _emitDetail({
    required ChatSummary chat,
    required List<ChatFile> files,
    required List<ChatMessage> messages,
  }) {
    final detail = ChatDetail(
      chat: chat,
      messages: List<ChatMessage>.unmodifiable(messages),
      files: files,
    );
    state = AsyncData(detail);
    unawaited(_cache.saveChatDetail(detail));
  }

  void _scheduleDelayedMetadataRefresh() {
    if (_hasScheduledFirstResponseRefresh) {
      return;
    }
    _hasScheduledFirstResponseRefresh = true;

    Future<void>(() async {
      await Future.delayed(const Duration(seconds: 2));

      final result = await AsyncValue.guard(_reload);

      result.when(
        data: (detail) {
          state = AsyncData(detail);
          unawaited(_cache.saveChatDetail(detail));
        },
        error: (error, stack) {
          _hasScheduledFirstResponseRefresh = false;
        },
        loading: () {},
      );
    });
  }
}
