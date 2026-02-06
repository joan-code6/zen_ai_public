import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../controllers/notes_controller.dart';
import '../data/note_models.dart';

class NotesDrawer extends ConsumerWidget {
  const NotesDrawer({
    super.key,
    required this.onCreateNote,
    required this.onOpenNote,
  });

  final VoidCallback onCreateNote;
  final void Function(Note note) onOpenNote;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notesState = ref.watch(notesControllerProvider);

    ref.listen(notesControllerProvider, (previous, next) {
      if (next.hasError) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(next.error.toString())));
      }
    });

    return Drawer(
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 16, 16, 12),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Knowledge base',
                          style: Theme.of(context)
                              .textTheme
                              .headlineSmall
                              ?.copyWith(fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'Swipe left to keep context handy for the assistant.',
                          style: Theme.of(context)
                              .textTheme
                              .bodyMedium
                              ?.copyWith(color: Colors.grey[600]),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () => ref.refresh(notesControllerProvider),
                    icon: const Icon(Icons.refresh),
                    tooltip: 'Refresh notes',
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: () {
                    Navigator.of(context).pop();
                    onCreateNote();
                  },
                  icon: const Icon(Icons.post_add),
                  label: const Text('New note'),
                ),
              ),
            ),
            const SizedBox(height: 12),
            Expanded(
              child: notesState.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (error, _) => _DrawerMessage(
                  icon: Icons.error_outline,
                  message: error.toString(),
                ),
                data: (notes) {
                  if (notes.isEmpty) {
                    return const _EmptyDrawerState();
                  }
                  return ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                    itemBuilder: (context, index) {
                      final note = notes[index];
                      return _NoteDrawerTile(
                        note: note,
                        onTap: () {
                          Navigator.of(context).pop();
                          onOpenNote(note);
                        },
                        onDelete: () => ref
                            .read(notesControllerProvider.notifier)
                            .deleteNote(note.id),
                      );
                    },
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemCount: notes.length,
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NoteDrawerTile extends StatelessWidget {
  const _NoteDrawerTile({
    required this.note,
    required this.onTap,
    required this.onDelete,
  });

  final Note note;
  final VoidCallback onTap;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: theme.colorScheme.surface,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(
                backgroundColor:
                    theme.colorScheme.secondary.withValues(alpha: 0.12),
                child: Icon(Icons.note_alt_outlined,
                    color: theme.colorScheme.secondary),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      note.title,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      note.excerpt ?? note.content,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                icon: const Icon(Icons.delete_outline),
                onPressed: onDelete,
                tooltip: 'Delete note',
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EmptyDrawerState extends StatelessWidget {
  const _EmptyDrawerState();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return _DrawerMessage(
      icon: Icons.note_alt_outlined,
      message: 'No notes yet',
      description:
          'Keep important facts, preferences, and reminders here for quick reference.',
      accentColor: theme.colorScheme.secondary,
    );
  }
}

class _DrawerMessage extends StatelessWidget {
  const _DrawerMessage({
    required this.icon,
    required this.message,
    this.description,
    this.accentColor,
  });

  final IconData icon;
  final String message;
  final String? description;
  final Color? accentColor;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircleAvatar(
              radius: 36,
              backgroundColor: (accentColor ?? theme.colorScheme.secondary)
                  .withValues(alpha: 0.1),
              child: Icon(
                icon,
                size: 32,
                color: accentColor ?? theme.colorScheme.secondary,
              ),
            ),
            const SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: theme.textTheme.titleMedium,
            ),
            if (description != null) ...[
              const SizedBox(height: 8),
              Text(
                description!,
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
