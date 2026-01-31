enum MessageRole { user, assistant, system }

MessageRole roleFromString(String value) {
  return MessageRole.values.firstWhere(
    (role) => role.name == value,
    orElse: () => MessageRole.user,
  );
}

class ChatSummary {
  ChatSummary({
    required this.id,
    required this.uid,
    required this.title,
    required this.systemPrompt,
    required this.createdAt,
    required this.updatedAt,
    this.isLocalOnly = false,
  });

  final String id;
  final String uid;
  final String? title;
  final String? systemPrompt;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final bool isLocalOnly;

  factory ChatSummary.fromJson(Map<String, dynamic> json) {
    return ChatSummary(
      id: json['id'] as String,
      uid: json['uid'] as String,
      title: json['title'] as String?,
      systemPrompt: json['systemPrompt'] as String?,
      createdAt: _parseDate(json['createdAt']),
      updatedAt: _parseDate(json['updatedAt']),
      isLocalOnly: json['isLocalOnly'] as bool? ?? false,
    );
  }

  ChatSummary copyWith({
    String? title,
    String? systemPrompt,
    DateTime? updatedAt,
    bool? isLocalOnly,
  }) {
    return ChatSummary(
      id: id,
      uid: uid,
      title: title ?? this.title,
      systemPrompt: systemPrompt ?? this.systemPrompt,
      createdAt: createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      isLocalOnly: isLocalOnly ?? this.isLocalOnly,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'uid': uid,
      'title': title,
      'systemPrompt': systemPrompt,
      'createdAt': createdAt?.toIso8601String(),
      'updatedAt': updatedAt?.toIso8601String(),
      'isLocalOnly': isLocalOnly,
    };
  }
}

class ChatMessage {
  ChatMessage({
    required this.id,
    required this.role,
    required this.content,
    required this.fileIds,
    required this.createdAt,
  });

  final String id;
  final MessageRole role;
  final String content;
  final List<String> fileIds;
  final DateTime? createdAt;

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    return ChatMessage(
      id: json['id'] as String,
      role: roleFromString(json['role'] as String? ?? 'user'),
      content: json['content'] as String? ?? '',
      fileIds: (json['fileIds'] as List<dynamic>? ?? const [])
          .map((e) => e.toString())
          .toList(),
      createdAt: _parseDate(json['createdAt']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'role': role.name,
      'content': content,
      'fileIds': fileIds,
      'createdAt': createdAt?.toIso8601String(),
    };
  }
}

class ChatFile {
  ChatFile({
    required this.id,
    required this.fileName,
    required this.mimeType,
    required this.size,
    required this.downloadPath,
    required this.textPreview,
    required this.createdAt,
  });

  final String id;
  final String fileName;
  final String mimeType;
  final int size;
  final String downloadPath;
  final String? textPreview;
  final DateTime? createdAt;

  factory ChatFile.fromJson(Map<String, dynamic> json) {
    return ChatFile(
      id: json['id'] as String,
      fileName: json['fileName'] as String,
      mimeType: json['mimeType'] as String,
      size: json['size'] is int
          ? json['size'] as int
          : int.tryParse(json['size'].toString()) ?? 0,
      downloadPath: json['downloadPath'] as String,
      textPreview: json['textPreview'] as String?,
      createdAt: _parseDate(json['createdAt']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'fileName': fileName,
      'mimeType': mimeType,
      'size': size,
      'downloadPath': downloadPath,
      'textPreview': textPreview,
      'createdAt': createdAt?.toIso8601String(),
    };
  }
}

class ChatDetail {
  ChatDetail({required this.chat, required this.messages, required this.files});

  final ChatSummary chat;
  final List<ChatMessage> messages;
  final List<ChatFile> files;

  factory ChatDetail.fromJson(Map<String, dynamic> json) {
    return ChatDetail(
      chat: ChatSummary.fromJson(json['chat'] as Map<String, dynamic>),
      messages: (json['messages'] as List<dynamic>? ?? const [])
          .map((e) => ChatMessage.fromJson(e as Map<String, dynamic>))
          .toList(),
      files: (json['files'] as List<dynamic>? ?? const [])
          .map((e) => ChatFile.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'chat': chat.toJson(),
      'messages': messages.map((m) => m.toJson()).toList(),
      'files': files.map((f) => f.toJson()).toList(),
    };
  }
}

class MessagePair {
  MessagePair({required this.userMessage, this.assistantMessage});

  final ChatMessage userMessage;
  final ChatMessage? assistantMessage;

  factory MessagePair.fromJson(Map<String, dynamic> json) {
    return MessagePair(
      userMessage: ChatMessage.fromJson(
        json['userMessage'] as Map<String, dynamic>,
      ),
      assistantMessage: json['assistantMessage'] != null
          ? ChatMessage.fromJson(
              json['assistantMessage'] as Map<String, dynamic>,
            )
          : null,
    );
  }
}

DateTime? _parseDate(dynamic value) {
  if (value == null) return null;
  if (value is DateTime) return value;
  return DateTime.tryParse(value.toString());
}
