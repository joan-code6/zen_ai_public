import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/data/auth_models.dart';
import '../controllers/chat_list_controller.dart';
import '../data/chat_models.dart';

class ChatsDrawer extends ConsumerStatefulWidget {
  const ChatsDrawer({
    super.key,
    required this.onOpenChat,
    required this.onStartNewChat,
    required this.onOpenSettings,
    required this.session,
  });

  final void Function(ChatSummary chat) onOpenChat;
  final VoidCallback onStartNewChat;
  final VoidCallback onOpenSettings;
  final AuthSession session;

  @override
  ConsumerState<ChatsDrawer> createState() => _ChatsDrawerState();
}

class _ChatsDrawerState extends ConsumerState<ChatsDrawer> {
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _searchController.addListener(_handleSearchChanged);
  }

  @override
  void dispose() {
    _searchController.removeListener(_handleSearchChanged);
    _searchController.dispose();
    super.dispose();
  }

  void _handleSearchChanged() {
    final next = _searchController.text;
    if (next == _searchQuery) return;
    setState(() => _searchQuery = next);
  }

  void _handleCreateChat(BuildContext context) {
    Navigator.of(context).pop();
    widget.onStartNewChat();
  }

  List<ChatSummary> _filterChats(List<ChatSummary> chats) {
    final query = _searchQuery.trim().toLowerCase();
    if (query.isEmpty) return chats;
    return chats.where((chat) {
      final title = chat.title ?? '';
      final prompt = chat.systemPrompt ?? '';
      return title.toLowerCase().contains(query) ||
          prompt.toLowerCase().contains(query);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final chatsState = ref.watch(chatListControllerProvider);
    final messenger = ScaffoldMessenger.of(context);

    ref.listen(chatListControllerProvider, (previous, next) {
      if (next.hasError) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(next.error.toString())));
      }
    });

    Future<void> showChatActions(ChatSummary chat) async {
      final action = await showModalBottomSheet<_ChatAction>(
        context: context,
        builder: (sheetContext) => SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.edit_rounded),
                title: const Text('Rename chat'),
                onTap: () => Navigator.of(sheetContext).pop(_ChatAction.rename),
              ),
              ListTile(
                leading: const Icon(Icons.delete_outline),
                title: const Text('Delete chat'),
                onTap: () => Navigator.of(sheetContext).pop(_ChatAction.delete),
              ),
            ],
          ),
        ),
      );

      if (!context.mounted) return;
      if (action == null) return;

      switch (action) {
        case _ChatAction.rename:
          final controller = TextEditingController(text: chat.title ?? '');
          final newTitle = await showDialog<String>(
            context: context,
            builder: (dialogContext) => AlertDialog(
              title: const Text('Rename chat'),
              content: TextField(
                controller: controller,
                textInputAction: TextInputAction.done,
                autofocus: true,
                decoration: const InputDecoration(
                  labelText: 'Chat title',
                  hintText: 'E.g. Weekend plans',
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  child: const Text('Cancel'),
                ),
                FilledButton(
                  onPressed: () => Navigator.of(dialogContext)
                      .pop(controller.text.trim()),
                  child: const Text('Save'),
                ),
              ],
            ),
          );

          if (!context.mounted) return;

          if (newTitle != null && newTitle.trim().isNotEmpty) {
            await ref
                .read(chatListControllerProvider.notifier)
                .renameChat(chatId: chat.id, title: newTitle.trim());
            if (!context.mounted) return;
            messenger.showSnackBar(
              const SnackBar(content: Text('Chat renamed')),
            );
          }
          break;
        case _ChatAction.delete:
          final shouldDelete = await showDialog<bool>(
            context: context,
            builder: (dialogContext) => AlertDialog(
              title: const Text('Delete chat?'),
              content: const Text(
                'This will remove the chat and all messages forever.',
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(dialogContext).pop(false),
                  child: const Text('Cancel'),
                ),
                FilledButton(
                  onPressed: () => Navigator.of(dialogContext).pop(true),
                  child: const Text('Delete'),
                ),
              ],
            ),
          );

          if (!context.mounted) return;

          if (shouldDelete == true) {
            await ref
                .read(chatListControllerProvider.notifier)
                .deleteChat(chat.id);
            if (!context.mounted) return;
            messenger.showSnackBar(
              const SnackBar(content: Text('Chat deleted')),
            );
          }
          break;
      }
    }

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
                          'Your chats',
                          style: Theme.of(context)
                              .textTheme
                              .headlineSmall
                              ?.copyWith(fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'Swipe here anytime to jump back into a conversation.',
                          style: Theme.of(context)
                              .textTheme
                              .bodyMedium
                              ?.copyWith(color: Colors.grey[600]),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () => ref.refresh(chatListControllerProvider),
                    icon: const Icon(Icons.refresh),
                    tooltip: 'Refresh chats',
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 0, 24, 12),
              child: TextField(
                controller: _searchController,
                textInputAction: TextInputAction.search,
                decoration: InputDecoration(
                  prefixIcon: const Icon(Icons.search_rounded),
                  hintText: 'Search chats',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                  ),
                  isDense: true,
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 0, 24, 16),
              child: FilledButton.icon(
                onPressed: () => _handleCreateChat(context),
                icon: const Icon(Icons.add_comment_rounded),
                label: const Text('Start new chat'),
              ),
            ),
            Expanded(
              child: chatsState.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (error, stack) => _DrawerMessage(
                  icon: Icons.error_outline,
                  message: error.toString(),
                ),
                data: (chats) {
                  if (chats.isEmpty && _searchQuery.isEmpty) {
                    return const _EmptyDrawerState();
                  }

                  final filtered = _filterChats(chats);
                  if (filtered.isEmpty) {
                    return _DrawerMessage(
                      icon: Icons.search_off_rounded,
                      message: _searchQuery.trim().isEmpty
                          ? 'No conversations yet.'
                          : 'No chats match “${_searchQuery.trim()}”.',
                      description: _searchQuery.trim().isEmpty
                          ? 'Start a conversation to see it appear here.'
                          : 'Try a different keyword or clear the search field.',
                    );
                  }

                  return ListView.separated(
                    padding: const EdgeInsets.fromLTRB(8, 0, 8, 24),
                    itemBuilder: (context, index) {
                      final chat = filtered[index];
                      return _ChatDrawerTile(
                        chat: chat,
                        onTap: () => widget.onOpenChat(chat),
                        onLongPress: () => showChatActions(chat),
                      );
                    },
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemCount: filtered.length,
                  );
                },
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 12, 24, 24),
              child: _AccountTile(
                session: widget.session,
                onTap: widget.onOpenSettings,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ChatDrawerTile extends StatelessWidget {
  const _ChatDrawerTile({
    required this.chat,
    required this.onTap,
    this.onLongPress,
  });

  final ChatSummary chat;
  final VoidCallback onTap;
  final VoidCallback? onLongPress;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return InkWell(
      splashColor: Colors.transparent,
      highlightColor: Colors.transparent,
      onTap: () {
        Navigator.of(context).pop();
        onTap();
      },
      onLongPress: onLongPress,
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Text(
                chat.title?.isNotEmpty == true
                    ? chat.title!
                    : 'Untitled chat',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

enum _ChatAction { rename, delete }

class _EmptyDrawerState extends StatelessWidget {
  const _EmptyDrawerState();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return _DrawerMessage(
      icon: Icons.chat_bubble_outline,
      message:
          'No conversations yet. Send a message from the home screen to start.',
      description: 'Zen AI will generate a name for you once the assistant replies.',
      accentColor: theme.colorScheme.primary,
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
              backgroundColor: (accentColor ?? theme.colorScheme.primary)
                  .withValues(alpha: 0.1),
              child: Icon(icon,
                  size: 32, color: accentColor ?? theme.colorScheme.primary),
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

class _AccountTile extends StatelessWidget {
  const _AccountTile({required this.session, required this.onTap});

  final AuthSession session;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: theme.colorScheme.surfaceContainerHigh,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: () {
          Navigator.of(context).pop();
          onTap();
        },
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              CircleAvatar(
                backgroundColor:
                    theme.colorScheme.primary.withValues(alpha: 0.15),
                child: Text(
                  session.email.isNotEmpty
                      ? session.email[0].toUpperCase()
                      : '?',
                  style: theme.textTheme.titleMedium,
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      session.displayName?.isNotEmpty == true
                          ? session.displayName!
                          : session.email,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'View settings',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.settings_outlined),
            ],
          ),
        ),
      ),
    );
  }
}
