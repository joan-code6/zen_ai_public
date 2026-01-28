import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'chat_models.dart';

class ChatCache {
  ChatCache() : _prefsFuture = SharedPreferences.getInstance();

  final Future<SharedPreferences> _prefsFuture;

  static const _chatsKey = 'chat_cache_summaries';
  static const _detailKeyPrefix = 'chat_cache_detail_';

  Future<List<ChatSummary>?> loadChatSummaries() async {
    final prefs = await _prefsFuture;
    final jsonString = prefs.getString(_chatsKey);
    if (jsonString == null || jsonString.isEmpty) {
      return null;
    }

    try {
      final List<dynamic> decoded = jsonDecode(jsonString) as List<dynamic>;
      return decoded
          .map((item) => ChatSummary.fromJson(item as Map<String, dynamic>))
          .toList();
    } catch (_) {
      return null;
    }
  }

  Future<void> saveChatSummaries(List<ChatSummary> chats) async {
    final prefs = await _prefsFuture;
    final encoded = jsonEncode(chats.map((chat) => chat.toJson()).toList());
    await prefs.setString(_chatsKey, encoded);
  }

  Future<ChatDetail?> loadChatDetail(String chatId) async {
    final prefs = await _prefsFuture;
    final key = _detailKey(chatId);
    final jsonString = prefs.getString(key);
    if (jsonString == null || jsonString.isEmpty) {
      return null;
    }

    try {
      final Map<String, dynamic> decoded =
          jsonDecode(jsonString) as Map<String, dynamic>;
      return ChatDetail.fromJson(decoded);
    } catch (_) {
      return null;
    }
  }

  Future<void> saveChatDetail(ChatDetail detail) async {
    final prefs = await _prefsFuture;
    final key = _detailKey(detail.chat.id);
    final encoded = jsonEncode(detail.toJson());
    await prefs.setString(key, encoded);
  }

  Future<void> removeChatDetail(String chatId) async {
    final prefs = await _prefsFuture;
    await prefs.remove(_detailKey(chatId));
  }

  Future<void> clearAll() async {
    final prefs = await _prefsFuture;
    await prefs.remove(_chatsKey);
    final keys = prefs.getKeys().where((key) => key.startsWith(_detailKeyPrefix));
    for (final key in keys) {
      await prefs.remove(key);
    }
  }

  String _detailKey(String chatId) => '$_detailKeyPrefix$chatId';
}

final chatCacheProvider = Provider<ChatCache>((ref) {
  return ChatCache();
});
