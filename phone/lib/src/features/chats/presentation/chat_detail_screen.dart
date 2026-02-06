import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:zen_ai/src/shared/widgets/sidebar_swipe_region.dart';
import '../../auth/controllers/auth_controller.dart';
import '../../auth/data/auth_models.dart';
import '../../notes/data/note_models.dart';
import '../../notes/presentation/note_detail_screen.dart';
import '../../notes/presentation/note_editor_screen.dart';
import '../../notes/presentation/notes_page.dart';
import '../../settings/presentation/settings_page.dart';
import '../../chats/presentation/chats_page.dart';
import '../controllers/chat_detail_controller.dart';
import '../data/chat_models.dart';

class ChatDetailScreen extends ConsumerStatefulWidget {
  const ChatDetailScreen({
    super.key,
    required this.chatId,
    required this.initialTitle,
    this.initialMessage,
    this.onRequestChatsSidebar,
    this.onRequestNotesSidebar,
  });

  final String chatId;
  final String initialTitle;
  final String? initialMessage;
  final VoidCallback? onRequestChatsSidebar;
  final VoidCallback? onRequestNotesSidebar;

  @override
  ConsumerState<ChatDetailScreen> createState() => _ChatDetailScreenState();
}

class _ChatDetailScreenState extends ConsumerState<ChatDetailScreen> {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  final TextEditingController _messageController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  bool _initialMessageQueued = false;

  @override
  void dispose() {
    _messageController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final detailState = ref.watch(chatDetailControllerProvider(widget.chatId));
    final authState = ref.watch(authControllerProvider);
    final AuthSession? session = authState.value?.session;

    ref.listen(chatDetailControllerProvider(widget.chatId), (previous, next) {
      if (next.hasError) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(next.error.toString())));
      }
      if (next.hasValue) {
        _maybeSendInitialMessage();
        final previousMessages = previous?.value?.messages ?? const [];
        final nextMessages = next.value?.messages ?? const [];
        if (nextMessages.isNotEmpty) {
          final prevLast = previousMessages.isNotEmpty ? previousMessages.last : null;
          final nextLast = nextMessages.last;
          final shouldScroll = prevLast == null ||
              prevLast.id != nextLast.id ||
              prevLast.content.length != nextLast.content.length;
          if (shouldScroll) {
            _scrollToBottom();
          }
        }
      }
    });

    final title = detailState.value?.chat.title ?? widget.initialTitle;

    return SidebarSwipeRegion(
      onSwipeRight: _openChatsDrawer,
      onSwipeLeft: _openNotesDrawer,
      child: Scaffold(
        key: _scaffoldKey,
        drawerEdgeDragWidth: MediaQuery.of(context).size.width,
        drawer: session == null
            ? null
            : ChatsDrawer(
                session: session,
                onOpenSettings: () => _showSettingsSheet(session),
                onOpenChat: _handleOpenChat,
                onStartNewChat: _handleStartNewChat,
              ),
        endDrawer: NotesDrawer(
          onCreateNote: _openCreateNote,
          onOpenNote: _openNote,
        ),
        appBar: AppBar(
          automaticallyImplyLeading: false,
          leading: IconButton(
            onPressed: _openChatsDrawer,
            icon: const Icon(Icons.menu_rounded),
            tooltip: 'Chats',
          ),
          title: Text(title.isEmpty ? 'Chat' : title),
          actions: [
            IconButton(
              onPressed: _openNotesDrawer,
              icon: const Icon(Icons.note_alt_outlined),
              tooltip: 'Notes',
            ),
          ],
        ),
        body: detailState.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, stack) => Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(error.toString(), textAlign: TextAlign.center),
            ),
          ),
          data: (detail) {
            return Column(
              children: [
                Expanded(
                  child: ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 24,
                    ),
                    itemCount: detail.messages.length,
                    itemBuilder: (context, index) {
                      final message = detail.messages[index];
                      final alignEnd = message.role == MessageRole.user;
                      final isTyping =
                          message.role == MessageRole.assistant &&
                          message.content.trim().isEmpty;
                      return Align(
                        alignment: alignEnd
                            ? Alignment.centerRight
                            : Alignment.centerLeft,
                        child: Container(
                          margin: const EdgeInsets.symmetric(vertical: 6),
                          padding: const EdgeInsets.all(16),
                          constraints: const BoxConstraints(maxWidth: 320),
                          decoration: BoxDecoration(
                            color: alignEnd
                                ? Theme.of(context)
                                    .colorScheme
                                    .primaryContainer
                                : Colors.white,
                            borderRadius: BorderRadius.circular(16),
                            boxShadow: const [
                              BoxShadow(
                                color: Colors.black12,
                                blurRadius: 6,
                                offset: Offset(0, 3),
                              ),
                            ],
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              if (isTyping)
                                const _TypingIndicator()
                              else
                                SelectableText(
                                  message.content,
                                  style:
                                      Theme.of(context).textTheme.bodyMedium,
                                ),
                              if (message.fileIds.isNotEmpty)
                                Padding(
                                  padding: const EdgeInsets.only(top: 8),
                                  child: Wrap(
                                    spacing: 8,
                                    runSpacing: 8,
                                    children: [
                                      for (final id in message.fileIds)
                                        Chip(
                                          avatar: const Icon(
                                            Icons.attach_file,
                                            size: 18,
                                          ),
                                          label: Text(
                                            'Attachment ${id.substring(0, 6)}',
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
                _Composer(
                  controller: _messageController,
                  onSend: _handleSend,
                  onAttach: _handleAttach,
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _maybeSendInitialMessage();
  }

  Future<void> _handleSend() async {
    final text = _messageController.text.trim();
    if (text.isEmpty) return;
    _messageController.clear();

    try {
      await ref
          .read(chatDetailControllerProvider(widget.chatId).notifier)
          .sendMessage(text);
    } catch (error) {
      if (!mounted) return;
      _messageController.text = text;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to send message: $error')),
      );
    }
  }

  Future<void> _handleAttach() async {
    final result = await FilePicker.platform.pickFiles();
    if (result == null || result.files.isEmpty) return;
    final file = result.files.first;
    try {
      await ref
          .read(chatDetailControllerProvider(widget.chatId).notifier)
          .attachFile(file);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to attach file: $error')),
      );
    }
  }

  void _maybeSendInitialMessage() {
    if (_initialMessageQueued) return;
    final message = widget.initialMessage;
    if (message == null || message.trim().isEmpty) {
      _initialMessageQueued = true;
      return;
    }
    final detailState = ref.read(chatDetailControllerProvider(widget.chatId));
    if (!detailState.hasValue) {
      return;
    }
    _initialMessageQueued = true;
    Future.microtask(() async {
      await ref
          .read(chatDetailControllerProvider(widget.chatId).notifier)
          .sendMessage(message);
      if (!mounted) return;
      _scrollToBottom();
    });
  }

  void _openChatsDrawer() {
    FocusScope.of(context).unfocus();
    if (_scaffoldKey.currentState?.hasDrawer ?? false) {
      _scaffoldKey.currentState?.openDrawer();
    } else {
      widget.onRequestChatsSidebar?.call();
    }
  }

  void _openNotesDrawer() {
    FocusScope.of(context).unfocus();
    if (_scaffoldKey.currentState?.hasEndDrawer ?? false) {
      _scaffoldKey.currentState?.openEndDrawer();
    } else {
      widget.onRequestNotesSidebar?.call();
    }
  }

  void _handleStartNewChat() {
    Navigator.of(context).popUntil((route) => route.isFirst);
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scrollController.hasClients) return;
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent + 80,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );
    });
  }

  Future<void> _showSettingsSheet(AuthSession session) async {
    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => SettingsSheet(session: session),
    );
  }

  Future<void> _handleOpenChat(ChatSummary chat) async {
    _scaffoldKey.currentState?.closeDrawer();
    if (chat.id == widget.chatId) {
      return;
    }
    await Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => ChatDetailScreen(
          chatId: chat.id,
          initialTitle: chat.title ?? 'Chat',
          onRequestChatsSidebar: widget.onRequestChatsSidebar,
          onRequestNotesSidebar: widget.onRequestNotesSidebar,
        ),
      ),
    );
  }

  Future<void> _openCreateNote() async {
    _scaffoldKey.currentState?.closeEndDrawer();
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => NoteEditorScreen(
          onRequestChatsSidebar: widget.onRequestChatsSidebar,
          onRequestNotesSidebar: widget.onRequestNotesSidebar,
        ),
        fullscreenDialog: true,
      ),
    );
  }

  Future<void> _openNote(Note note) async {
    _scaffoldKey.currentState?.closeEndDrawer();
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => NoteDetailScreen(
          note: note,
          onRequestChatsSidebar: widget.onRequestChatsSidebar,
          onRequestNotesSidebar: widget.onRequestNotesSidebar,
        ),
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  const _Composer({
    required this.controller,
    required this.onSend,
    required this.onAttach,
  });

  final TextEditingController controller;
  final VoidCallback onSend;
  final VoidCallback onAttach;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          boxShadow: [
            BoxShadow(
              color: Colors.black12,
              blurRadius: 8,
              offset: Offset(0, -2),
            ),
          ],
        ),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            IconButton(
              onPressed: onAttach,
              icon: const Icon(Icons.attach_file),
            ),
            Expanded(
              child: TextField(
                controller: controller,
                minLines: 1,
                maxLines: 5,
                decoration: const InputDecoration(
                  hintText: 'Type your message…',
                  border: OutlineInputBorder(),
                ),
              ),
            ),
            const SizedBox(width: 8),
            FilledButton(onPressed: onSend, child: const Icon(Icons.send)),
          ],
        ),
      ),
    );
  }
}

class _TypingIndicator extends StatefulWidget {
  const _TypingIndicator();

  @override
  State<_TypingIndicator> createState() => _TypingIndicatorState();
}

class _TypingIndicatorState extends State<_TypingIndicator>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).colorScheme.onSurfaceVariant;
    return AnimatedBuilder(
      animation: _controller,
      builder: (_, __) {
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: List.generate(3, (index) {
            final phase = (_controller.value + index * 0.2) % 1.0;
            final opacity = phase < 0.5
                ? 0.3 + phase
                : 0.3 + (1.0 - phase);
            final displayOpacity = opacity.clamp(0.3, 1.0).toDouble();
            return Opacity(
              opacity: displayOpacity,
              child: Padding(
                padding: EdgeInsets.only(right: index == 2 ? 0 : 4),
                child: Icon(Icons.circle, size: 8, color: color),
              ),
            );
          }),
        );
      },
    );
  }
}
