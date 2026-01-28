class Note {
  Note({
    required this.id,
    required this.uid,
    required this.title,
    required this.content,
    required this.excerpt,
    required this.keywords,
    required this.triggerWords,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String uid;
  final String title;
  final String content;
  final String? excerpt;
  final List<String> keywords;
  final List<String> triggerWords;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  factory Note.fromJson(Map<String, dynamic> json) {
    return Note(
      id: json['id'] as String,
      uid: json['uid'] as String,
      title: json['title'] as String? ?? 'Untitled',
      content: json['content'] as String? ?? '',
      excerpt: json['excerpt'] as String?,
      keywords: _stringList(json['keywords']),
      triggerWords: _stringList(json['triggerWords']),
      createdAt: _parseDate(json['createdAt']),
      updatedAt: _parseDate(json['updatedAt']),
    );
  }

  Note copyWith({
    String? title,
    String? content,
    List<String>? keywords,
    List<String>? triggerWords,
    DateTime? updatedAt,
  }) {
    return Note(
      id: id,
      uid: uid,
      title: title ?? this.title,
      content: content ?? this.content,
      excerpt: excerpt,
      keywords: keywords ?? this.keywords,
      triggerWords: triggerWords ?? this.triggerWords,
      createdAt: createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
}

List<String> _stringList(dynamic value) {
  if (value is List<dynamic>) {
    return value.map((e) => e.toString()).toList();
  }
  return const [];
}

DateTime? _parseDate(dynamic value) {
  if (value == null) return null;
  if (value is DateTime) return value;
  return DateTime.tryParse(value.toString());
}
