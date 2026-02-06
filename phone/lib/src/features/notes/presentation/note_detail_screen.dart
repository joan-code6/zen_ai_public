import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:zen_ai/src/shared/widgets/sidebar_swipe_region.dart';

import '../controllers/notes_controller.dart';
import '../data/note_models.dart';
import 'note_editor_screen.dart';

class NoteDetailScreen extends ConsumerWidget {
  const NoteDetailScreen({
    super.key,
    required this.note,
    this.onRequestChatsSidebar,
    this.onRequestNotesSidebar,
  });

  final Note note;
  final VoidCallback? onRequestChatsSidebar;
  final VoidCallback? onRequestNotesSidebar;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notesState = ref.watch(notesControllerProvider);
    Note currentNote = note;
    final latest = notesState.asData?.value;
    if (latest != null) {
      final match = latest.firstWhere(
        (element) => element.id == note.id,
        orElse: () => currentNote,
      );
      currentNote = match;
    }

    final theme = Theme.of(context);
    return SidebarSwipeRegion(
      onSwipeRight: onRequestChatsSidebar,
      onSwipeLeft: onRequestNotesSidebar,
      child: Scaffold(
        appBar: AppBar(
          title: Text(currentNote.title),
          actions: [
            IconButton(
              onPressed: () => _openEditor(context, currentNote),
              icon: const Icon(Icons.edit_outlined),
              tooltip: 'Edit note',
            ),
          ],
        ),
        floatingActionButton: FloatingActionButton.extended(
          onPressed: () => _openEditor(context, currentNote),
          icon: const Icon(Icons.edit_note_outlined),
          label: const Text('Edit note'),
        ),
        body: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            _SectionHeading(label: 'Content'),
            const SizedBox(height: 8),
            DecoratedBox(
              decoration: BoxDecoration(
                color: theme.colorScheme.surfaceContainerHigh,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: SelectableText(
                  currentNote.content.isNotEmpty
                      ? currentNote.content
                      : 'No content provided.',
                  style: theme.textTheme.bodyLarge,
                ),
              ),
            ),
            if (currentNote.keywords.isNotEmpty) ...[
              const SizedBox(height: 24),
              _SectionHeading(label: 'Keywords'),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final keyword in currentNote.keywords)
                    Chip(label: Text(keyword)),
                ],
              ),
            ],
            if (currentNote.triggerWords.isNotEmpty) ...[
              const SizedBox(height: 24),
              _SectionHeading(label: 'Trigger words'),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final word in currentNote.triggerWords)
                    Chip(label: Text(word)),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _openEditor(BuildContext context, Note note) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => NoteEditorScreen(
          note: note,
          onRequestChatsSidebar: onRequestChatsSidebar,
          onRequestNotesSidebar: onRequestNotesSidebar,
        ),
        fullscreenDialog: true,
      ),
    );
  }
}

class _SectionHeading extends StatelessWidget {
  const _SectionHeading({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Text(
      label,
      style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
    );
  }
}
