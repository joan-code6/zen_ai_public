import '../../../data/api_client.dart';
import '../../../data/api_exception.dart';
import 'note_models.dart';

class NotesRepository {
  NotesRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<List<Note>> fetchNotes({required String uid, int? limit}) async {
    final result = await _apiClient.get(
      '/notes',
      queryParameters: {'uid': uid, if (limit != null) 'limit': limit},
    );

    if (result is! Map<String, dynamic>) {
      throw const ApiException(message: 'Unexpected notes response');
    }

    final items = result['items'] as List<dynamic>? ?? const [];
    return items
        .map((item) => Note.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<Note> createNote({
    required String uid,
    String? title,
    String? content,
    List<String>? keywords,
    List<String>? triggerWords,
  }) async {
    final result = await _apiClient.post(
      '/notes',
      body: {
        'uid': uid,
        if (title != null) 'title': title,
        if (content != null) 'content': content,
        if (keywords != null) 'keywords': keywords,
        if (triggerWords != null) 'triggerWords': triggerWords,
      },
    );

    if (result is! Map<String, dynamic>) {
      throw const ApiException(message: 'Unexpected create note response');
    }

    return Note.fromJson(result);
  }

  Future<Note> updateNote({
    required String noteId,
    required String uid,
    String? title,
    String? content,
    List<String>? keywords,
    List<String>? triggerWords,
  }) async {
    final result = await _apiClient.patch(
      '/notes/$noteId',
      body: {
        'uid': uid,
        if (title != null) 'title': title,
        if (content != null) 'content': content,
        if (keywords != null) 'keywords': keywords,
        if (triggerWords != null) 'triggerWords': triggerWords,
      },
    );

    if (result is! Map<String, dynamic>) {
      throw const ApiException(message: 'Unexpected update note response');
    }

    return Note.fromJson(result);
  }

  Future<void> deleteNote({required String noteId, required String uid}) async {
    await _apiClient.delete('/notes/$noteId', body: {'uid': uid});
  }
}
