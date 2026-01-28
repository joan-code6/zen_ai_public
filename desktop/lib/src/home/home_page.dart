import 'dart:async';

import 'package:flex_color_picker/flex_color_picker.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mime/mime.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/chat.dart';
import '../models/note.dart';
import '../models/email.dart';
import '../workspace/workspace.dart';
import '../sidebar/sidebar.dart';
import '../sidebar/notes_panel.dart';
import '../state/app_state.dart';
import '../state/user_preferences.dart';
import '../services/backend_service.dart';
import '../services/email_service.dart';
import '../widgets/custom_title_bar.dart';
import '../widgets/window_animator.dart';
import '../i18n/i18n.dart';
import 'calendar_page.dart';
import 'email_page.dart';

class ZenHomePage extends StatefulWidget {
  final AppState appState;
  final ThemeMode themeMode;
  final ValueChanged<ThemeMode> onThemeModeChanged;
  final Color seedColor;
  final ValueChanged<Color> onSeedColorChanged;

  const ZenHomePage({
    super.key,
    required this.appState,
    required this.themeMode,
    required this.onThemeModeChanged,
    required this.seedColor,
    required this.onSeedColorChanged,
  });

  @override
  State<ZenHomePage> createState() => _ZenHomePageState();
}

class _ZenHomePageState extends State<ZenHomePage> {
  late AppState _appState;
  // 0 = New Chat, 1 = Search, 2 = Notes, 3 = Email, 4 = Calendar
  int _selectedIndex = 0;

  // currently selected note shown in the right-side notes panel
  Note? _notesPanelSelectedNote;
  String? _selectedChatId;
  // Spotlight overlay search controller
  final TextEditingController _spotlightController = TextEditingController();
  String _spotlightQuery = '';
  bool _showUserOverlay = false;
  final List<_ComposerPendingAttachment> _composerPendingAttachments = [];

  @override
  void initState() {
    super.initState();
    _appState = widget.appState;
    _appState.addListener(_onAppStateChanged);
    _spotlightController.addListener(() {
      setState(() => _spotlightQuery = _spotlightController.text);
    });
  }

  @override
  void didUpdateWidget(covariant ZenHomePage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(oldWidget.appState, widget.appState)) {
      oldWidget.appState.removeListener(_onAppStateChanged);
      _appState = widget.appState;
      _appState.addListener(_onAppStateChanged);
    }
  }

  @override
  void dispose() {
    _appState.removeListener(_onAppStateChanged);
    _spotlightController.dispose();
    super.dispose();
  }

  void _onAppStateChanged() {
    if (!mounted) return;

    final error = _appState.consumeError();
    final info = _appState.consumeInfo();

    if (error != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(error),
            backgroundColor: Theme.of(context).colorScheme.errorContainer,
          ),
        );
      });
    }
    if (info != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(info)));
      });
    }

    final selected = _selectedChatId;
    final selectedNoteId = _notesPanelSelectedNote?.id;
    final refreshedNote = selectedNoteId != null
        ? _appState.noteById(selectedNoteId)
        : null;

    setState(() {
      if (selected != null && _appState.chatById(selected) == null) {
        _selectedChatId = null;
      }
      if (selectedNoteId != null) {
        _notesPanelSelectedNote = refreshedNote;
      }
    });
  }

  void _onSidebarItemSelected(int index) {
    setState(() {
      _selectedIndex = index;
      _showUserOverlay = false;
    });
  }

  void _onNoteSelected(Note note) {
    setState(() {
      // show the clicked note inside the right-hand notes panel
      _notesPanelSelectedNote = note;
      // ensure Notes tab is visible
      _selectedIndex = 2;
    });
  }

  void _onCreateNote() async {
    if (!_appState.isAuthenticated) {
      _openUserOverlay();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.t('please_sign_in_create_notes'))),
        );
      });
      return;
    }

    final created = await _appState.createNote(title: context.t('new_note'));
    if (!mounted || created == null) return;
    setState(() {
      _notesPanelSelectedNote = created;
      _selectedIndex = 2;
    });
  }

  void _onCloseNoteInPanel() {
    setState(() => _notesPanelSelectedNote = null);
  }

  void _onCloseNotesPanel() {
    setState(() {
      _notesPanelSelectedNote = null;
      _selectedIndex = 0;
    });
  }

  void _onSaveNote(Note updated) async {
    final saved = await _appState.updateNote(
      noteId: updated.id,
      title: updated.title,
      content: updated.content,
      keywords: updated.keywords,
      triggerWords: updated.triggerWords,
    );
    if (!mounted || saved == null) return;
    setState(() {
      _notesPanelSelectedNote = saved;
    });
  }

  void _onDeleteNote(Note toDelete) async {
    final removed = await _appState.deleteNote(toDelete.id);
    if (!mounted || !removed) return;
    setState(() {
      if (_notesPanelSelectedNote?.id == toDelete.id) {
        _notesPanelSelectedNote = null;
      }
    });
  }

  void _onCreateChat() {
    setState(() {
      // instead of creating a chat immediately, open the central composer
      // the actual chat will be created when the user sends the first message
      _selectedChatId = null;
      _selectedIndex = 0; // focus workspace which shows the big composer
    });
  }

  void _onSelectChat(String id) {
    setState(() {
      _selectedChatId = id;
      _selectedIndex = 0; // focus workspace which shows chat
      _composerPendingAttachments.clear();
    });
    _preloadChat(id);
  }

  Future<void> _preloadChat(String chatId) async {
    await _appState.ensureChatLoaded(chatId);
  }

  Future<void> _onRenameChat(String id) async {
    final chat = _appState.chatById(id);
    if (chat == null) return;

    final controller = TextEditingController(text: chat.title ?? '');

    final updatedName = await showDialog<String>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: Text(context.t('rename_chat')),
          content: TextField(
            controller: controller,
            autofocus: true,
            decoration: InputDecoration(labelText: context.t('chat_name')),
            onSubmitted: (value) => Navigator.of(dialogContext).pop(value),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: Text(context.t('cancel')),
            ),
            FilledButton(
              onPressed: () =>
                  Navigator.of(dialogContext).pop(controller.text.trim()),
              child: Text(context.t('save')),
            ),
          ],
        );
      },
    );

    controller.dispose();

    if (!mounted) return;

    final newTitle = updatedName?.trim();
    if (newTitle == null || newTitle.isEmpty) return;
    if (chat.title == newTitle) return;

    await _appState.updateChat(chatId: id, title: newTitle);
  }

  Future<void> _onDeleteChat(String id) async {
    final chat = _appState.chatById(id);
    if (chat == null) return;

    final chatTitle = chat.title ?? context.t('untitled_chat');

    final confirmed =
        await showDialog<bool>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            title: Text(context.t('delete_chat')),
            content: Text(
              context.t('delete_chat_confirm', args: {'chatTitle': chatTitle}),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(dialogContext).pop(false),
                child: Text(context.t('cancel')),
              ),
              FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: Theme.of(
                    dialogContext,
                  ).colorScheme.errorContainer,
                  foregroundColor: Theme.of(
                    dialogContext,
                  ).colorScheme.onErrorContainer,
                ),
                onPressed: () => Navigator.of(dialogContext).pop(true),
                child: Text(context.t('delete')),
              ),
            ],
          ),
        ) ??
        false;

    if (!mounted || !confirmed) return;

    await _appState.deleteChat(id);
    if (!mounted) return;
    if (_selectedChatId == id) {
      setState(() => _selectedChatId = null);
    }
  }

  Future<void> _sendMessage(
    String text, {
    List<String> fileIds = const [],
  }) async {
    final trimmed = text.trim();
    final hasText = trimmed.isNotEmpty;
    final draftsToUpload = _selectedChatId == null
        ? List<_ComposerPendingAttachment>.from(_composerPendingAttachments)
        : const <_ComposerPendingAttachment>[];
    final hasDraftFiles = draftsToUpload.isNotEmpty;
    final hasFiles = fileIds.isNotEmpty || hasDraftFiles;
    if (!hasText && !hasFiles) return;

    if (!_appState.isAuthenticated) {
      _openUserOverlay();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.t('please_sign_in_start_chat'))),
        );
      });
      return;
    }

    String? pendingChatId = _selectedChatId;

    if (pendingChatId == null) {
      final created = await _appState.createChat(
        title: _deriveChatTitle(hasText ? trimmed : ''),
      );
      if (created == null) return;
      pendingChatId = created.id;
      if (!mounted) return;
      setState(() {
        _selectedChatId = pendingChatId;
        _selectedIndex = 0;
      });
    }

    final String resolvedChatId = pendingChatId;
    final List<String> allFileIds = List<String>.from(fileIds);
    final List<String> uploadedDraftIds = [];
    var uploadFailed = false;

    if (draftsToUpload.isNotEmpty) {
      for (final draft in draftsToUpload) {
        final uploaded = await _appState.uploadChatFile(
          chatId: resolvedChatId,
          fileName: draft.fileName,
          bytes: draft.bytes,
          mimeType: draft.mimeType ?? 'application/octet-stream',
        );
        if (uploaded == null) {
          uploadFailed = true;
          break;
        }
        allFileIds.add(uploaded.id);
        uploadedDraftIds.add(draft.id);
      }
      if (uploadFailed) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(context.t('file_upload_failed_try_again')),
            ),
          );
        }
        return;
      }
      if (mounted && uploadedDraftIds.isNotEmpty) {
        setState(() {
          final idsToRemove = uploadedDraftIds.toSet();
          _composerPendingAttachments.removeWhere(
            (pending) => idsToRemove.contains(pending.id),
          );
        });
      }
    }

    await _appState.sendMessage(
      chatId: resolvedChatId,
      content: hasText ? trimmed : null,
      fileIds: allFileIds,
    );
    await _appState.ensureChatLoaded(resolvedChatId);
  }

  Future<ChatFile?> _uploadFileForChat(String chatId) async {
    if (!_appState.isAuthenticated) {
      _openUserOverlay();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.t('please_sign_in_upload_files'))),
        );
      });
      return null;
    }

    try {
      final result = await FilePicker.platform.pickFiles(
        allowMultiple: false,
        withData: true,
      );
      if (result == null || result.files.isEmpty) {
        return null;
      }
      final file = result.files.first;
      final bytes = file.bytes;
      if (bytes == null) {
        if (!mounted) return null;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              context.t('unable_read_file'),
            ),
          ),
        );
        return null;
      }
      final mimeType = _resolveMimeType(file, bytes);
      final uploaded = await _appState.uploadChatFile(
        chatId: chatId,
        fileName: file.name,
        bytes: bytes,
        mimeType: mimeType ?? 'application/octet-stream',
      );
      if (uploaded != null) {
        await _appState.ensureChatLoaded(chatId);
      }
      return uploaded;
    } catch (e) {
      if (!mounted) return null;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(context.t('file_upload_failed', args: {'error': '$e'}))));
      return null;
    }
  }

  Future<ChatFile?> _uploadFileFromComposer() async {
    if (!_appState.isAuthenticated) {
      _openUserOverlay();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.t('please_sign_in_upload_files'))),
        );
      });
      return null;
    }

    try {
      final result = await FilePicker.platform.pickFiles(
        allowMultiple: false,
        withData: true,
      );
      if (result == null || result.files.isEmpty) {
        return null;
      }
      final file = result.files.first;
      final bytes = file.bytes;
      if (bytes == null) {
        if (!mounted) return null;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              context.t('unable_read_file'),
            ),
          ),
        );
        return null;
      }
      final mimeType = _resolveMimeType(file, bytes);
      final attachment = _ComposerPendingAttachment(
        id: 'pending-${DateTime.now().microsecondsSinceEpoch}',
        fileName: file.name,
        bytes: Uint8List.fromList(bytes),
        mimeType: mimeType,
      );
      if (!mounted) return null;
      setState(() {
        _composerPendingAttachments.add(attachment);
        _selectedIndex = 0;
      });
      return null;
    } catch (e) {
      if (!mounted) return null;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(context.t('file_selection_failed', args: {'error': '$e'}))));
      return null;
    }
  }

  void _removeComposerAttachment(String id) {
    setState(() {
      _composerPendingAttachments.removeWhere(
        (attachment) => attachment.id == id,
      );
    });
  }

  String? _resolveMimeType(PlatformFile file, Uint8List bytes) {
    List<int>? headerBytes;
    if (bytes.isNotEmpty) {
      final headerLength = bytes.length >= 32 ? 32 : bytes.length;
      headerBytes = bytes.sublist(0, headerLength);
    }
    String? type;
    final filePath = file.path;
    if (filePath != null && filePath.isNotEmpty) {
      type = lookupMimeType(filePath, headerBytes: headerBytes);
    }
    type ??= lookupMimeType(file.name, headerBytes: headerBytes);
    if (type == 'application/octet-stream') {
      return null;
    }
    return type;
  }

  Future<void> _downloadFile(ChatFile file) async {
    if (!_appState.isAuthenticated) {
      _openUserOverlay();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.t('please_sign_in_download_files'))),
        );
      });
      return;
    }

    final currentUid = _appState.uid;
    if (currentUid == null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(context.t('unable_download_missing_user'))),
      );
      return;
    }

    try {
      final uri = await BackendService.buildFileUri(
        file,
        uid: currentUid,
      );
      final launched = await launchUrl(
        uri,
        mode: LaunchMode.externalApplication,
      );
      if (!launched && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.t('could_not_open_download', args: {'fileName': file.fileName}))),
        );
      }
    } on BackendException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(context.t('unable_download_file_error', args: {'error': e.message ?? '$e'}))),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(context.t('unable_to_download_file', args: {'error': '$e'}))),
      );
    }
  }

  void _openUserOverlay() {
    setState(() => _showUserOverlay = true);
  }

  void _closeUserOverlay() {
    setState(() => _showUserOverlay = false);
  }

  String _deriveChatTitle(String text) {
    final normalized = text.trim().replaceAll(RegExp(r'\s+'), ' ');
    if (normalized.isEmpty) return translateForLocale('new_chat', UserPreferences.locale);
    if (normalized.length <= 40) return normalized;
    return '${normalized.substring(0, 40).trimRight()}…';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          // Custom title bar
            CustomTitleBar(
              title: context.t('zen_ai'),
            isDarkMode: widget.themeMode == ThemeMode.dark ||
                (widget.themeMode == ThemeMode.system &&
                    MediaQuery.of(context).platformBrightness == Brightness.dark),
            onClose: () => WindowAnimator.of(context)?.closeWindow(),
          ),
          // Main content area
          Expanded(
            child: Row(
              children: [
          // Sidebar on the left
          ZenSidebar(
            selectedIndex: _selectedIndex,
            onItemSelected: _onSidebarItemSelected,
            chats: _appState.chats,
            isLoadingChats: _appState.isSyncingChats,
            onRefreshChats: _appState.isSyncingChats
                ? null
                : _appState.fetchChats,
            onChatSelected: _onSelectChat,
            onNewChat: _onCreateChat,
            onUserPressed: _openUserOverlay,
            onChatRename: _onRenameChat,
            onChatDelete: _onDeleteChat,
            isAuthenticated: _appState.isAuthenticated,
            userDisplayName:
                _appState.displayName ?? _appState.email ?? context.t('guest'),
            userEmail: _appState.email,
          ),

          // Main content area wrapped in a Stack so overlays (Spotlight) can be positioned
          Expanded(
            child: Stack(
              children: [
                Row(
                  children: [
                    // Center workspace
                    Expanded(
                      child: _selectedIndex == 4
                          ? CalendarPage(appState: _appState, onSignIn: _openUserOverlay)
                          : _selectedIndex == 3
                              ? EmailPage(
                                  userId: _appState.uid ?? 'guest',
                                  session: _appState.session,
                                )
                              : ZenWorkspace(
                              selectedIndex: _selectedIndex,
                              chats: _appState.chats,
                              selectedChatId: _selectedChatId,
                              selectedChat: _appState.chatById(_selectedChatId),
                              userDisplayName: _appState.displayName,
                              session: _appState.session,
                              isChatLoading: _selectedChatId != null
                                  ? _appState.isChatLoading(_selectedChatId!)
                                  : false,
                              isSendingMessage: _appState.isSendingMessage,
                              onCreateChat: _onCreateChat,
                              onSendMessage: _sendMessage,
                              onUploadFile: _uploadFileForChat,
                              onUploadFileForComposer: _uploadFileFromComposer,
                              onDownloadFile: _downloadFile,
                              composerAttachments: _composerPendingAttachments
                                  .map(
                                    (pending) => ComposerAttachment(
                                      id: pending.id,
                                      fileName: pending.fileName,
                                    ),
                                  )
                                  .toList(),
                              onRemoveComposerAttachment: _removeComposerAttachment,
                              isTypingInChat: _appState.isTypingInChat,
                            ),
                    ),

                    // Notes panel on the right when Notes is selected
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 260),
                      curve: Curves.easeInOut,
                      width: _selectedIndex == 2 ? 360 : 0,
                      child: _selectedIndex == 2
                          ? SizedBox(
                              width: 360,
                              child: Builder(
                                builder: (ctx) {
                                  final theme = Theme.of(ctx);
                                  return Row(
                                    children: [
                                      // clear vertical divider between workspace and notes
                                      SizedBox(
                                        width: 1,
                                        child: LayoutBuilder(
                                          builder: (ctx, constraints) {
                                            return Container(
                                              height:
                                                  constraints.maxHeight.isFinite
                                                  ? constraints.maxHeight
                                                  : null,
                                              decoration: BoxDecoration(
                                                color: theme.dividerColor,
                                                boxShadow: [
                                                  BoxShadow(
                                                    color: theme.shadowColor
                                                        .withAlpha(12),
                                                    blurRadius: 4,
                                                    offset: const Offset(-1, 0),
                                                  ),
                                                ],
                                              ),
                                            );
                                          },
                                        ),
                                      ),
                                      Expanded(
                                        child: ZenNotesPanel(
                                          notes: _appState.notes,
                                          selectedNote: _notesPanelSelectedNote,
                                          isLoading: _appState.isSyncingNotes,
                                          onCreate: _onCreateNote,
                                          onNoteSelected: _onNoteSelected,
                                          onSave: _onSaveNote,
                                          onDelete: _onDeleteNote,
                                          onCloseNote: _onCloseNoteInPanel,
                                          onClosePanel: _onCloseNotesPanel,
                                        ),
                                      ),
                                    ],
                                  );
                                },
                              ),
                            )
                          : const SizedBox.shrink(),
                    ),
                  ],
                ),

                // Spotlight overlay for Search (centered) — only shows when Search is selected
                if (_selectedIndex == 1)
                  Positioned.fill(
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: () => setState(() => _selectedIndex = 0),
                      child: Container(
                        color: Colors.black.withAlpha(60),
                        alignment: Alignment.topCenter,
                        padding: const EdgeInsets.only(top: 120),
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 720),
                          child: Material(
                            borderRadius: BorderRadius.circular(12),
                            elevation: 8,
                            child: Padding(
                              padding: const EdgeInsets.all(12.0),
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Row(
                                    children: [
                                      const Icon(Icons.search, size: 28),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: TextField(
                                          controller: _spotlightController,
                                          autofocus: true,
                                          decoration: InputDecoration.collapsed(
                                            hintText: context.t('search_notes_and_chats'),
                                          ),
                                          onSubmitted: (_) {},
                                        ),
                                      ),
                                      if (_spotlightQuery.isNotEmpty)
                                        IconButton(
                                          icon: const Icon(Icons.clear),
                                          onPressed: () =>
                                              _spotlightController.clear(),
                                        ),
                                    ],
                                  ),
                                  const SizedBox(height: 8),
                                  ConstrainedBox(
                                    constraints: const BoxConstraints(
                                      maxHeight: 360,
                                    ),
                                    child: _buildSpotlightResults(),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),

                if (_showUserOverlay)
                  Positioned.fill(
                    child: _UserAccountOverlay(
                      onClose: _closeUserOverlay,
                      themeMode: widget.themeMode,
                      onThemeModeChanged: widget.onThemeModeChanged,
                      seedColor: widget.seedColor,
                      onSeedColorChanged: widget.onSeedColorChanged,
                      appState: _appState,
                    ),
                  ),
              ],
            ),
          ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSpotlightResults() {
    final q = _spotlightQuery.trim().toLowerCase();

    bool matches(String source, String q) {
      final s = source.toLowerCase();
      if (s.contains(q)) return true;
      // match if any word starts with the query (helps short tokens like 'add')
      final words = s.split(RegExp(r'\s+'));
      for (var w in words) {
        if (w.startsWith(q)) return true;
      }
      // all tokens present (AND)
      final tokens = q
          .split(RegExp(r'\s+'))
          .where((t) => t.isNotEmpty)
          .toList();
      if (tokens.isNotEmpty && tokens.every((t) => s.contains(t))) return true;
      return false;
    }

    final notes = _appState.notes;
    final noteMatches = q.isEmpty
        ? notes.take(6).toList()
        : notes
              .where(
                (n) =>
                    matches(n.title, q) ||
                    matches(n.content, q) ||
                    n.keywords.any((k) => matches(k, q)) ||
                    n.triggerWords.any((t) => matches(t, q)),
              )
              .toList();

    final chats = _appState.chats;
    final chatMatches = q.isEmpty
        ? chats.take(6).toList()
        : chats
              .where(
                (c) =>
                    matches(c.title ?? context.t('untitled_chat'), q) ||
                    c.messages.any((m) => matches(m.content, q)),
              )
              .toList();

    final results = <Widget>[];
    for (var n in noteMatches) {
      results.add(
        ListTile(
          leading: const Icon(Icons.note),
          title: Text(n.title),
          subtitle: Text(
            n.content,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          onTap: () {
            setState(() {
              _notesPanelSelectedNote = n;
              _selectedIndex = 2; // show notes panel
            });
          },
        ),
      );
    }

    for (var c in chatMatches) {
      results.add(
        ListTile(
          leading: const Icon(Icons.chat_bubble_outline),
          title: Text(c.title ?? context.t('untitled_chat')),
          subtitle: c.messages.isNotEmpty
              ? Text(
                  c.messages.last.content,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                )
              : null,
          onTap: () {
            setState(() {
              _selectedChatId = c.id;
              _selectedIndex = 0; // focus workspace/chat
            });
          },
        ),
      );
    }

    if (results.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(12.0),
          child: Text(
            context.t('no_results'),
            style: Theme.of(context).textTheme.bodyLarge,
          ),
        ),
      );
    }

    return ListView.separated(
      itemCount: results.length,
      separatorBuilder: (_, __) => const Divider(height: 1),
      itemBuilder: (ctx, i) => results[i],
    );
  }
}

class _UserAccountOverlay extends StatefulWidget {
  final VoidCallback onClose;
  final ThemeMode themeMode;
  final ValueChanged<ThemeMode> onThemeModeChanged;
  final Color seedColor;
  final ValueChanged<Color> onSeedColorChanged;
  final AppState appState;

  const _UserAccountOverlay({
    required this.onClose,
    required this.themeMode,
    required this.onThemeModeChanged,
    required this.seedColor,
    required this.onSeedColorChanged,
    required this.appState,
  });

  @override
  State<_UserAccountOverlay> createState() => _UserAccountOverlayState();
}

class _UserAccountOverlayState extends State<_UserAccountOverlay> {
  late ThemeMode _localThemeMode;
  late Color _accentColor;
  late bool _notificationsEnabled;
  late bool _smartReplySuggestions;
  late bool _autoArchiveChats;
  final _authFormKey = GlobalKey<FormState>();
  late final TextEditingController _emailController;
  late final TextEditingController _passwordController;
  late final TextEditingController _displayNameController;
  late final TextEditingController _mcpHostController;
  late final TextEditingController _mcpPortController;
  bool _mcpAutoConnect = false;
  bool _isSignupMode = false;

  static const List<_AccentColorOption> _accentColorOptions = [
    _AccentColorOption(Color(0xFFEE5396), 'Pink'),
    _AccentColorOption(Color(0xFF0F62FE), 'Blue'),
    _AccentColorOption(Color(0xFF12A595), 'Teal'),
    _AccentColorOption(Color(0xFF9356D5), 'Purple'),
    _AccentColorOption(Color(0xFFF18F01), 'Amber'),
    _AccentColorOption(Color(0xFF2E8540), 'Green'),
    _AccentColorOption(Color(0xFF6F6CF0), 'Lavender'),
  ];

  @override
  void initState() {
    super.initState();
    _localThemeMode = widget.themeMode;
    _accentColor = widget.seedColor;
    _notificationsEnabled = UserPreferences.notificationsEnabled;
    _smartReplySuggestions = UserPreferences.smartReplySuggestions;
    _autoArchiveChats = UserPreferences.autoArchiveChats;
    _emailController = TextEditingController(text: widget.appState.email);
    _passwordController = TextEditingController();
    _displayNameController = TextEditingController(
      text: widget.appState.displayName ?? '',
    );
    _mcpHostController =
        TextEditingController(text: widget.appState.notesMcpHost);
    _mcpPortController = TextEditingController(
      text: widget.appState.notesMcpPort.toString(),
    );
    _mcpAutoConnect = widget.appState.notesMcpAutoConnect;
    widget.appState.addListener(_onAppStateChanged);
  }

  @override
  void didUpdateWidget(covariant _UserAccountOverlay oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.themeMode != widget.themeMode) {
      _localThemeMode = widget.themeMode;
    }
    if (oldWidget.seedColor != widget.seedColor) {
      _accentColor = widget.seedColor;
    }
    if (!identical(oldWidget.appState, widget.appState)) {
      oldWidget.appState.removeListener(_onAppStateChanged);
      widget.appState.addListener(_onAppStateChanged);
    }
  }

  void _onAppStateChanged() {
    if (!mounted) return;
    setState(() {
      if (widget.appState.isAuthenticated) {
        _emailController.text = widget.appState.email ?? _emailController.text;
        _passwordController.clear();
        _displayNameController.text = widget.appState.displayName ?? '';
        _isSignupMode = false;
      }
      final state = widget.appState;
      _mcpAutoConnect = state.notesMcpAutoConnect;
      final host = state.notesMcpHost;
      if (_mcpHostController.text != host) {
        _mcpHostController.text = host;
      }
      final portText = state.notesMcpPort.toString();
      if (_mcpPortController.text != portText) {
        _mcpPortController.text = portText;
      }
    });
  }

  @override
  void dispose() {
    widget.appState.removeListener(_onAppStateChanged);
    _emailController.dispose();
    _passwordController.dispose();
    _displayNameController.dispose();
    _mcpHostController.dispose();
    _mcpPortController.dispose();
    super.dispose();
  }

  void _onAccentColorSelected(Color color) {
    if (_accentColor == color) return;
    setState(() {
      _accentColor = color;
    });
    widget.onSeedColorChanged(color);
  }

  String? _validateEmail(String? value) {
    final text = value?.trim() ?? '';
    if (text.isEmpty) {
      return context.t('please_enter_your_email');
    }
    final emailRegex = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');
    if (!emailRegex.hasMatch(text)) {
      return context.t('enter_valid_email');
    }
    return null;
  }

  String? _validatePassword(String? value) {
    final text = value ?? '';
    if (text.length < 6) {
      return context.t('password_min_length');
    }
    return null;
  }

  Future<void> _handleSubmit() async {
    final form = _authFormKey.currentState;
    if (form == null || !form.validate()) return;
    FocusScope.of(context).unfocus();

    final email = _emailController.text.trim();
    final password = _passwordController.text.trim();
    final displayName = _isSignupMode
        ? _displayNameController.text.trim()
        : '';
    final optionalDisplayName =
        displayName.isNotEmpty ? displayName : null;

    if (_isSignupMode) {
      final created = await widget.appState.signup(
        email: email,
        password: password,
        displayName: displayName,
      );
      if (!created) return;
      final loggedIn = await widget.appState.login(
        email: email,
        password: password,
        fallbackDisplayName: displayName,
      );
      if (loggedIn && mounted) {
        widget.onClose();
      }
    } else {
      final loggedIn = await widget.appState.login(
        email: email,
        password: password,
        fallbackDisplayName: optionalDisplayName,
      );
      if (loggedIn && mounted) {
        widget.onClose();
      }
    }
  }

  Future<void> _handleGoogleSignIn() async {
    FocusScope.of(context).unfocus();
    final success = await widget.appState.loginWithGoogle();
    if (success && mounted) {
      widget.onClose();
    }
  }

  Future<void> _handleRefreshProfile() async {
    if (widget.appState.isUpdatingProfile) return;
    await widget.appState.refreshProfile();
  }

  Future<void> _promptDisplayNameEdit() async {
    if (widget.appState.isUpdatingProfile) return;
    final currentName = widget.appState.displayName ?? '';
    final controller = TextEditingController(text: currentName);
    final updatedName = await showDialog<String>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: Text(context.t('update_display_name')),
          content: TextField(
            controller: controller,
            autofocus: true,
            textCapitalization: TextCapitalization.words,
            decoration: InputDecoration(labelText: context.t('display_name_label')),
            onSubmitted: (value) =>
                Navigator.of(dialogContext).pop(value.trim()),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: Text(context.t('cancel')),
            ),
            FilledButton(
              onPressed: () =>
                  Navigator.of(dialogContext).pop(controller.text.trim()),
              child: Text(context.t('save')),
            ),
          ],
        );
      },
    );
    controller.dispose();
    if (!mounted || updatedName == null) return;
    final trimmed = updatedName.trim();
    if (trimmed.isEmpty || trimmed == currentName.trim()) return;
    await widget.appState.updateDisplayName(trimmed);
  }

  Future<void> _openCustomColorPicker() async {
    final selectedColor = await showDialog<Color>(
      context: context,
      builder: (dialogContext) {
        Color tempColor = _accentColor;
        final hexController = TextEditingController(
          text:
              '#${tempColor.value.toRadixString(16).padLeft(8, '0').substring(2).toUpperCase()}',
        );
        return StatefulBuilder(
          builder: (context, setStateDialog) {
            void updateColor(Color color) {
              setStateDialog(() => tempColor = color);
              hexController.text =
                  '#${color.value.toRadixString(16).substring(2).toUpperCase()}';
            }

            void updateFromHex(String hex) {
              final sanitized = hex.replaceAll('#', '').trim();
              if (sanitized.length != 6) return;
              final value = int.tryParse(sanitized, radix: 16);
              if (value == null) return;
              final color = Color(0xFF000000 | value);
              setStateDialog(() => tempColor = color);
            }

            return Dialog(
              insetPadding: const EdgeInsets.all(16),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(20),
              ),
              child: Container(
                constraints: const BoxConstraints(
                  maxWidth: 400,
                  maxHeight: 600,
                ),
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: SingleChildScrollView(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Row(
                          children: [
                            Icon(
                              Icons.palette_outlined,
                              color: Theme.of(context).colorScheme.primary,
                              size: 28,
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                context.t('custom_accent_color'),
                                style: Theme.of(context).textTheme.titleLarge
                                  ?.copyWith(fontWeight: FontWeight.w600),
                                ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 24),
                        // Color Picker using flex_color_picker
                        ColorPicker(
                          color: tempColor,
                          onColorChanged: updateColor,
                          width: 40,
                          height: 40,
                          borderRadius: 20,
                          spacing: 8,
                          runSpacing: 8,
                          wheelDiameter: 200,
                          wheelWidth: 16,
                          wheelHasBorder: true,
                          pickersEnabled: const <ColorPickerType, bool>{
                            ColorPickerType.both: true,
                            ColorPickerType.primary: false,
                            ColorPickerType.accent: false,
                            ColorPickerType.bw: false,
                            ColorPickerType.custom: false,
                            ColorPickerType.wheel: true,
                          },
                          pickerTypeLabels: <ColorPickerType, String>{
                            ColorPickerType.both: context.t('picker_wheel_grid'),
                            ColorPickerType.wheel: context.t('picker_color_wheel'),
                          },
                          pickerTypeTextStyle: Theme.of(
                            context,
                          ).textTheme.bodyMedium,
                          enableShadesSelection: false,
                          includeIndex850: false,
                          crossAxisAlignment: CrossAxisAlignment.center,
                          padding: const EdgeInsets.all(0),
                          opacityTrackWidth: 150,
                          opacityTrackHeight: 16,
                          opacityThumbRadius: 16,
                          copyPasteBehavior: const ColorPickerCopyPasteBehavior(
                            copyButton: true,
                            pasteButton: true,
                            copyFormat: ColorPickerCopyFormat.hexRRGGBB,
                            longPressMenu: true,
                          ),
                          actionButtons: const ColorPickerActionButtons(
                            okButton: true,
                            closeButton: true,
                            dialogActionButtons: false,
                          ),
                          showColorCode: true,
                          colorCodeHasColor: true,
                          colorCodeReadOnly: false,
                          showColorName: false,
                          showRecentColors: true,
                          recentColors: const [],
                          maxRecentColors: 5,
                          showMaterialName: false,
                          materialNameTextStyle: Theme.of(
                            context,
                          ).textTheme.bodySmall,
                          colorNameTextStyle: Theme.of(
                            context,
                          ).textTheme.bodySmall,
                          colorCodeTextStyle: Theme.of(
                            context,
                          ).textTheme.bodySmall,
                          colorCodePrefixStyle: Theme.of(
                            context,
                          ).textTheme.bodySmall,
                          selectedPickerTypeColor: Theme.of(
                            context,
                          ).colorScheme.primary,
                        ),
                        const SizedBox(height: 20),
                        // Hex Input
                        SizedBox(
                          width: 280,
                          child: TextField(
                            controller: hexController,
                            decoration: InputDecoration(
                              labelText: context.t('hex_code'),
                              hintText: context.t('hex_code_hint'),
                              prefixIcon: const Icon(Icons.tag),
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                            onChanged: updateFromHex,
                            maxLength: 7,
                          ),
                        ),
                        const SizedBox(height: 16),
                        // Color Preview
                        Container(
                          width: 280,
                          height: 60,
                          decoration: BoxDecoration(
                            color: tempColor,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: Theme.of(
                                context,
                              ).colorScheme.outline.withOpacity(0.3),
                              width: 1,
                            ),
                          ),
                          alignment: Alignment.center,
                          child: Text(
                            context.t('preview'),
                            style: TextStyle(
                              color:
                                  ThemeData.estimateBrightnessForColor(
                                        tempColor,
                                      ) ==
                                      Brightness.dark
                                  ? Colors.white
                                  : Colors.black,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                        const SizedBox(height: 24),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            TextButton(
                              onPressed: () => Navigator.of(context).pop(),
                              child: Text(context.t('cancel')),
                            ),
                            const SizedBox(width: 12),
                            FilledButton(
                              onPressed: () =>
                                  Navigator.of(context).pop(tempColor),
                              child: Text(context.t('apply')),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            );
          },
        );
      },
    );

    if (selectedColor != null) {
      _onAccentColorSelected(selectedColor);
    }
  }

  Future<void> _handleConnectMcp() async {
    if (widget.appState.isNotesMcpConnecting) return;
    FocusScope.of(context).unfocus();
    final host = _mcpHostController.text.trim();
    final portText = _mcpPortController.text.trim();
    final port = int.tryParse(portText.isEmpty ? widget.appState.notesMcpPort.toString() : portText);
    if (port == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.t('please_enter_valid_mcp_port'))),
        );
      }
      return;
    }
    await widget.appState.connectNotesMcp(host: host, port: port);
  }

  Future<void> _handleDisconnectMcp() async {
    await widget.appState.disconnectNotesMcp();
  }

  Future<void> _handleRefreshMcpTools() async {
    await widget.appState.refreshNotesMcpTools();
  }

  void _handleToggleMcpAutoConnect(bool value) {
    setState(() => _mcpAutoConnect = value);
    widget.appState.setNotesMcpAutoConnect(value);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Stack(
      children: [
        Positioned.fill(
          child: AnimatedOpacity(
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOut,
            opacity: 1,
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: widget.onClose,
              child: Container(color: Colors.black.withOpacity(0.45)),
            ),
          ),
        ),
        Center(
          child: TweenAnimationBuilder<double>(
            tween: Tween(begin: 0.92, end: 1),
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOutBack,
            builder: (context, scale, child) =>
                Transform.scale(scale: scale, child: child),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520, maxHeight: 520),
              child: Material(
                color: colorScheme.surface,
                elevation: 24,
                borderRadius: BorderRadius.circular(24),
                clipBehavior: Clip.antiAlias,
                child: DefaultTabController(
                  length: 3,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 24,
                          vertical: 20,
                        ),
                        color: colorScheme.surfaceVariant.withOpacity(0.35),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    context.t('account_center'),
                                    style: theme.textTheme.titleLarge?.copyWith(
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    context.t('account_center_description'),
                                    style: theme.textTheme.bodyMedium,
                                  ),
                                ],
                              ),
                            ),
                            IconButton(
                              onPressed: widget.onClose,
                              icon: const Icon(Icons.close_rounded),
                              tooltip: context.t('close'),
                            ),
                          ],
                        ),
                      ),
                      const Divider(height: 1),
                      TabBar(
                        labelColor: colorScheme.primary,
                        indicatorColor: colorScheme.primary,
                        indicatorWeight: 2.5,
                        tabs: [
                          Tab(text: context.t('tab_profile')),
                          Tab(text: context.t('tab_preferences')),
                          Tab(text: context.t('tab_activity')),
                        ],
                      ),
                      const Divider(height: 1),
                      Expanded(
                        child: TabBarView(
                          physics: const BouncingScrollPhysics(),
                          children: [
                            _buildProfileTab(context),
                            _buildPreferencesTab(context),
                            _buildActivityTab(context),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildProfileTab(BuildContext context) {
    final theme = Theme.of(context);
    final isAuthenticated = widget.appState.isAuthenticated;
    final isBusy =
        widget.appState.isAuthenticating || widget.appState.isRestoringSession;

    if (!isAuthenticated) {
      return SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Form(
          key: _authFormKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                _isSignupMode ? context.t('create_your_account') : context.t('sign_in_to_app'),
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                _isSignupMode
                    ? context.t('signup_description')
                    : context.t('signin_description'),
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 24),
              TextFormField(
                controller: _emailController,
                keyboardType: TextInputType.emailAddress,
                autofillHints: const [AutofillHints.email],
                decoration: InputDecoration(
                  labelText: context.t('email_label'),
                  prefixIcon: const Icon(Icons.mail_outline),
                ),
                validator: _validateEmail,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _passwordController,
                decoration: InputDecoration(
                  labelText: context.t('password_label'),
                  prefixIcon: const Icon(Icons.password_outlined),
                ),
                obscureText: true,
                validator: _validatePassword,
              ),
              const SizedBox(height: 8),
              if (!_isSignupMode)
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: isBusy
                        ? null
                        : () async {
                            final emailController = TextEditingController(text: _emailController.text.trim());
                            final formKey = GlobalKey<FormState>();
                            var sending = false;
                            await showDialog<void>(
                              context: context,
                              builder: (dialogContext) {
                                return StatefulBuilder(
                                  builder: (context, setState) {
                                    return AlertDialog(
                                      title: Text(context.t('reset_password')),
                                      content: Form(
                                        key: formKey,
                                        child: TextFormField(
                                          controller: emailController,
                                          keyboardType: TextInputType.emailAddress,
                                          autofillHints: const [AutofillHints.email],
                                          decoration: InputDecoration(
                                            labelText: context.t('email_label'),
                                          ),
                                          validator: _validateEmail,
                                        ),
                                      ),
                                      actions: [
                                        TextButton(
                                          onPressed: sending ? null : () => Navigator.of(dialogContext).pop(),
                                          child: Text(context.t('cancel')),
                                        ),
                                        FilledButton(
                                          onPressed: sending
                                              ? null
                                              : () async {
                                                  final form = formKey.currentState;
                                                  if (form == null || !form.validate()) return;
                                                  setState(() => sending = true);
                                                  final email = emailController.text.trim();
                                                  await widget.appState.forgotPassword(email: email);
                                                  if (mounted) Navigator.of(dialogContext).pop();
                                                },
                                          child: sending
                                              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                                              : Text(context.t('send')),
                                        ),
                                      ],
                                    );
                                  },
                                );
                              },
                            );
                          },
                    child: Text(context.t('forgot_password_query')),
                  ),
                ),
              const SizedBox(height: 12),
              if (_isSignupMode) ...[
                TextFormField(
                  controller: _displayNameController,
                  textCapitalization: TextCapitalization.words,
                  decoration: InputDecoration(
                    labelText: context.t('display_name_label'),
                    prefixIcon: const Icon(Icons.badge_outlined),
                  ),
                  validator: (value) {
                    final text = value?.trim() ?? '';
                    if (text.isEmpty) {
                      return context.t('display_name_required');
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 12),
              ],
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  icon: isBusy
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Icon(
                          _isSignupMode
                              ? Icons.person_add_alt_1
                              : Icons.login_rounded,
                        ),
                  label: Text(
                    isBusy
                        ? context.t('please_wait')
                          : (_isSignupMode ? context.t('create_account') : context.t('sign_in')),
                  ),
                  onPressed: isBusy ? null : _handleSubmit,
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: Divider(color: theme.colorScheme.outlineVariant),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: Text(
                      context.t('or_continue_with'),
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ),
                  Expanded(
                    child: Divider(color: theme.colorScheme.outlineVariant),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  icon: isBusy
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const FaIcon(FontAwesomeIcons.google, size: 20),
                  label: Text(context.t('continue_with_google')),
                  onPressed: isBusy ? null : _handleGoogleSignIn,
                ),
              ),
              const SizedBox(height: 12),
              Align(
                alignment: Alignment.center,
                child: TextButton(
                  child: Text(
                    _isSignupMode
                        ? context.t('have_account_sign_in')
                        : context.t('need_account_create'),
                  ),
                  onPressed: isBusy
                      ? null
                      : () {
                          setState(() {
                            _isSignupMode = !_isSignupMode;
                            if (!_isSignupMode) {
                              _displayNameController.clear();
                            }
                          });
                        },
                ),
              ),
            ],
          ),
        ),
      );
    }

    final session = widget.appState.session;
    final email = session?.email ?? widget.appState.email ?? context.t('unknown_user');
    final uid = session?.uid ?? widget.appState.uid ?? context.t('unknown_uid');
    final expiry = session?.expiresAt;
    final expiryLabel = expiry != null
      ? '${expiry.toLocal().toString().split('.').first}'
      : context.t('token_expiry_unknown');
    final displayName = widget.appState.displayName;
    final photoUrl = widget.appState.photoUrl;
    final isUpdatingProfile = widget.appState.isUpdatingProfile;
    final profile = widget.appState.profile;
    final updatedAt = profile?.updatedAt;
    final createdAt = profile?.createdAt;
    final updatedAtLabel = updatedAt != null
        ? updatedAt.toLocal().toString().split('.').first
        : null;
    final createdAtLabel = createdAt != null
        ? createdAt.toLocal().toString().split('.').first
        : null;
    final primaryLabel = displayName != null && displayName.isNotEmpty
        ? displayName
        : email;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 32,
                backgroundColor: photoUrl != null && photoUrl.isNotEmpty
                    ? Colors.transparent
                    : theme.colorScheme.primary.withOpacity(0.14),
                backgroundImage: photoUrl != null && photoUrl.isNotEmpty
                    ? NetworkImage(photoUrl)
                    : null,
                child: photoUrl != null && photoUrl.isNotEmpty
                    ? null
                    : Text(
                        primaryLabel.isNotEmpty
                            ? primaryLabel[0].toUpperCase()
                            : '?',
                        style: theme.textTheme.headlineSmall?.copyWith(
                          color: theme.colorScheme.primary,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      primaryLabel,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 4),
                    if (email.isNotEmpty && email != primaryLabel) ...[
                      Text(
                        email,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                      const SizedBox(height: 4),
                    ],
                    Text(
                      context.t('uid_display', args: {'id': uid}),
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      context.t('token_valid_until', args: {'expiry': expiryLabel}),
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              FilledButton.icon(
                onPressed: () async {
                  await widget.appState.logout();
                },
                icon: const Icon(Icons.logout_rounded),
                label: Text(context.t('sign_out')),
              ),
            ],
          ),
          const SizedBox(height: 24),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.person_outline),
                  title: Text(context.t('display_name')),
                  subtitle: Text(
                    displayName != null && displayName.isNotEmpty
                        ? displayName
                        : context.t('not_set'),
                  ),
                  trailing: isUpdatingProfile
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Wrap(
                          spacing: 4,
                          children: [
                            IconButton(
                              icon: const Icon(Icons.refresh),
                              onPressed: _handleRefreshProfile,
                              tooltip: context.t('refresh_from_server'),
                            ),
                            IconButton(
                              icon: const Icon(Icons.edit_outlined),
                              onPressed: _promptDisplayNameEdit,
                              tooltip: context.t('edit_display_name'),
                            ),
                          ],
                        ),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.mail_outline),
                  title: Text(context.t('email_label')),
                  subtitle: Text(email),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.perm_identity),
                  title: Text(context.t('firebase_uid')),
                  subtitle: Text(uid),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.timer_outlined),
                  title: Text(context.t('token_expires')),
                  subtitle: Text(expiryLabel),
                ),
                if (createdAtLabel != null || updatedAtLabel != null) ...[
                  const Divider(height: 1),
                  if (createdAtLabel != null)
                    ListTile(
                      leading: const Icon(Icons.calendar_today_outlined),
                      title: Text(context.t('profile_created')),
                      subtitle: Text(createdAtLabel),
                    ),
                  if (createdAtLabel != null && updatedAtLabel != null)
                    const Divider(height: 1),
                  if (updatedAtLabel != null)
                    ListTile(
                      leading: const Icon(Icons.history_toggle_off),
                      title: Text(context.t('profile_updated')),
                      subtitle: Text(updatedAtLabel),
                    ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 24),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.chat_bubble_outline),
                  title: Text(context.t('synced_chats')),
                  subtitle: Text(
                    widget.appState.chats.isEmpty
                        ? context.t('no_chats_stored')
                        : context.t('chats_available', args: {'count': '${widget.appState.chats.length}'}),
                  ),
                  trailing: widget.appState.isSyncingChats
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : IconButton(
                          icon: const Icon(Icons.refresh),
                          tooltip: context.t('refresh_chats'),
                          onPressed: widget.appState.fetchChats,
                        ),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.celebration_outlined),
                  title: Text(context.t('account_status')),
                  subtitle: Text(
                    widget.appState.isNewUser
                        ? context.t('recently_linked')
                        : context.t('signed_in_user'),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPreferencesTab(BuildContext context) {
    final theme = Theme.of(context);
    final appState = widget.appState;
    final mcpConnecting = appState.isNotesMcpConnecting;
    final mcpConnected = appState.isNotesMcpConnected;
    final mcpError = appState.notesMcpError;
    final mcpTools = appState.notesMcpTools;
    final lastConnected = appState.notesMcpLastConnected;
    final hostPreview = '${appState.notesMcpHost}:${appState.notesMcpPort}';
    final statusBuffer = StringBuffer();
    if (mcpConnecting) {
      statusBuffer.write(context.t('connecting_to', args: {'host': hostPreview}));
    } else if (mcpConnected) {
      statusBuffer.write(context.t('connected_to', args: {'host': hostPreview}));
      if (lastConnected != null) {
        statusBuffer.write(' · ${lastConnected.toLocal().toString().split('.').first}');
      }
      if (mcpTools.isNotEmpty) {
        statusBuffer.write(' · ' + context.t('mcp_tools_count', args: {'count': '${mcpTools.length}'}));
      }
    } else {
      statusBuffer.write(context.t('not_connected'));
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            context.t('appearance'),
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 12),
          SegmentedButton<ThemeMode>(
            segments: [
              ButtonSegment<ThemeMode>(
                value: ThemeMode.light,
                icon: Icon(Icons.light_mode_outlined),
                label: Text(context.t('light')),
              ),
              ButtonSegment<ThemeMode>(
                value: ThemeMode.dark,
                icon: Icon(Icons.dark_mode_outlined),
                label: Text(context.t('dark')),
              ),
              ButtonSegment<ThemeMode>(
                value: ThemeMode.system,
                icon: Icon(Icons.auto_mode_outlined),
                label: Text(context.t('system')),
              ),
            ],
            selected: {_localThemeMode},
            onSelectionChanged: (modes) {
              final selected = modes.first;
              setState(() => _localThemeMode = selected);
              widget.onThemeModeChanged(selected);
            },
          ),
          const SizedBox(height: 20),
          Text(
            context.t('accent_color'),
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              for (final option in _accentColorOptions)
                _AccentColorSwatch(
                  option: option,
                  selected: option.color == _accentColor,
                  onTap: () => _onAccentColorSelected(option.color),
                ),
              _CustomColorButton(
                selected: !_accentColorOptions.any(
                  (option) => option.color == _accentColor,
                ),
                currentColor: _accentColor,
                onTap: _openCustomColorPicker,
              ),
            ],
          ),
          const SizedBox(height: 24),
          Text(
            context.t('assistant'),
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Column(
              children: [
                SwitchListTile.adaptive(
                  value: _notificationsEnabled,
                  title: Text(context.t('desktop_notifications')),
                  subtitle: Text(context.t('desktop_notifications_sub')),
                  onChanged: (value) {
                    setState(() => _notificationsEnabled = value);
                    UserPreferences.setNotificationsEnabled(value);
                  },
                ),
                const Divider(height: 1),
                SwitchListTile.adaptive(
                  value: _smartReplySuggestions,
                  title: Text(context.t('smart_reply_suggestions')),
                  subtitle: Text(context.t('smart_reply_sub')),
                  onChanged: (value) {
                    setState(() => _smartReplySuggestions = value);
                    UserPreferences.setSmartReplySuggestions(value);
                  },
                ),
                const Divider(height: 1),
                SwitchListTile.adaptive(
                  value: _autoArchiveChats,
                  title: Text(context.t('auto_archive_chats')),
                  subtitle: Text(context.t('auto_archive_sub')),
                  onChanged: (value) {
                    setState(() => _autoArchiveChats = value);
                    UserPreferences.setAutoArchiveChats(value);
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          Text(
            context.t('ai_note_automation'),
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                          child: TextField(
                          controller: _mcpHostController,
                          decoration: InputDecoration(
                            labelText: context.t('mcp_host_or_url'),
                            prefixIcon: Icon(Icons.cloud_outlined),
                          ),
                          textInputAction: TextInputAction.next,
                        ),
                      ),
                      const SizedBox(width: 12),
                      SizedBox(
                        width: 120,
                          child: TextField(
                          controller: _mcpPortController,
                          decoration: InputDecoration(
                            labelText: context.t('port'),
                            prefixIcon: Icon(Icons.numbers),
                          ),
                          keyboardType: TextInputType.number,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  SwitchListTile.adaptive(
                    value: _mcpAutoConnect,
                    title: Text(context.t('auto_connect_on_launch')),
                    subtitle: Text(context.t('auto_connect_sub')),
                    onChanged: _handleToggleMcpAutoConnect,
                  ),
                  const Divider(height: 1),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(
                      mcpConnected
                          ? Icons.check_circle_outline
                          : (mcpConnecting
                              ? Icons.sync
                              : Icons.radio_button_unchecked),
                      color: mcpConnected
                          ? theme.colorScheme.primary
                          : theme.colorScheme.outline,
                    ),
                    title: Text(statusBuffer.toString()),
                    subtitle: mcpError != null
                        ? Text(
                            mcpError,
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.error,
                            ),
                          )
                        : Text(context.t('mcp_description')),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 12,
                    runSpacing: 8,
                    children: [
                        FilledButton.icon(
                        onPressed: mcpConnecting
                            ? null
                            : (mcpConnected ? _handleDisconnectMcp : _handleConnectMcp),
                        icon: mcpConnecting
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : Icon(mcpConnected ? Icons.link_off : Icons.link),
                        label: Text(mcpConnected ? context.t('disconnect') : context.t('connect')),
                      ),
                      OutlinedButton.icon(
                        onPressed: mcpConnected ? _handleRefreshMcpTools : null,
                        icon: const Icon(Icons.refresh),
                        label: Text(context.t('refresh_tools')),
                      ),
                    ],
                  ),
                  if (mcpTools.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    Text(
                      context.t('available_tools'),
                      style: theme.textTheme.titleSmall,
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: mcpTools
                          .map(
                            (tool) => Chip(
                              avatar: const Icon(Icons.build_outlined, size: 16),
                              label: Text(tool.name),
                            ),
                          )
                          .toList(),
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          Text(
            context.t('workspace'),
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.language_outlined),
                  title: Text(context.t('language')),
                  subtitle: Text(
                    context.locale.languageCode == 'de'
                        ? context.t('lang_german')
                        : context.t('lang_english'),
                  ),
                  trailing: TextButton(
                    onPressed: () async {
                      final choice = await showDialog<String>(
                        context: context,
                        builder: (ctx) => SimpleDialog(
                          title: Text(context.t('language')),
                          children: [
                            SimpleDialogOption(
                              child: Text(context.t('lang_english')),
                              onPressed: () => Navigator.pop(ctx, 'en'),
                            ),
                            SimpleDialogOption(
                              child: Text(context.t('lang_german')),
                              onPressed: () => Navigator.pop(ctx, 'de'),
                            ),
                          ],
                        ),
                      );
                      if (choice != null) {
                        // update runtime locale and persist
                        context.setLocale(Locale(choice));
                        await UserPreferences.setLocale(choice);
                        setState(() {});
                      }
                    },
                    child: Text(context.t('change')),
                  ),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.public_off),
                  title: Text(context.t('data_residency')),
                  subtitle: Text(context.t('eu_restricted')),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActivityTab(BuildContext context) {
    final theme = Theme.of(context);
    if (!widget.appState.isAuthenticated) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32.0),
          child: Text(
            context.t('sign_in_to_view_activity'),
            style: theme.textTheme.bodyLarge,
            textAlign: TextAlign.center,
          ),
        ),
      );
    }

    final chats = widget.appState.chats;
    if (chats.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32.0),
          child: Text(
            context.t('no_chat_history'),
            style: theme.textTheme.bodyLarge,
            textAlign: TextAlign.center,
          ),
        ),
      );
    }

    final recentChats = chats.take(20).toList();
    return ListView.separated(
      padding: const EdgeInsets.all(24),
      itemCount: recentChats.length,
      separatorBuilder: (_, __) => const Divider(height: 1),
      itemBuilder: (context, index) {
        final chat = recentChats[index];
        final updated = chat.updatedAt.toLocal().toString().split('.').first;
        final preview = chat.messages.isNotEmpty
            ? chat.messages.last.content
            : context.t('no_messages_yet');
            return ListTile(
              leading: CircleAvatar(
            backgroundColor: theme.colorScheme.primary.withOpacity(0.12),
            child: Icon(
              Icons.timeline_outlined,
              color: theme.colorScheme.primary,
            ),
          ),
          title: Text(chat.title ?? 'Untitled chat'),
          subtitle: Text(
            '$updated · $preview',
            style: theme.textTheme.bodyMedium,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        );
      },
    );
  }
}

class _ComposerPendingAttachment {
  final String id;
  final String fileName;
  final Uint8List bytes;
  final String? mimeType;

  const _ComposerPendingAttachment({
    required this.id,
    required this.fileName,
    required this.bytes,
    required this.mimeType,
  });
}

class _AccentColorOption {
  final Color color;
  final String label;

  const _AccentColorOption(this.color, this.label);
}

class _AccentColorSwatch extends StatelessWidget {
  final _AccentColorOption option;
  final bool selected;
  final VoidCallback onTap;

  const _AccentColorSwatch({
    required this.option,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final borderColor = selected
        ? theme.colorScheme.primary
        : theme.colorScheme.outlineVariant.withOpacity(0.6);
    final brightness = ThemeData.estimateBrightnessForColor(option.color);
    final iconColor = brightness == Brightness.dark
        ? Colors.white
        : Colors.black87;

    return Tooltip(
      message: option.label,
      child: InkResponse(
        onTap: onTap,
        radius: 30,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: option.color,
            border: Border.all(color: borderColor, width: selected ? 3 : 1.5),
            boxShadow: [
              BoxShadow(
                color: theme.shadowColor.withOpacity(0.12),
                blurRadius: 10,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          alignment: Alignment.center,
          child: AnimatedOpacity(
            opacity: selected ? 1 : 0,
            duration: const Duration(milliseconds: 180),
            child: Icon(Icons.check, size: 22, color: iconColor),
          ),
        ),
      ),
    );
  }
}

class _CustomColorButton extends StatelessWidget {
  final bool selected;
  final Color currentColor;
  final VoidCallback onTap;

  const _CustomColorButton({
    required this.selected,
    required this.currentColor,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final borderColor = selected
        ? theme.colorScheme.primary
        : theme.colorScheme.outlineVariant.withOpacity(0.6);

    return Tooltip(
      message: context.t('custom_accent_color'),
      child: InkResponse(
        onTap: onTap,
        radius: 30,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: const SweepGradient(
              colors: [
                Color(0xFFFF5F6D),
                Color(0xFFFFC371),
                Color(0xFF47CF73),
                Color(0xFF17BEBB),
                Color(0xFF4A00E0),
                Color(0xFFFF5F6D),
              ],
            ),
            border: Border.all(color: borderColor, width: selected ? 3 : 1.5),
            boxShadow: [
              BoxShadow(
                color: theme.shadowColor.withOpacity(0.12),
                blurRadius: 10,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          alignment: Alignment.center,
          child: Stack(
            alignment: Alignment.center,
            children: [
              if (selected)
                Container(
                  width: 22,
                  height: 22,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: currentColor,
                    border: Border.all(color: Colors.white, width: 2),
                  ),
                ),
              Icon(
                selected ? Icons.check : Icons.add,
                color: Colors.white,
                size: 22,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
