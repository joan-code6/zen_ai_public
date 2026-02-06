import 'package:file_picker/file_picker.dart';
import 'package:http/http.dart' as http;

import '../../../data/api_client.dart';
import '../../../data/api_exception.dart';
import 'chat_models.dart';

class ChatRepository {
  ChatRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<List<ChatSummary>> fetchChats(String uid) async {
    final result = await _apiClient.get(
      '/chats',
      queryParameters: {'uid': uid},
    );

    if (result is! Map<String, dynamic>) {
      throw const ApiException(message: 'Unexpected chats response');
    }

    final items = result['items'] as List<dynamic>? ?? const [];
    return items
        .map((item) => ChatSummary.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<ChatSummary> createChat({
    required String uid,
    String? title,
    String? systemPrompt,
  }) async {
    final result = await _apiClient.post(
      '/chats',
      body: {
        'uid': uid,
        if (title != null && title.trim().isNotEmpty) 'title': title,
        if (systemPrompt != null && systemPrompt.trim().isNotEmpty)
          'systemPrompt': systemPrompt,
      },
    );

    if (result is! Map<String, dynamic>) {
      throw const ApiException(message: 'Unexpected create chat response');
    }

    return ChatSummary.fromJson(result);
  }

  Future<ChatDetail> fetchChatDetail({
    required String chatId,
    required String uid,
  }) async {
    final result = await _apiClient.get(
      '/chats/$chatId',
      queryParameters: {'uid': uid},
    );

    if (result is! Map<String, dynamic>) {
      throw const ApiException(message: 'Unexpected chat detail response');
    }

    return ChatDetail.fromJson(result);
  }

  Future<ChatSummary> updateChat({
    required String chatId,
    required String uid,
    String? title,
    String? systemPrompt,
  }) async {
    final result = await _apiClient.patch(
      '/chats/$chatId',
      body: {
        'uid': uid,
        if (title != null) 'title': title,
        if (systemPrompt != null) 'systemPrompt': systemPrompt,
      },
    );

    if (result is! Map<String, dynamic>) {
      throw const ApiException(message: 'Unexpected update chat response');
    }

    return ChatSummary.fromJson(result);
  }

  Future<void> deleteChat({required String chatId, required String uid}) async {
    await _apiClient.delete('/chats/$chatId', body: {'uid': uid});
  }

  Future<MessagePair> sendMessage({
    required String chatId,
    required String uid,
    required String content,
    MessageRole role = MessageRole.user,
    List<String>? fileIds,
  }) async {
    final result = await _apiClient.post(
      '/chats/$chatId/messages',
      body: {
        'uid': uid,
        'content': content,
        'role': role.name,
        if (fileIds != null && fileIds.isNotEmpty) 'fileIds': fileIds,
      },
    );

    if (result is! Map<String, dynamic>) {
      throw const ApiException(message: 'Unexpected send message response');
    }

    return MessagePair.fromJson(result);
  }

  Future<ChatFile> uploadFile({
    required String chatId,
    required String uid,
    required PlatformFile file,
  }) async {
    if (file.bytes == null && file.path == null) {
      throw const ApiException(message: 'Cannot upload empty file');
    }

    final multipartFile = file.bytes != null
        ? http.MultipartFile.fromBytes('file', file.bytes!, filename: file.name)
        : await http.MultipartFile.fromPath(
            'file',
            file.path!,
            filename: file.name,
          );

    final result = await _apiClient.postMultipart(
      '/chats/$chatId/files',
      fields: {'uid': uid},
      file: multipartFile,
    );

    if (result is! Map<String, dynamic>) {
      throw const ApiException(message: 'Unexpected file upload response');
    }

    final fileJson = result['file'] as Map<String, dynamic>?;
    if (fileJson == null) {
      throw const ApiException(message: 'Missing file payload in response');
    }

    return ChatFile.fromJson(fileJson);
  }
}
