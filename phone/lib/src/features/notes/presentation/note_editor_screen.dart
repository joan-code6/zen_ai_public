import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:zen_ai/src/shared/widgets/sidebar_swipe_region.dart';

import '../controllers/notes_controller.dart';
import '../data/note_models.dart';

class NoteEditorScreen extends ConsumerStatefulWidget {
  const NoteEditorScreen({
    super.key,
    this.note,
    this.onRequestChatsSidebar,
    this.onRequestNotesSidebar,
  });

  final Note? note;
  final VoidCallback? onRequestChatsSidebar;
  final VoidCallback? onRequestNotesSidebar;

  @override
  ConsumerState<NoteEditorScreen> createState() => _NoteEditorScreenState();
}

class _NoteEditorScreenState extends ConsumerState<NoteEditorScreen> {
  late final TextEditingController _titleController;
  late final TextEditingController _contentController;
  late final TextEditingController _keywordsController;
  late final TextEditingController _triggersController;

  final _formKey = GlobalKey<FormState>();

  bool get isEditing => widget.note != null;

  @override
  void initState() {
    super.initState();
    _titleController = TextEditingController(text: widget.note?.title ?? '');
    _contentController = TextEditingController(
      text: widget.note?.content ?? '',
    );
    _keywordsController = TextEditingController(
      text: widget.note?.keywords.join(', ') ?? '',
    );
    _triggersController = TextEditingController(
      text: widget.note?.triggerWords.join(', ') ?? '',
    );
  }

  @override
  void dispose() {
    _titleController.dispose();
    _contentController.dispose();
    _keywordsController.dispose();
    _triggersController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SidebarSwipeRegion(
      onSwipeRight: widget.onRequestChatsSidebar,
      onSwipeLeft: widget.onRequestNotesSidebar,
      child: Scaffold(
        appBar: AppBar(
          title: Text(isEditing ? 'Edit note' : 'New note'),
          actions: [TextButton(onPressed: _save, child: const Text('Save'))],
        ),
        body: Padding(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: ListView(
              children: [
                TextFormField(
                  controller: _titleController,
                  decoration: const InputDecoration(labelText: 'Title'),
                  validator: (value) {
                    if (value == null || value.isEmpty) return 'Enter a title';
                    return null;
                  },
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _contentController,
                  decoration: const InputDecoration(labelText: 'Content'),
                  minLines: 6,
                  maxLines: 12,
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _keywordsController,
                  decoration: const InputDecoration(
                    labelText: 'Keywords',
                    helperText: 'Comma separated values',
                  ),
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _triggersController,
                  decoration: const InputDecoration(
                    labelText: 'Trigger words',
                    helperText: 'Comma separated values',
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;

    final keywords = _keywordsController.text
        .split(',')
        .map((e) => e.trim())
        .where((e) => e.isNotEmpty)
        .toList();

    final triggers = _triggersController.text
        .split(',')
        .map((e) => e.trim())
        .where((e) => e.isNotEmpty)
        .toList();

    if (isEditing) {
      final updated = widget.note!.copyWith(
        title: _titleController.text.trim(),
        content: _contentController.text,
        keywords: keywords,
        triggerWords: triggers,
      );
      await ref.read(notesControllerProvider.notifier).updateNote(updated);
    } else {
      await ref
          .read(notesControllerProvider.notifier)
          .createNote(
            title: _titleController.text.trim(),
            content: _contentController.text,
            keywords: keywords,
            triggerWords: triggers,
          );
    }

    if (mounted) Navigator.of(context).pop();
  }
}
