import 'dart:convert';

class EmailAnalysisRecord {
  final String id; // e.g., {uid}_{provider}_{message_id}
  final String messageId;
  final String provider;
  final String importance; // e.g., low/medium/high
  final List<String> categories;
  final String senderSummary;
  final bool senderValidated;
  final String contentSummary;
  final Map<String, dynamic>? extractedInfo;
  final List<String> matchedNoteIds;
  final String? createdNoteId;

  const EmailAnalysisRecord({
    required this.id,
    required this.messageId,
    required this.provider,
    required this.importance,
    this.categories = const [],
    this.senderSummary = '',
    this.senderValidated = false,
    this.contentSummary = '',
    this.extractedInfo,
    this.matchedNoteIds = const [],
    this.createdNoteId,
  });

  factory EmailAnalysisRecord.fromJson(Map<String, dynamic> json) {
    return EmailAnalysisRecord(
      id: json['id']?.toString() ?? '',
      messageId: json['messageId']?.toString() ?? json['message_id']?.toString() ?? '',
      provider: json['provider']?.toString() ?? '',
      importance: json['importance']?.toString() ?? 'medium',
      categories: (json['categories'] as List<dynamic>?)?.map((e) => e.toString()).toList() ?? const [],
      senderSummary: json['senderSummary']?.toString() ?? json['sender_summary']?.toString() ?? '',
      senderValidated: json['senderValidated'] ?? json['sender_validated'] ?? false,
      contentSummary: json['contentSummary']?.toString() ?? json['content_summary']?.toString() ?? '',
      extractedInfo: json['extractedInfo'] is Map<String, dynamic> ? json['extractedInfo'] as Map<String, dynamic> : (json['extracted_info'] as Map<String, dynamic>?),
      matchedNoteIds: (json['matchedNoteIds'] as List<dynamic>?)?.map((e) => e.toString()).toList() ?? (json['matched_note_ids'] as List<dynamic>?)?.map((e) => e.toString()).toList() ?? const [],
      createdNoteId: json['createdNoteId']?.toString() ?? json['created_note_id']?.toString(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'messageId': messageId,
      'provider': provider,
      'importance': importance,
      'categories': categories,
      'senderSummary': senderSummary,
      'senderValidated': senderValidated,
      'contentSummary': contentSummary,
      'extractedInfo': extractedInfo,
      'matchedNoteIds': matchedNoteIds,
      'createdNoteId': createdNoteId,
    };
  }
}
