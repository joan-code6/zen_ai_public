import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/data/auth_models.dart';
import '../../chats/controllers/chat_list_controller.dart';
import '../../chats/data/chat_models.dart';
import '../../chats/presentation/chat_detail_screen.dart';
import '../../chats/presentation/chats_page.dart';
import '../../notes/data/note_models.dart';
import '../../notes/presentation/note_editor_screen.dart';
import '../../notes/presentation/note_detail_screen.dart';
import '../../notes/presentation/notes_page.dart';
import '../../settings/presentation/settings_page.dart';
import 'package:zen_ai/src/shared/widgets/sidebar_swipe_region.dart';

class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key, required this.session});

  final AuthSession session;

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  final TextEditingController _messageController = TextEditingController();
  bool _isSending = false;

  @override
  void dispose() {
    _messageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final chatsState = ref.watch(chatListControllerProvider);

    ref.listen(chatListControllerProvider, (previous, next) {
      if (next.hasError) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(next.error.toString())),
        );
      }
    });

    final screenWidth = MediaQuery.of(context).size.width;

    return SidebarSwipeRegion(
      onSwipeRight: _openChatsSidebar,
      onSwipeLeft: _openNotesSidebar,
      child: Scaffold(
        key: _scaffoldKey,
        drawerEdgeDragWidth: screenWidth,
        drawer: ChatsDrawer(
          onOpenChat: _openExistingChat,
          onStartNewChat: _showNewChatScreen,
          onOpenSettings: _showSettingsSheet,
          session: widget.session,
        ),
        endDrawer: NotesDrawer(
          onCreateNote: _openCreateNote,
          onOpenNote: _openNote,
        ),
        body: SafeArea(
          child: Column(
            children: [
              _HomeHeader(
                session: widget.session,
                onMenuTap: _openChatsSidebar,
                onNotesTap: _openNotesSidebar,
              ),
              Expanded(
                child: _NewChatOverview(
                  chatsState: chatsState,
                  onOpenChat: _openExistingChat,
                  onRetry: () => ref.refresh(chatListControllerProvider),
                ),
              ),
              _ComposeSection(
                controller: _messageController,
                onSend: _handleSend,
                isSending: _isSending,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _handleSend() async {
    final text = _messageController.text.trim();
    if (text.isEmpty || _isSending) {
      return;
    }

    FocusScope.of(context).unfocus();
    setState(() => _isSending = true);

    try {
      final summary =
          await ref.read(chatListControllerProvider.notifier).createChat();
      if (!mounted) return;

      _messageController.clear();

      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => ChatDetailScreen(
            chatId: summary.id,
            initialTitle: summary.title ?? 'New chat',
            initialMessage: text,
            onRequestChatsSidebar: _openChatsSidebar,
            onRequestNotesSidebar: _openNotesSidebar,
          ),
        ),
      );

      if (!mounted) return;
      ref.invalidate(chatListControllerProvider);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to start chat: $error')),
      );
    } finally {
      if (mounted) {
        setState(() => _isSending = false);
      }
    }
  }

  Future<void> _showSettingsSheet() async {
    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => SettingsSheet(session: widget.session),
    );
  }

  Future<void> _openCreateNote() async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => NoteEditorScreen(
          onRequestChatsSidebar: _openChatsSidebar,
          onRequestNotesSidebar: _openNotesSidebar,
        ),
        fullscreenDialog: true,
      ),
    );
  }

  Future<void> _openNote(Note note) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => NoteDetailScreen(
          note: note,
          onRequestChatsSidebar: _openChatsSidebar,
          onRequestNotesSidebar: _openNotesSidebar,
        ),
      ),
    );
  }

  void _openExistingChat(ChatSummary chat) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ChatDetailScreen(
          chatId: chat.id,
          initialTitle: chat.title ?? 'Chat',
          onRequestChatsSidebar: _openChatsSidebar,
          onRequestNotesSidebar: _openNotesSidebar,
        ),
      ),
    );
  }

  void _openChatsSidebar() {
    _navigateToRootAnd(() {
      if (!mounted) return;
      if (_scaffoldKey.currentState?.isEndDrawerOpen ?? false) {
        _scaffoldKey.currentState?.closeEndDrawer();
      }
      if (_scaffoldKey.currentState?.isDrawerOpen ?? false) return;
      _scaffoldKey.currentState?.openDrawer();
    });
  }

  void _openNotesSidebar() {
    _navigateToRootAnd(() {
      if (!mounted) return;
      if (_scaffoldKey.currentState?.isDrawerOpen ?? false) {
        _scaffoldKey.currentState?.closeDrawer();
      }
      if (_scaffoldKey.currentState?.isEndDrawerOpen ?? false) return;
      _scaffoldKey.currentState?.openEndDrawer();
    });
  }

  void _navigateToRootAnd(VoidCallback action) {
    if (!mounted) return;
    final navigator = Navigator.of(context);
    final canPop = navigator.canPop();
    if (canPop) {
      navigator.popUntil((route) => route.isFirst);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) action();
      });
    } else {
      action();
    }
  }

  void _showNewChatScreen() {
    _navigateToRootAnd(() {
      if (!mounted) return;
      final scaffoldState = _scaffoldKey.currentState;
      scaffoldState?.closeDrawer();
      scaffoldState?.closeEndDrawer();
    });
  }
}

class _HomeHeader extends StatelessWidget {
  const _HomeHeader({
    required this.session,
    required this.onMenuTap,
    required this.onNotesTap,
  });

  final AuthSession session;
  final VoidCallback onMenuTap;
  final VoidCallback onNotesTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 8, 24, 16),
      child: Row(
        children: [
          IconButton(
            onPressed: onMenuTap,
            icon: const Icon(Icons.menu_rounded),
            tooltip: 'Chats',
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Zen AI',
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  'Good ${_greeting()}, ${session.displayName ?? session.email}',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            onPressed: onNotesTap,
            icon: const Icon(Icons.note_alt_outlined),
            tooltip: 'Notes',
          ),
        ],
      ),
    );
  }

  String _greeting() {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  }
}

class _NewChatOverview extends StatelessWidget {
  const _NewChatOverview({
    required this.chatsState,
    required this.onOpenChat,
    required this.onRetry,
  });

  final AsyncValue<List<ChatSummary>> chatsState;
  final void Function(ChatSummary chat) onOpenChat;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: LayoutBuilder(
        builder: (context, constraints) {
          return SingleChildScrollView(
            padding: const EdgeInsets.only(bottom: 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const _HeroCard(),
                const SizedBox(height: 24),
                chatsState.when(
                  data: (chats) {
                    if (chats.isEmpty) {
                      return const _EmptyHistoryCard();
                    }
                    final recent = chats.take(4).toList();
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Jump back in',
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Wrap(
                          spacing: 12,
                          runSpacing: 12,
                          children: [
                            for (final chat in recent)
                              _ChatChip(
                                chat: chat,
                                onTap: () => onOpenChat(chat),
                              ),
                          ],
                        ),
                      ],
                    );
                  },
                  loading: () => const _LoadingHistoryCard(),
                  error: (error, _) => _ErrorHistoryCard(
                    message: error.toString(),
                    onRetry: onRetry,
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _HeroCard extends StatelessWidget {
  const _HeroCard();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = [
      theme.colorScheme.primary,
      theme.colorScheme.primary.withValues(alpha: 0.75),
    ];
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: colors,
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(28),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Start a fresh conversation',
            style: theme.textTheme.headlineSmall?.copyWith(
              color: theme.colorScheme.onPrimary,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Ask a question, brainstorm ideas, or drop a task. Swipe from the edges to revisit chats or pull in notes.',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onPrimary.withValues(alpha: 0.9),
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyHistoryCard extends StatelessWidget {
  const _EmptyHistoryCard();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      elevation: 0,
      color: theme.colorScheme.surfaceContainerHigh,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Your first chat awaits',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Type a message below and we\'ll create a conversation once you send it.',
              style: theme.textTheme.bodyMedium,
            ),
          ],
        ),
      ),
    );
  }
}

class _LoadingHistoryCard extends StatelessWidget {
  const _LoadingHistoryCard();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(
              strokeWidth: 3,
              valueColor:
                  AlwaysStoppedAnimation(theme.colorScheme.primary),
            ),
            const SizedBox(width: 16),
            Text(
              'Fetching your chats…',
              style: theme.textTheme.bodyMedium,
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorHistoryCard extends StatelessWidget {
  const _ErrorHistoryCard({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      elevation: 0,
      color: theme.colorScheme.errorContainer,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Unable to load chats',
              style: theme.textTheme.titleMedium?.copyWith(
                color: theme.colorScheme.onErrorContainer,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              message,
              style: theme.textTheme.bodyMedium?.copyWith(
                color:
                    theme.colorScheme.onErrorContainer.withValues(alpha: 0.85),
              ),
            ),
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: onRetry,
                style: TextButton.styleFrom(
                  foregroundColor: theme.colorScheme.onErrorContainer,
                ),
                child: const Text('Retry'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ChatChip extends StatelessWidget {
  const _ChatChip({required this.chat, required this.onTap});

  final ChatSummary chat;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final title =
        chat.title?.isNotEmpty == true ? chat.title! : 'Untitled chat';
    return ActionChip(
      avatar: const Icon(Icons.forum_outlined, size: 18),
      label: Text(title),
      onPressed: onTap,
    );
  }
}

class _ComposeSection extends StatelessWidget {
  const _ComposeSection({
    required this.controller,
    required this.onSend,
    required this.isSending,
  });

  final TextEditingController controller;
  final VoidCallback onSend;
  final bool isSending;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final composerColor = theme.colorScheme.surfaceContainerHigh;
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: composerColor,
            borderRadius: BorderRadius.circular(28),
            boxShadow: const [
              BoxShadow(
                color: Colors.black12,
                blurRadius: 16,
                offset: Offset(0, 8),
              ),
            ],
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: controller,
                    minLines: 1,
                    maxLines: 5,
                    decoration: InputDecoration(
                      filled: true,
                      fillColor: composerColor,
                      border: InputBorder.none,
                      hintText: 'Tell Zen AI what you need…',
                    ),
                    textInputAction: TextInputAction.send,
                    onSubmitted: (_) => onSend(),
                    enabled: !isSending,
                  ),
                ),
                const SizedBox(width: 12),
                FilledButton(
                  onPressed: isSending ? null : onSend,
                  style: FilledButton.styleFrom(
                    padding: const EdgeInsets.all(16),
                    shape: const CircleBorder(),
                  ),
                  child: isSending
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.send_rounded),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
