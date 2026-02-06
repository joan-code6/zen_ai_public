import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../../auth/controllers/auth_controller.dart';
import '../data/note_models.dart';

final notesControllerProvider =
    AutoDisposeAsyncNotifierProvider<NotesController, List<Note>>(
      NotesController.new,
    );

class NotesController extends AutoDisposeAsyncNotifier<List<Note>> {
  @override
  Future<List<Note>> build() async {
    final authState = await ref.watch(authControllerProvider.future);
    final session = authState.session;
    if (session == null) {
      return const [];
    }
    final repository = ref.watch(notesRepositoryProvider);
    return repository.fetchNotes(uid: session.uid);
  }

  Future<Note?> createNote({
    String? title,
    String? content,
    List<String>? keywords,
    List<String>? triggerWords,
  }) async {
    final session = ref.read(authControllerProvider).value?.session;
    if (session == null) return null;
    final repository = ref.read(notesRepositoryProvider);
    final note = await repository.createNote(
      uid: session.uid,
      title: title,
      content: content,
      keywords: keywords,
      triggerWords: triggerWords,
    );
    state = state.whenData((notes) => [note, ...notes]);
    return note;
  }

  Future<void> updateNote(Note note) async {
    final session = ref.read(authControllerProvider).value?.session;
    if (session == null) return;
    final repository = ref.read(notesRepositoryProvider);
    final updated = await repository.updateNote(
      noteId: note.id,
      uid: session.uid,
      title: note.title,
      content: note.content,
      keywords: note.keywords,
      triggerWords: note.triggerWords,
    );

    state = state.whenData(
      (notes) => notes.map((n) => n.id == note.id ? updated : n).toList(),
    );
  }

  Future<void> deleteNote(String noteId) async {
    final session = ref.read(authControllerProvider).value?.session;
    if (session == null) return;
    final repository = ref.read(notesRepositoryProvider);
    await repository.deleteNote(noteId: noteId, uid: session.uid);
    state = state.whenData(
      (notes) => notes.where((note) => note.id != noteId).toList(),
    );
  }
}
