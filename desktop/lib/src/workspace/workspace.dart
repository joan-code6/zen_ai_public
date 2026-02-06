import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../models/auth.dart';
import '../models/chat.dart';
import '../services/backend_service.dart';
import 'markdown_message.dart';
import 'widgets/ai_model_picker.dart';
import '../i18n/i18n.dart';

typedef SendMessageCallback =
    Future<void> Function(String message, {List<String> fileIds});

class ComposerAttachment {
  final String id;
  final String fileName;

  const ComposerAttachment({required this.id, required this.fileName});
}

class ZenWorkspace extends StatelessWidget {
  final int selectedIndex;
  final List<Chat> chats;
  final String? selectedChatId;
  final Chat? selectedChat;
  final String? userDisplayName;
  final AuthSession? session;
  final VoidCallback? onCreateChat;
  final SendMessageCallback? onSendMessage;
  final Future<ChatFile?> Function(String chatId)? onUploadFile;
  final Future<ChatFile?> Function()? onUploadFileForComposer;
  final Future<void> Function(ChatFile file)? onDownloadFile;
  final List<ComposerAttachment> composerAttachments;
  final void Function(String attachmentId)? onRemoveComposerAttachment;
  final bool isSendingMessage;
  final bool isChatLoading;
  final bool Function(String chatId)? isTypingInChat;

  const ZenWorkspace({
    super.key,
    this.selectedIndex = 0,
    this.chats = const [],
    this.selectedChatId,
    this.selectedChat,
    this.userDisplayName,
    this.session,
    this.onCreateChat,
    this.onSendMessage,
    this.onUploadFile,
    this.onUploadFileForComposer,
    this.onDownloadFile,
    this.composerAttachments = const [],
    this.onRemoveComposerAttachment,
    this.isSendingMessage = false,
    this.isChatLoading = false,
    this.isTypingInChat,
  });

  @override
  Widget build(BuildContext context) {
    // If a chat is selected, show the chat view
    if (selectedChatId != null) {
      Chat? resolvedChat = selectedChat;
      if (resolvedChat == null) {
        try {
          resolvedChat = chats.firstWhere((c) => c.id == selectedChatId);
        } catch (_) {
              resolvedChat = Chat(
                id: selectedChatId!,
                uid: '',
                title: context.t('chat'),
                messages: const [],
              );
        }
      }
      final bool isPlaceholder = selectedChat == null;
      return Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 900),
          child: _ChatView(
            chat: resolvedChat,
            session: session,
            onSend: onSendMessage,
            onCreate: onCreateChat,
            isSending: isSendingMessage,
            isLoading: isChatLoading || isPlaceholder,
            onUploadFile: onUploadFile,
            onDownloadFile: onDownloadFile,
            isTyping: isTypingInChat != null ? isTypingInChat!(resolvedChat.id) : false,
          ),
        ),
      );
    }

    // If no chat selected and user is in main workspace, show the big centered composer
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 64.0, vertical: 48.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          ValueListenableBuilder<int>(
            valueListenable: aiModelSelectionNotifier,
            builder: (context, index, _) {
              return Center(
                child: ModelSelectorChip(
                  option: kAiModelOptions[index],
                  compact: true,
                  onTap: () => _openModelPicker(context),
                ),
              );
            },
          ),
          const SizedBox(height: 18),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  () {
                    final name = userDisplayName?.trim();
                    if (name != null && name.isNotEmpty) {
                        return context.t('greeting_with_name', args: {'name': name});
                    }
                      return context.t('greeting');
                  }(),
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.displaySmall?.copyWith(
                    fontWeight: FontWeight.w500,
                    color: Theme.of(context)
                        .colorScheme
                        .onSurface
                        .withOpacity(0.9),
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.fade,
                  softWrap: false,
                ),
                const SizedBox(height: 36),
                // show big composer when no chat is selected
                ZenChatComposer(
                  onSend: onSendMessage,
                  isSending: isSendingMessage,
                  onUploadFile: onUploadFileForComposer,
                  pendingAttachments: composerAttachments,
                  onRemoveAttachment: onRemoveComposerAttachment,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // removed unused time formatter

  Future<void> _openModelPicker(BuildContext context) async {
    final selected = await showAiModelPickerDialog(
      context,
      currentIndex: getSelectedAiModelIndex(),
    );
    if (selected != null) {
      setSelectedAiModelIndex(selected);
    }
  }
}

class _ChatView extends StatefulWidget {
  final Chat chat;
  final AuthSession? session;
  final SendMessageCallback? onSend;
  final VoidCallback? onCreate;
  final bool isSending;
  final bool isLoading;
  final bool isTyping;
  final Future<ChatFile?> Function(String chatId)? onUploadFile;
  final Future<void> Function(ChatFile file)? onDownloadFile;

  const _ChatView({
    required this.chat,
    this.session,
    this.onSend,
    this.onCreate,
    this.isSending = false,
    this.isLoading = false,
    this.isTyping = false,
    this.onUploadFile,
    this.onDownloadFile,
  });

  @override
  State<_ChatView> createState() => _ChatViewState();
}

class _ChatViewState extends State<_ChatView> {
  final TextEditingController _ctrl = TextEditingController();
  final ScrollController _scroll = ScrollController();
  final FocusNode _inputFocus = FocusNode();
  final List<ChatFile> _pendingFiles = [];
  bool _isUploadingFile = false;

  @override
  void dispose() {
    _ctrl.dispose();
    _scroll.dispose();
    _inputFocus.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    // ensure the input is focused when the chat view appears
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _inputFocus.requestFocus();
      }
    });
  }

  Future<void> _send() async {
    if (widget.onSend == null) return;
    final text = _ctrl.text.trim();
    final hasText = text.isNotEmpty;
    final hasAttachments = _pendingFiles.isNotEmpty;
    if (!hasText && !hasAttachments) return;

    final attachmentIds = _pendingFiles.map((file) => file.id).toList();
    try {
      await widget.onSend!.call(text, fileIds: attachmentIds);
    } catch (_) {
      return;
    }

    if (!mounted) return;
    _ctrl.clear();
    setState(() {
      _pendingFiles.clear();
    });

    Future.delayed(const Duration(milliseconds: 120), () {
      if (_scroll.hasClients) {
        _scroll.animateTo(
          _scroll.position.maxScrollExtent + 80,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _handleUploadFile() async {
    if (widget.onUploadFile == null || _isUploadingFile) return;
    setState(() => _isUploadingFile = true);
    try {
      final uploaded = await widget.onUploadFile!.call(widget.chat.id);
      if (!mounted || uploaded == null) return;
      setState(() {
        _pendingFiles.add(uploaded);
      });
    } finally {
      if (mounted) {
        setState(() => _isUploadingFile = false);
      }
    }
  }

  void _removePendingFile(ChatFile file) {
    setState(() {
      _pendingFiles.remove(file);
    });
  }

  @override
  Widget build(BuildContext context) {
    final chat = widget.chat;
    final messages = chat.messages;
    final fileLookup = {for (final file in chat.files) file.id: file};
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    final composerBorderColor = colorScheme.outlineVariant.withOpacity(
      isDark ? 0.4 : 0.32,
    );
    final composerBackground = colorScheme.surface;
    final composerShadow = theme.shadowColor.withOpacity(isDark ? 0.5 : 0.12);
    return Padding(
      padding: const EdgeInsets.all(24.0),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                chat.title ?? 'Chat',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              IconButton(
                onPressed: widget.onCreate,
                icon: const Icon(Icons.add),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Expanded(
            child: widget.isLoading && messages.isEmpty
                ? const Center(child: CircularProgressIndicator())
                : messages.isEmpty
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 32.0),
                          child: Text(
                            context.t('no_messages_yet'),
                            style: theme.textTheme.bodyLarge,
                          ),
                    ),
                  )
                : ListView.builder(
                    controller: _scroll,
                    itemCount: messages.length + (widget.isTyping ? 1 : 0),
                    itemBuilder: (context, i) {
                      // Show typing indicator as the last item
                      if (i == messages.length && widget.isTyping) {
                        return const _TypingIndicator();
                      }
                      final m = messages[i];
                      final bg = m.fromUser
                          ? colorScheme.primary
                          : colorScheme.surfaceVariant;
                      final fg = m.fromUser
                          ? colorScheme.onPrimary
                          : colorScheme.onSurface.withOpacity(0.92);
                      final attachments = m.fileIds
                          .map((id) => fileLookup[id])
                          .whereType<ChatFile>()
                          .toList();
                      final messageText = m.content.trim();
                      return Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8.0),
                        child: Row(
                          mainAxisAlignment: m.fromUser
                              ? MainAxisAlignment.end
                              : MainAxisAlignment.start,
                          children: [
                            Flexible(
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 14,
                                  vertical: 10,
                                ),
                                decoration: BoxDecoration(
                                  color: bg,
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  crossAxisAlignment: m.fromUser
                                      ? CrossAxisAlignment.end
                                      : CrossAxisAlignment.start,
                                  children: [
                                    if (messageText.isNotEmpty)
                                      MarkdownMessage(
                                        content: messageText,
                                        textColor: fg,
                                        fromUser: m.fromUser,
                                      ),
                                    if (attachments.isNotEmpty) ...[
                                      if (messageText.isNotEmpty)
                                        const SizedBox(height: 6),
                                      Wrap(
                                        spacing: 6,
                                        runSpacing: 6,
                                        alignment: m.fromUser
                                            ? WrapAlignment.end
                                            : WrapAlignment.start,
                                        children: [
                                          for (final attachment in attachments)
                                            _AttachmentChip(
                                              file: attachment,
                                              fromUser: m.fromUser,
                                              session: widget.session,
                                              onDownload: widget.onDownloadFile,
                                            ),
                                        ],
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
          ),
          const SizedBox(height: 12),
          if (_pendingFiles.isNotEmpty) ...[
            Align(
              alignment: Alignment.centerLeft,
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final file in _pendingFiles)
                    _PendingAttachmentChip(
                      file: file,
                      enabled:
                          !(widget.isSending ||
                              widget.isLoading ||
                              _isUploadingFile),
                      onRemove: () => _removePendingFile(file),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 12),
          ],
          if (_isUploadingFile)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.start,
                children: [
                  const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                  const SizedBox(width: 12),
                      Text(context.t('uploading_file'), style: theme.textTheme.bodyMedium),
                ],
              ),
            ),
          // bottom composer styled similar to big composer
          Row(
            children: [
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(color: composerBorderColor),
                    color: composerBackground,
                    boxShadow: [
                      BoxShadow(
                        color: composerShadow,
                        blurRadius: 18,
                        offset: const Offset(0, 8),
                      ),
                    ],
                  ),
                  child: Row(
                    children: [
                      _RoundActionButton(
                        icon: Icons.attach_file,
                        tooltip: _isUploadingFile
                            ? 'Uploading…'
                            : 'Upload file',
                        onPressed:
                            widget.onUploadFile == null ||
                                widget.isSending ||
                                widget.isLoading ||
                                _isUploadingFile
                            ? null
                            : _handleUploadFile,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Shortcuts(
                          shortcuts: <LogicalKeySet, Intent>{
                            LogicalKeySet(LogicalKeyboardKey.enter):
                                const SendIntent(),
                          },
                          child: Actions(
                            actions: <Type, Action<Intent>>{
                              SendIntent: CallbackAction<SendIntent>(
                                onInvoke: (intent) {
                                  _send();
                                  return null;
                                },
                              ),
                            },
                            child: TextField(
                              controller: _ctrl,
                              focusNode: _inputFocus,
                              autofocus: true,
                              keyboardType: TextInputType.multiline,
                              maxLines: 3,
                              decoration: const InputDecoration.collapsed(
                                hintText: 'Send a message...',
                              ),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      _RoundActionButton(
                        icon: Icons.mic_none,
                        tooltip: 'Voice',
                        onPressed: () {},
                      ),
                      const SizedBox(width: 8),
                      _RoundActionButton(
                        icon: Icons.send_rounded,
                        tooltip: 'Send',
                        onPressed:
                            widget.isSending ||
                                widget.isLoading ||
                                _isUploadingFile
                            ? null
                            : () {
                                _send();
                              },
                        backgroundColor: colorScheme.primary,
                        borderColor: Colors.transparent,
                        iconColor: colorScheme.onPrimary,
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class SendIntent extends Intent {
  const SendIntent();
}

class _AttachmentChip extends StatelessWidget {
  final ChatFile file;
  final bool fromUser;
  final AuthSession? session;
  final void Function(ChatFile)? onDownload;

  const _AttachmentChip({
    required this.file,
    required this.fromUser,
    this.session,
    this.onDownload,
  });

  bool get _isImage {
    final mime = file.mimeType?.toLowerCase();
    if (mime != null && mime.startsWith('image/')) {
      return true;
    }
    final name = file.fileName.toLowerCase();
    const imageExtensions = [
      '.png',
      '.jpg',
      '.jpeg',
      '.gif',
      '.webp',
      '.bmp',
      '.heic',
      '.heif',
      '.tiff',
      '.tif',
    ];
    return imageExtensions.any(name.endsWith);
  }

  @override
  Widget build(BuildContext context) {
    if (_isImage && session != null && session!.idToken.isNotEmpty) {
      return _ImageAttachmentPreview(
        file: file,
        fromUser: fromUser,
        session: session!,
      );
    }

    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final background = fromUser
        ? colorScheme.onPrimary.withOpacity(0.16)
        : colorScheme.onSurface.withOpacity(0.08);
    final borderColor = fromUser
        ? colorScheme.onPrimary.withOpacity(0.24)
        : colorScheme.outlineVariant.withOpacity(0.4);
    final textColor = fromUser ? colorScheme.onPrimary : colorScheme.onSurface;
    final hasPreview = file.isImage && file.previewUrl.isNotEmpty;
    final previewUrl = hasPreview
        ? file.previewUrl
        : _maybeInlineUrl(file.downloadUrl);
    final sizeLabel = _formatBytes(file.size);

    return Tooltip(
      message: file.fileName,
      child: Container(
        width: hasPreview ? 220 : 240,
        constraints: const BoxConstraints(maxWidth: 240),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: background,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: borderColor),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (hasPreview && previewUrl != null) ...[
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: AspectRatio(
                  aspectRatio: 4 / 3,
                  child: Image.network(
                    previewUrl,
                    fit: BoxFit.cover,
                    filterQuality: FilterQuality.low,
                    errorBuilder: (context, error, stackTrace) => _PreviewFallback(
                      iconColor: textColor,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 8),
            ],
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  file.isImage ? Icons.image_outlined : Icons.insert_drive_file_outlined,
                  size: 20,
                  color: textColor,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        file.fileName,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: textColor,
                          fontWeight: FontWeight.w600,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      if (sizeLabel != null)
                        Text(
                          sizeLabel,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: textColor.withOpacity(0.75),
                          ),
                        ),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: 'Download',
                  icon: Icon(Icons.download_rounded, color: textColor),
                  onPressed: onDownload == null ? null : () => onDownload!(file),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  static String? _formatBytes(int bytes) {
    if (bytes <= 0) return null;
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    var size = bytes.toDouble();
    var unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    final formatted = unitIndex == 0
        ? size.toStringAsFixed(0)
        : size >= 10
            ? size.toStringAsFixed(0)
            : size.toStringAsFixed(1);
    return '$formatted ${units[unitIndex]}';
  }

  static String? _maybeInlineUrl(String? url) {
    if (url == null || url.isEmpty) return null;
    if (!url.contains('inline=')) {
      return url.contains('?') ? '$url&inline=1' : '$url?inline=1';
    }
    return url;
  }
}

class _PreviewFallback extends StatelessWidget {
  final Color iconColor;

  const _PreviewFallback({required this.iconColor});

  @override
  Widget build(BuildContext context) {
    return Container(
      color: iconColor.withOpacity(0.1),
      alignment: Alignment.center,
      child: Icon(
        Icons.image_not_supported_outlined,
        color: iconColor.withOpacity(0.7),
        size: 36,
      ),
    );
  }
}

class _ImageAttachmentPreview extends StatelessWidget {
  static const double _maxWidth = 180;
  static const double _aspectRatio = 4 / 3;

  final ChatFile file;
  final bool fromUser;
  final AuthSession session;

  const _ImageAttachmentPreview({
    required this.file,
    required this.fromUser,
    required this.session,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final borderColor = fromUser
        ? colorScheme.onPrimary.withOpacity(0.35)
        : colorScheme.outlineVariant.withOpacity(0.45);
    final placeholderColor = fromUser
        ? colorScheme.onPrimary.withOpacity(0.1)
        : colorScheme.onSurfaceVariant.withOpacity(0.08);

    return FutureBuilder<AuthSession>(
      future: BackendService.ensureValidToken(session),
      builder: (context, sessionSnapshot) {
        // show placeholder while waiting
        if (sessionSnapshot.connectionState == ConnectionState.waiting) {
          return Tooltip(
            message: file.fileName,
            child: _ImagePlaceholder(
              fileName: file.fileName,
              borderColor: borderColor,
              backgroundColor: placeholderColor,
              showLoader: true,
            ),
          );
        }

        // session refresh failed
        if (!sessionSnapshot.hasData) {
          return Tooltip(
            message: file.fileName,
            child: _ImagePlaceholder(
              fileName: file.fileName,
              borderColor: borderColor,
              backgroundColor: placeholderColor,
              icon: Icons.broken_image_outlined,
            ),
          );
        }

        final validSession = sessionSnapshot.data!;

        return FutureBuilder<String>(
          future: BackendService.getBackendUrl(),
          builder: (context, urlSnapshot) {
            // show placeholder while waiting
            if (urlSnapshot.connectionState == ConnectionState.waiting) {
              return Tooltip(
                message: file.fileName,
                child: _ImagePlaceholder(
                  fileName: file.fileName,
                  borderColor: borderColor,
                  backgroundColor: placeholderColor,
                  showLoader: true,
                ),
              );
            }

            // missing backend url
            if (!urlSnapshot.hasData || urlSnapshot.data!.isEmpty) {
              return Tooltip(
                message: file.fileName,
                child: _ImagePlaceholder(
                  fileName: file.fileName,
                  borderColor: borderColor,
                  backgroundColor: placeholderColor,
                  icon: Icons.broken_image_outlined,
                ),
              );
            }

            // no download path
            if (file.downloadPath.isEmpty) {
              return Tooltip(
                message: file.fileName,
                child: _ImagePlaceholder(
                  fileName: file.fileName,
                  borderColor: borderColor,
                  backgroundColor: placeholderColor,
                  icon: Icons.broken_image_outlined,
                ),
              );
            }

            final url = _composeUrl(urlSnapshot.data!);
            return Tooltip(
              message: file.fileName,
              child: SizedBox(
                width: _maxWidth,
                child: AspectRatio(
                  aspectRatio: _aspectRatio,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: Container(
                      decoration: BoxDecoration(
                        border: Border.all(color: borderColor),
                        color: placeholderColor,
                      ),
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          Image.network(
                            url,
                            headers: {'Authorization': 'Bearer ${validSession.idToken}'},
                            fit: BoxFit.cover,
                            errorBuilder: (context, error, stackTrace) {
                              return _ImagePlaceholder(
                                fileName: file.fileName,
                                borderColor: borderColor,
                                backgroundColor: placeholderColor,
                                icon: Icons.broken_image_outlined,
                              );
                            },
                          ),
                          Positioned(
                            left: 0,
                            right: 0,
                            bottom: 0,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 4,
                              ),
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  begin: Alignment.topCenter,
                                  end: Alignment.bottomCenter,
                                  colors: [
                                    Colors.black.withOpacity(0.0),
                                    Colors.black.withOpacity(0.65),
                                  ],
                                ),
                              ),
                              child: Text(
                                file.fileName,
                                style: theme.textTheme.labelSmall?.copyWith(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w600,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }

  String _composeUrl(String base) {
    if (file.downloadPath.startsWith('http')) {
      return file.downloadPath;
    }
    var normalizedBase = base.endsWith('/') ? base.substring(0, base.length - 1) : base;
    var normalizedPath = file.downloadPath.startsWith('/') ? file.downloadPath : '/${file.downloadPath}';
    return normalizedBase + normalizedPath;
  }
}

class _ImagePlaceholder extends StatelessWidget {
  const _ImagePlaceholder({
    required this.fileName,
    required this.borderColor,
    required this.backgroundColor,
    this.icon = Icons.image_outlined,
    this.showLoader = false,
  });

  final String fileName;
  final Color borderColor;
  final Color backgroundColor;
  final IconData icon;
  final bool showLoader;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SizedBox(
      width: _ImageAttachmentPreview._maxWidth,
      child: AspectRatio(
        aspectRatio: _ImageAttachmentPreview._aspectRatio,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: Container(
            decoration: BoxDecoration(
              color: backgroundColor,
              border: Border.all(color: borderColor),
            ),
            alignment: Alignment.center,
            child: showLoader
                ? const SizedBox.square(
                    dimension: 24,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Icon(icon, color: theme.hintColor, size: 32),
          ),
        ),
      ),
    );
  }
}

class _PendingAttachmentChip extends StatelessWidget {
  final ChatFile file;
  final VoidCallback onRemove;
  final bool enabled;

  const _PendingAttachmentChip({
    required this.file,
    required this.onRemove,
    required this.enabled,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Tooltip(
      message: file.fileName,
      child: InputChip(
        avatar: const Icon(Icons.attach_file, size: 18),
        label: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 180),
          child: Text(file.fileName, overflow: TextOverflow.ellipsis),
        ),
        onDeleted: enabled ? onRemove : null,
        deleteIcon: Icon(
          Icons.close,
          size: 18,
          color: enabled ? null : theme.disabledColor,
        ),
        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
        showCheckmark: false,
        selected: false,
        isEnabled: enabled,
      ),
    );
  }
}

class _ComposerPendingAttachmentChip extends StatelessWidget {
  final ComposerAttachment attachment;
  final VoidCallback? onRemove;
  final bool enabled;

  const _ComposerPendingAttachmentChip({
    required this.attachment,
    required this.enabled,
    this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Tooltip(
      message: attachment.fileName,
      child: InputChip(
        avatar: const Icon(Icons.attach_file, size: 18),
        label: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 220),
          child: Text(attachment.fileName, overflow: TextOverflow.ellipsis),
        ),
        onDeleted: enabled ? onRemove : null,
        deleteIcon: Icon(
          Icons.close,
          size: 18,
          color: enabled ? null : theme.disabledColor,
        ),
        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
        showCheckmark: false,
        selected: false,
        isEnabled: enabled,
      ),
    );
  }
}

class ZenChatComposer extends StatefulWidget {
  final SendMessageCallback? onSend;
  final bool autofocus;
  final bool isSending;
  final Future<ChatFile?> Function()? onUploadFile;
  final List<ComposerAttachment> pendingAttachments;
  final void Function(String attachmentId)? onRemoveAttachment;

  const ZenChatComposer({
    super.key,
    this.onSend,
    this.autofocus = true,
    this.isSending = false,
    this.onUploadFile,
    this.pendingAttachments = const [],
    this.onRemoveAttachment,
  });

  @override
  State<ZenChatComposer> createState() => _ZenChatComposerState();
}

class _ZenChatComposerState extends State<ZenChatComposer> {
  final TextEditingController _ctrl = TextEditingController();
  final FocusNode _focus = FocusNode();
  bool _isUploadingFile = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && widget.autofocus) _focus.requestFocus();
    });
  }

  @override
  void dispose() {
    _ctrl.dispose();
    _focus.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _ctrl.text.trim();
    final hasText = text.isNotEmpty;
    final hasAttachments = widget.pendingAttachments.isNotEmpty;
    if (!hasText && !hasAttachments) return;
    if (widget.isSending) return;
    await widget.onSend?.call(text, fileIds: const []);
    _ctrl.clear();
  }

  Future<void> _handleUploadFile() async {
    if (widget.onUploadFile == null || _isUploadingFile || widget.isSending) {
      return;
    }
    setState(() => _isUploadingFile = true);
    try {
      await widget.onUploadFile!.call();
    } finally {
      if (mounted) {
        setState(() => _isUploadingFile = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    final borderColor = colorScheme.outlineVariant.withOpacity(
      isDark ? 0.38 : 0.32,
    );
    final composerBackground = colorScheme.surface;
    final shadowColor = theme.shadowColor.withOpacity(isDark ? 0.55 : 0.12);

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (widget.pendingAttachments.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              alignment: WrapAlignment.center,
              children: [
                for (final attachment in widget.pendingAttachments)
                  _ComposerPendingAttachmentChip(
                    attachment: attachment,
                    enabled: !(widget.isSending || _isUploadingFile),
                    onRemove: widget.onRemoveAttachment == null
                        ? null
                        : () => widget.onRemoveAttachment!(attachment.id),
                  ),
              ],
            ),
          ),
        Align(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 940),
            child: Container(
              padding: const EdgeInsets.symmetric(
                horizontal: 16.0,
                vertical: 10.0,
              ),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(28),
                color: composerBackground,
                border: Border.all(color: borderColor),
                boxShadow: [
                  BoxShadow(
                    color: shadowColor,
                    blurRadius: 24,
                    offset: const Offset(0, 10),
                  ),
                ],
              ),
              child: Row(
                children: [
                  _RoundActionButton(
                    icon: Icons.attach_file,
                    tooltip: _isUploadingFile ? 'Uploading…' : 'Upload a file',
                    onPressed:
                        widget.onUploadFile == null ||
                            _isUploadingFile ||
                            widget.isSending
                        ? null
                        : _handleUploadFile,
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Shortcuts(
                      shortcuts: <LogicalKeySet, Intent>{
                        LogicalKeySet(LogicalKeyboardKey.enter):
                            const SendIntent(),
                      },
                      child: Actions(
                        actions: <Type, Action<Intent>>{
                          SendIntent: CallbackAction<SendIntent>(
                            onInvoke: (intent) {
                              // if shift is pressed, insert newline instead
                              if (RawKeyboard.instance.keysPressed.contains(
                                    LogicalKeyboardKey.shiftLeft,
                                  ) ||
                                  RawKeyboard.instance.keysPressed.contains(
                                    LogicalKeyboardKey.shiftRight,
                                  )) {
                                final pos = _ctrl.selection.baseOffset;
                                final txt = _ctrl.text;
                                final newText =
                                    txt.substring(0, pos) +
                                    '\n' +
                                    txt.substring(pos);
                                _ctrl.text = newText;
                                _ctrl.selection = TextSelection.collapsed(
                                  offset: pos + 1,
                                );
                                return null;
                              }
                              _send();
                              return null;
                            },
                          ),
                        },
                        child: TextField(
                          controller: _ctrl,
                          focusNode: _focus,
                          autofocus: widget.autofocus,
                          enabled: !widget.isSending,
                          keyboardType: TextInputType.multiline,
                          maxLines: 3,
                          decoration: InputDecoration(
                            hintText: context.t('ask_anything'),
                            border: InputBorder.none,
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  _RoundActionButton(
                    icon: Icons.mic_none,
                    tooltip: 'Voice to text',
                    onPressed: () {},
                  ),
                  const SizedBox(width: 12),
                  Stack(
                    alignment: Alignment.center,
                    children: [
                      _RoundActionButton(
                        icon: Icons.send_rounded,
                        tooltip: 'Send message',
                        onPressed: widget.isSending || _isUploadingFile
                            ? null
                            : () {
                                _send();
                              },
                        backgroundColor: colorScheme.primary,
                        borderColor: Colors.transparent,
                        iconColor: colorScheme.onPrimary,
                      ),
                      if (widget.isSending)
                        const SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(strokeWidth: 2.2),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}


class _RoundActionButton extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;
  final Color? backgroundColor;
  final Color? borderColor;
  final Color? iconColor;

  const _RoundActionButton({
    required this.icon,
    required this.tooltip,
    this.onPressed,
    this.backgroundColor,
    this.borderColor,
    this.iconColor,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    final defaultBackground = colorScheme.surfaceVariant.withOpacity(
      isDark ? 0.45 : 0.9,
    );
    final defaultBorder = colorScheme.outlineVariant.withOpacity(
      isDark ? 0.4 : 0.5,
    );
    final defaultIcon = colorScheme.onSurfaceVariant;
    const size = 44.0;
    const iconSize = 24.0;
    final effectiveBackground = backgroundColor ?? defaultBackground;
    final effectiveBorder = borderColor ?? defaultBorder;
    final effectiveIcon = iconColor ?? defaultIcon;
    final bool enabled = onPressed != null;

    return Tooltip(
      message: tooltip,
      child: InkResponse(
        onTap: onPressed,
        radius: size / 2 + 6,
        containedInkWell: true,
        child: Opacity(
          opacity: enabled ? 1 : 0.5,
          child: Container(
            width: size,
            height: size,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: effectiveBackground,
              border: Border.all(color: effectiveBorder),
            ),
            child: Icon(icon, color: effectiveIcon, size: iconSize),
          ),
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
    with TickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation1;
  late Animation<double> _animation2;
  late Animation<double> _animation3;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 1200),
      vsync: this,
    );

    _animation1 = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.0, 0.4, curve: Curves.easeInOut),
      ),
    );

    _animation2 = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.2, 0.6, curve: Curves.easeInOut),
      ),
    );

    _animation3 = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.4, 0.8, curve: Curves.easeInOut),
      ),
    );

    _controller.repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final bg = colorScheme.surfaceVariant;
    final fg = colorScheme.onSurface.withOpacity(0.6);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.start,
        children: [
          Flexible(
            child: Container(
              padding: const EdgeInsets.symmetric(
                horizontal: 14,
                vertical: 10,
              ),
              decoration: BoxDecoration(
                color: bg,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _AnimatedDot(animation: _animation1, color: fg),
                  const SizedBox(width: 4),
                  _AnimatedDot(animation: _animation2, color: fg),
                  const SizedBox(width: 4),
                  _AnimatedDot(animation: _animation3, color: fg),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AnimatedDot extends StatelessWidget {
  final Animation<double> animation;
  final Color color;

  const _AnimatedDot({
    required this.animation,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: animation,
      builder: (context, child) {
        return Transform.scale(
          scale: 0.5 + (animation.value * 0.5),
          child: Opacity(
            opacity: 0.3 + (animation.value * 0.7),
            child: Container(
              width: 6,
              height: 6,
              decoration: BoxDecoration(
                color: color,
                shape: BoxShape.circle,
              ),
            ),
          ),
        );
      },
    );
  }
}
