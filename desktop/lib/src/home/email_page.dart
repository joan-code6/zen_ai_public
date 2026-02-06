import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:intl/intl.dart';

import '../models/auth.dart';
import '../models/email.dart';
import '../services/email_service.dart';
import 'email_connection_page.dart';
import 'email_analysis_page.dart';
import '../i18n/i18n.dart';

class EmailPage extends StatefulWidget {
  final String userId;
  final AuthSession? session;
  final VoidCallback? onRefresh;

  const EmailPage({
    super.key,
    required this.userId,
    this.session,
    this.onRefresh,
  });

  @override
  State<EmailPage> createState() => _EmailPageState();
}

class _EmailPageState extends State<EmailPage> {
  bool _showPlainText = false;

  String _unescapeHtmlEntities(String s) {
    if (s.isEmpty) return s;
    var r = s;
    r = r.replaceAll('&nbsp;', ' ');
    r = r.replaceAll('&amp;', '&');
    r = r.replaceAll('&lt;', '<');
    r = r.replaceAll('&gt;', '>');
    r = r.replaceAll('&quot;', '"');
    r = r.replaceAll('&#39;', "'");
    r = r.replaceAll('&rsquo;', "'");
    r = r.replaceAll('&ldquo;', '"');
    r = r.replaceAll('&rdquo;', '"');
    // Decimal numeric entities
    r = r.replaceAllMapped(RegExp(r'&#(\d+);'), (m) {
      final code = int.tryParse(m[1] ?? '0') ?? 0;
      return String.fromCharCode(code);
    });
    // Hex numeric entities
    r = r.replaceAllMapped(RegExp(r'&#x([0-9A-Fa-f]+);'), (m) {
      final code = int.tryParse(m[1] ?? '0', radix: 16) ?? 0;
      return String.fromCharCode(code);
    });
    return r;
  }

  String _extractText(String html) {
    if (html.isEmpty) return '';
    // Remove tags
    var t = html.replaceAll(RegExp('<[^>]*>'), ' ');
    t = _unescapeHtmlEntities(t);
    t = t.replaceAll(RegExp(r'\s+'), ' ').trim();
    debugPrint('extractText: originalLen=${html.length} extractedLen=${t.length} snippet=${t.substring(0, t.length.clamp(0, 200))}');
    return t;
  }

  // (state continues below)
  List<Email> _emails = [];
  Email? _selectedEmail;
  bool _isLoading = false;
  bool _isCheckingConnection = true;
  EmailConnectionStatus? _connectionStatus;
  String? _error;
  String _searchQuery = '';
  final TextEditingController _searchController = TextEditingController();

  // Tracks IDs that are currently being fetched for details
  final Set<String> _loadingDetails = {};
  // Tracks IDs that already have been loaded with details
  final Set<String> _detailsLoaded = {};

  // Tracks analysis loading state per message id
  final Set<String> _loadingAnalysis = {};

  // Controller to detect which items are visible for lazy loading
  ScrollController? _scrollController;

  // Approximate item height used to compute visible indices
  static const double _itemApproxHeight = 78.0;
  // Number of items beyond the visible viewport to pre-load
  static const int _preloadExtra = 4;

  // Simple debounce to avoid excessive load checks while scrolling
  DateTime? _lastVisibilityCheck;

  @override
  void initState() {
    super.initState();
    _checkConnection();

    // Initialize scroll controller for lazy-loading of message details
    _scrollController = ScrollController()
      ..addListener(() {
        // Throttle visibility checks to ~150ms
        final now = DateTime.now();
        if (_lastVisibilityCheck == null || now.difference(_lastVisibilityCheck!).inMilliseconds > 150) {
          _lastVisibilityCheck = now;
          _maybeLoadVisibleDetails();
        }
      });

    _searchController.addListener(() {
      setState(() => _searchQuery = _searchController.text.toLowerCase());
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    _scrollController?.removeListener(() {});
    _scrollController?.dispose();
    super.dispose();
  }

  Future<void> _checkConnection() async {
    setState(() {
      _isCheckingConnection = true;
      _error = null;
    });

    try {
      // Try checking different providers
      EmailConnectionStatus? status;
      
      if (widget.session != null) {
        try {
          status = await EmailService.checkGmailConnection(
            session: widget.session!,
          );
        } catch (_) {
          // Gmail not connected, try IMAP
          try {
            status = await EmailService.checkImapConnection(
              session: widget.session!,
            );
          } catch (_) {
            // IMAP not connected either
          }
        }
      }

      if (mounted) {
        setState(() {
          _connectionStatus = status;
          _isCheckingConnection = false;
        });

        // If connected, load emails
        if (status != null && status.connected) {
          _loadEmails();
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _isCheckingConnection = false;
        });
      }
    }
  }

  Future<void> _loadEmails() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      if (widget.session == null) {
        throw Exception('Please sign in first');
      }
      
      final emails = await EmailService.fetchEmails(
        session: widget.session!,
        maxResults: 50,
      );
      if (mounted) {
        setState(() {
          _emails = emails;
          _isLoading = false;
        });

        // Seed the loaded set for any items that already contain details
        for (final e in _emails) {
          if (e.subject.isNotEmpty || e.body.isNotEmpty) {
            _detailsLoaded.add(e.id);
          }
        }

        // Trigger an initial visibility-based load (visible + preload)
        _maybeLoadVisibleDetails();
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _pollNewEmails() async {
    setState(() => _isLoading = true);
    
    try {
      final newEmails = await EmailService.pollEmails(userId: widget.userId);
      if (mounted) {
        setState(() {
          // Add new emails to the beginning if they don't already exist
          for (final email in newEmails) {
            if (!_emails.any((e) => e.id == email.id)) {
              _emails.insert(0, email);
            }
          }
          _isLoading = false;
        });
        
        if (newEmails.isNotEmpty) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(context.t('new_emails_received', args: {'count': newEmails.length.toString()})),
              duration: const Duration(seconds: 2),
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(context.t('failed_to_poll_emails', args: {'error': e.toString()})),
            backgroundColor: Theme.of(context).colorScheme.error,
          ),
        );
      }
    }
  }

  Future<void> _markAsRead(Email email) async {
    // TODO: Backend endpoints not implemented yet
    // Waiting for: POST /email/gmail/messages/{id}/read and POST /email/imap/messages/{id}/read
    return;
    
    /*
    if (email.isRead) return;
    if (widget.session == null) return;

    try {
      final isGmail = _connectionStatus?.provider == 'gmail';
      await EmailService.markAsRead(
        emailId: email.id,
        session: widget.session!,
        isGmail: isGmail,
      );
      
      if (mounted) {
        setState(() {
          final index = _emails.indexWhere((e) => e.id == email.id);
          if (index != -1) {
            _emails[index] = email.copyWith(isRead: true);
            if (_selectedEmail?.id == email.id) {
              _selectedEmail = _emails[index];
            }
          }
        });
      }
    } catch (e) {
      // Silently fail
    }
    */
  }

  Future<void> _toggleFlag(Email email) async {
    // TODO: Backend endpoints not implemented yet
    // Waiting for: POST /email/gmail/messages/{id}/star and POST /email/imap/messages/{id}/flag
    return;
    
    /*
    if (widget.session == null) return;

    try {
      final isGmail = _connectionStatus?.provider == 'gmail';
      await EmailService.toggleFlag(
        emailId: email.id,
        session: widget.session!,
        isFlagged: !email.isFlagged,
        isGmail: isGmail,
      );
      
      if (mounted) {
        setState(() {
          final index = _emails.indexWhere((e) => e.id == email.id);
          if (index != -1) {
            _emails[index] = email.copyWith(isFlagged: !email.isFlagged);
            if (_selectedEmail?.id == email.id) {
              _selectedEmail = _emails[index];
            }
          }
        });
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(context.t('failed_to_update_flag', args: {'error': e.toString()})),
          backgroundColor: Theme.of(context).colorScheme.error,
        ),
      );
    }
    */
  }

  // Lazy-load details for the visible range plus a small prefetch window
  Future<void> _maybeLoadVisibleDetails() async {
    if (widget.session == null) return;
    if (_emails.isEmpty) return;
    final controller = _scrollController;
    if (controller == null || !controller.hasClients) {
      // If no controller attached (e.g., not built yet), pre-load the top window
      _fetchDetailsForRange(0, (_preloadExtra).clamp(0, _emails.length - 1));
      return;
    }

    final offset = controller.offset;
    final viewport = controller.position.viewportDimension;

    final firstIndex = (offset / _itemApproxHeight).floor().clamp(0, _emails.length - 1);
    final lastIndex = ((offset + viewport) / _itemApproxHeight).ceil().clamp(0, _emails.length - 1);

    final start = (firstIndex - _preloadExtra).clamp(0, _emails.length - 1);
    final end = (lastIndex + _preloadExtra).clamp(0, _emails.length - 1);

    await _fetchDetailsForRange(start, end);
  }

  // Fetch details for a contiguous range of indices sequentially (to keep network small)
  Future<void> _fetchDetailsForRange(int startIndex, int endIndex) async {
    if (widget.session == null) return;

    // Ensure indices valid
    startIndex = startIndex.clamp(0, _emails.length - 1);
    endIndex = endIndex.clamp(0, _emails.length - 1);

    for (var i = startIndex; i <= endIndex; i++) {
      if (!mounted) return;
      final email = _emails[i];
      if (_detailsLoaded.contains(email.id) || _loadingDetails.contains(email.id)) continue;

      // Mark loading
      setState(() => _loadingDetails.add(email.id));

      try {
        debugPrint('fetchDetailsForRange: fetching ${email.id} at index $i selected=${_selectedEmail?.id}');
        final isGmail = _connectionStatus?.provider == 'gmail';
        final detailed = await _fetchDetailWithRetry(email.id, isGmail: isGmail);
        debugPrint('fetchDetailsForRange: received detailed=${detailed?.id}');
        if (detailed != null && mounted) {
          setState(() {
            final idx = _emails.indexWhere((e) => e.id == detailed.id);
            debugPrint('fetchDetailsForRange: idx for ${detailed.id} = $idx');
            if (idx != -1) {
              final existing = _emails[idx];
              // Only replace if the new detail has meaningful content, or the existing one is empty
              final bool newHasContent = detailed.subject.isNotEmpty || detailed.body.isNotEmpty;
              final bool existingHasContent = existing.subject.isNotEmpty || existing.body.isNotEmpty;

              if (newHasContent || !existingHasContent) {
                _emails[idx] = detailed;
                if (_selectedEmail?.id == detailed.id) {
                  _selectedEmail = detailed;
                }

                // If the user currently has this message selected, try loading analysis immediately
                if (_selectedEmail?.id == detailed.id) {
                  _ensureAnalysisLoaded(detailed);
                }
                debugPrint('fetchDetailsForRange: updated email ${detailed.id} newHasContent=$newHasContent existingHasContent=$existingHasContent selectedNow=${_selectedEmail?.id == detailed.id}');
              } else {
                // Don't overwrite a populated view with an empty response
                // Log for debugging
                debugPrint('Skipped overwriting message ${detailed.id} with empty detail response');
              }
            } else {
              debugPrint('fetchDetailsForRange: could not find index for ${detailed.id} in _emails');
            }

            // Mark as loaded to avoid repeated failing fetches
            _detailsLoaded.add(detailed.id);

            if (!(detailed.subject.isNotEmpty || detailed.body.isNotEmpty)) {
              debugPrint('Message ${detailed.id} returned empty subject/body');
            }
          });
        }
      } finally {
        if (mounted) setState(() => _loadingDetails.remove(email.id));
        debugPrint('fetchDetailsForRange: finished ${email.id}');
      }

      // Small spacing between requests to avoid bursts
      await Future.delayed(const Duration(milliseconds: 75));
    }
  }

  // Fetch single detail with a few retries if the returned details look empty
  Future<Email?> _fetchDetailWithRetry(String messageId, {required bool isGmail, int maxAttempts = 3}) async {
    if (widget.session == null) return null;

    for (var attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        debugPrint('fetchDetailWithRetry: attempt $attempt for $messageId');
        final detailed = await EmailService.fetchEmailDetails(
          messageId: messageId,
          session: widget.session!,
          isGmail: isGmail,
        );

        debugPrint('fetchDetailWithRetry: got $messageId subjectLen=${detailed.subject.length} bodyLen=${detailed.body.length}');

        // If body/subject are non-empty, consider it valid
        if ((detailed.subject.isNotEmpty) || (detailed.body.isNotEmpty)) {
          debugPrint('fetchDetailWithRetry: returning details for $messageId');
          return detailed;
        }

        // If we got an empty response, retry after a delay (exponential backoff)
        if (attempt < maxAttempts) {
          await Future.delayed(Duration(milliseconds: 150 * (1 << (attempt - 1))));
          continue;
        }

        // Last attempt returned empty — still return it so UI can show 'No content available'
        debugPrint('fetchDetailWithRetry: last attempt returned empty for $messageId');
        return detailed;
      } catch (e) {
        debugPrint('fetchDetailWithRetry: error for $messageId attempt $attempt: $e');
        if (attempt < maxAttempts) {
          await Future.delayed(Duration(milliseconds: 120 * attempt));
          continue;
        }
        // On final failure, return null
        return null;
      }
    }
    return null;
  }

  // Ensure AI analysis for opened email is loaded and attached to the email
  Future<void> _ensureAnalysisLoaded(Email email) async {
    if (widget.session == null) return;
    if (_loadingAnalysis.contains(email.id)) return;
    if (email.analysis != null) return; // already present
    final provider = _connectionStatus?.provider;
    if (provider == null) return;

    final analysisId = '${widget.userId}_${provider}_${email.id}';

    setState(() => _loadingAnalysis.add(email.id));

    try {
      final record = await EmailService.getAnalysisById(
        analysisId: analysisId,
        session: widget.session!,
      );

      if (mounted) {
        // Map EmailAnalysisRecord -> EmailAnalysis model
        final mapped = EmailAnalysis(
          intent: record.importance,
          summary: record.contentSummary,
          entities: record.categories,
          metadata: record.extractedInfo,
        );

        setState(() {
          final idx = _emails.indexWhere((e) => e.id == email.id);
          if (idx != -1) {
            _emails[idx] = _emails[idx].copyWith(analysis: mapped);
            if (_selectedEmail?.id == email.id) {
              _selectedEmail = _emails[idx];
            }
          }
        });
      }
    } catch (e) {
      // Not fatal; analysis may not exist. Ignore.
    } finally {
      if (mounted) setState(() => _loadingAnalysis.remove(email.id));
    }
  }

  Future<void> _disconnectEmail() async {
    // Show confirmation dialog
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(context.t('disconnect_email')),
        content: Text(context.t('disconnect_email_confirm')),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(context.t('cancel')),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(context.t('disconnect')),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    setState(() => _isLoading = true);

    try {
      // Disconnect based on provider (require active session for authorization)
      if (widget.session == null) {
        throw Exception('Please sign in first');
      }

      if (_connectionStatus?.provider == 'gmail') {
        await EmailService.disconnectGmail(session: widget.session!);
      } else if (_connectionStatus?.provider == 'imap') {
        await EmailService.disconnectImap(session: widget.session!);
      } else if (_connectionStatus?.provider == 'smtp') {
        await EmailService.disconnectSmtp(session: widget.session!);
      }

      if (mounted) {
        setState(() {
          _connectionStatus = null;
          _emails = [];
          _selectedEmail = null;
          _isLoading = false;
        });
        
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(context.t('email_account_disconnected')),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(context.t('failed_to_disconnect', args: {'error': e.toString()})),
            backgroundColor: Theme.of(context).colorScheme.error,
          ),
        );
      }
    }
  }

  List<Email> get _filteredEmails {
    if (_searchQuery.isEmpty) return _emails;
    
    return _emails.where((email) {
      return email.subject.toLowerCase().contains(_searchQuery) ||
          email.from.toLowerCase().contains(_searchQuery) ||
          email.senderName.toLowerCase().contains(_searchQuery) ||
          email.body.toLowerCase().contains(_searchQuery);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    // Show loading while checking connection
    if (_isCheckingConnection) {
      return Scaffold(
        backgroundColor: theme.scaffoldBackgroundColor,
        body: const Center(
          child: CircularProgressIndicator(),
        ),
      );
    }

    // Show connection page if not connected
    if (_connectionStatus == null || !_connectionStatus!.connected) {
      return EmailConnectionPage(
        session: widget.session,
        onConnectionEstablished: () {
          _checkConnection();
        },
      );
    }

    // Show inbox if connected
    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      body: Row(
        children: [
          // Email list panel
          Expanded(
            flex: 2,
            child: Column(
              children: [
                // Header with search and actions
                Container(
                  padding: const EdgeInsets.all(16.0),
                  decoration: BoxDecoration(
                    color: colorScheme.surface,
                    border: Border(
                      bottom: BorderSide(
                        color: colorScheme.outlineVariant.withAlpha((0.3 * 255).round()),
                      ),
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            'Inbox',
                            style: theme.textTheme.headlineSmall?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          if (_connectionStatus != null && _connectionStatus!.email != null) ...[
                            const SizedBox(width: 8),
                            Chip(
                              avatar: Icon(
                                _connectionStatus!.provider == 'gmail'
                                    ? Icons.email
                                    : Icons.mail_outline,
                                size: 16,
                              ),
                              label: Text(
                                _connectionStatus!.email!,
                                style: theme.textTheme.bodySmall,
                              ),
                              visualDensity: VisualDensity.compact,
                            ),
                          ],
                          const Spacer(),
                          IconButton(
                            tooltip: 'Analysis',
                            icon: const Icon(Icons.auto_awesome),
                            onPressed: () {
                              Navigator.of(context).push(MaterialPageRoute(
                                builder: (context) => EmailAnalysisPage(session: widget.session),
                              ));
                            },
                          ),
                          PopupMenuButton<String>(
                            icon: const Icon(Icons.more_vert),
                            onSelected: (value) async {
                              if (value == 'disconnect') {
                                await _disconnectEmail();
                              }
                            },
                            itemBuilder: (context) => [
                              PopupMenuItem(
                                value: 'disconnect',
                                child: Row(
                                  children: [
                                    const Icon(Icons.link_off),
                                    const SizedBox(width: 12),
                                    Text(context.t('disconnect')),
                                  ],
                                ),
                              ),
                            ],
                          ),
                          IconButton(
                            icon: _isLoading
                                ? SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : const Icon(Icons.refresh),
                            onPressed: _isLoading ? null : _pollNewEmails,
                            tooltip: 'Poll new emails',
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      // Search bar
                      TextField(
                        controller: _searchController,
                        decoration: InputDecoration(
                          hintText: 'Search emails...',
                          prefixIcon: const Icon(Icons.search),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 12,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                
                // Email list
                Expanded(
                  child: _buildEmailList(),
                ),
              ],
            ),
          ),
          
          // Email detail panel
          if (_selectedEmail != null)
            Expanded(
              flex: 3,
              child: _buildEmailDetail(_selectedEmail!),
            ),
        ],
      ),
    );
  }

  Widget _buildEmailList() {
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.error_outline,
              size: 64,
              color: Theme.of(context).colorScheme.error,
            ),
            const SizedBox(height: 16),
            Text(
              'Failed to load emails',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text(
              _error!,
              style: Theme.of(context).textTheme.bodySmall,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _loadEmails,
              child: Text(context.t('retry')),
            ),
          ],
        ),
      );
    }

    if (_isLoading && _emails.isEmpty) {
      return const Center(
        child: CircularProgressIndicator(),
      );
    }

    if (_emails.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.mail_outline,
              size: 64,
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
            const SizedBox(height: 16),
            Text(
              'No emails yet',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text(
              'Your inbox is empty',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      );
    }

    final filteredEmails = _filteredEmails;

    if (filteredEmails.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.search_off,
              size: 64,
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
            const SizedBox(height: 16),
            Text(
              'No emails found',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text(
              'Try a different search query',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      controller: _scrollController,
      itemCount: filteredEmails.length,
      itemBuilder: (context, index) {
        final email = filteredEmails[index];
        return _buildEmailListItem(email);
      },
    );
  }

  Widget _buildEmailListItem(Email email) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final isSelected = _selectedEmail?.id == email.id;

    return Material(
      color: isSelected
          ? colorScheme.primaryContainer.withAlpha((0.3 * 255).round())
          : Colors.transparent,
      child: InkWell(
        onTap: () {
          setState(() => _selectedEmail = email);
          _markAsRead(email);

          // Automatically load analysis for this message if available
          _ensureAnalysisLoaded(email);
        },
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            border: Border(
              bottom: BorderSide(
                color: colorScheme.outlineVariant.withAlpha((0.2 * 255).round()),
              ),
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Allow long-press to view raw payload (debug) or quick analyze in future
              GestureDetector(
                onLongPress: () {
                  // placeholder for future debug view
                },
                child: const SizedBox.shrink(),
              ),
              // Avatar
              CircleAvatar(
                radius: 20,
                backgroundColor: colorScheme.primaryContainer,
                child: Text(
                  email.senderName.isNotEmpty
                      ? email.senderName[0].toUpperCase()
                      : '?',
                  style: TextStyle(
                    color: colorScheme.onPrimaryContainer,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              
              // Email content
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            email.senderName,
                            style: theme.textTheme.bodyMedium?.copyWith(
                              fontWeight:
                                  email.isRead ? FontWeight.normal : FontWeight.bold,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          _formatTimestamp(email.timestamp),
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    // Subject (show inline loader while fetching details)
                    if (_loadingDetails.contains(email.id)) ...[
                      Row(
                        children: [
                          SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'Loading details…',
                              style: theme.textTheme.bodyMedium?.copyWith(
                                fontStyle: FontStyle.italic,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        ' ',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: colorScheme.onSurfaceVariant,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ] else ...[
                      Text(
                        email.subject,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          fontWeight: email.isRead ? FontWeight.normal : FontWeight.bold,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        email.preview,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: colorScheme.onSurfaceVariant,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                    if (email.labels.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 4,
                        children: email.labels.take(3).map((label) {
                          return Chip(
                            label: Text(label),
                            labelStyle: theme.textTheme.bodySmall,
                            visualDensity: VisualDensity.compact,
                            materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          );
                        }).toList(),
                      ),
                    ],
                  ],
                ),
              ),
              
              // Read/Flag indicators
              Column(
                children: [
                  if (!email.isRead)
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: colorScheme.primary,
                        shape: BoxShape.circle,
                      ),
                    ),
                  if (email.isFlagged)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Icon(
                        Icons.flag,
                        size: 16,
                        color: colorScheme.error,
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildEmailDetail(Email email) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    debugPrint('rendering detail: ${email.id} subjectLen=${email.subject.length} bodyLen=${email.body.length} isHtml=${email.isHtml} loadingDetails=${_loadingDetails.contains(email.id)} loadingAnalysis=${_loadingAnalysis.contains(email.id)}');

    return Container(
      decoration: BoxDecoration(
        color: colorScheme.surface,
        border: Border(
          left: BorderSide(
            color: colorScheme.outlineVariant.withAlpha((0.3 * 255).round()),
          ),
        ),
      ),
      child: Column(
        children: [
          // Header
          Container(
            padding: const EdgeInsets.all(16.0),
            decoration: BoxDecoration(
              border: Border(
                bottom: BorderSide(
                  color: colorScheme.outlineVariant.withAlpha((0.3 * 255).round()),
                ),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        email.subject,
                        style: theme.textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    IconButton(
                      icon: Icon(
                        email.isFlagged ? Icons.flag : Icons.flag_outlined,
                        color: email.isFlagged ? colorScheme.error : null,
                      ),
                      onPressed: () => _toggleFlag(email),
                      tooltip: email.isFlagged ? 'Unflag' : 'Flag',
                    ),
                    IconButton(
                      icon: const Icon(Icons.close),
                      onPressed: () => setState(() => _selectedEmail = null),
                      tooltip: 'Close',
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    CircleAvatar(
                      radius: 24,
                      backgroundColor: colorScheme.primaryContainer,
                      child: Text(
                        email.senderName.isNotEmpty
                            ? email.senderName[0].toUpperCase()
                            : '?',
                        style: TextStyle(
                          color: colorScheme.onPrimaryContainer,
                          fontWeight: FontWeight.bold,
                          fontSize: 18,
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            email.senderName,
                            style: theme.textTheme.bodyLarge?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          Text(
                            email.from,
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Text(
                      _formatFullTimestamp(email.timestamp),
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
                if (email.labels.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: email.labels.map((label) {
                      return Chip(
                        label: Text(label),
                        labelStyle: theme.textTheme.bodySmall,
                      );
                    }).toList(),
                  ),
                ],
              ],
            ),
          ),
          
          // Body
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // AI Analysis if available, or a loading indicator while it is fetched
                  if (_loadingAnalysis.contains(email.id) && email.analysis == null) ...[
                    Center(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 12.0),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                            const SizedBox(width: 12),
                            Text(context.t('loading_ai_summary'), style: theme.textTheme.bodySmall),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                  ] else if (email.analysis != null) ...[
                    _buildAnalysisCard(email.analysis!),
                    const SizedBox(height: 24),
                  ],
                  
                  // Email body
                  if (_loadingDetails.contains(email.id)) ...[
                    Center(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 24.0),
                        child: Column(
                          children: [
                            const SizedBox(
                              width: 24,
                              height: 24,
                              child: CircularProgressIndicator(),
                            ),
                            const SizedBox(height: 12),
                            Text(context.t('loading_message'), style: theme.textTheme.bodySmall),
                          ],
                        ),
                      ),
                    )
                  ] else if (email.body.isEmpty) ...[
                    Text('No content available', style: theme.textTheme.bodySmall?.copyWith(color: colorScheme.onSurfaceVariant)),
                  ] else ...[
                    if (email.isHtml) ...[
                      Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        // Controls: show as plain text (fallback) and view raw
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            TextButton(
                              onPressed: () => setState(() => _showPlainText = !_showPlainText),
                              child: Text(_showPlainText ? 'Show rendered HTML' : 'Show as text'),
                            ),
                            const SizedBox(width: 8),
                            // Removed "View raw HTML" button per UX decision
                          ],
                        ),

                        // If user requested plain text fallback, show extracted text
                        if (_showPlainText) ...[
                          SelectableText(
                            _extractText(email.body),
                            style: theme.textTheme.bodyMedium,
                          ),
                        ] else ...[
                          // Render HTML in WebView. Use a key tied to the message id so
                          // the WebView rebuilds when the selected email changes.
                          // Give the WebView a finite height instead of trying to
                          // use unbounded constraints from the surrounding
                          // SingleChildScrollView. Using a fixed-height box avoids
                          // layout errors on platforms where the webview can't
                          // expand to infinite height.
                          // Auto-height webview: measures content height and expands
                          // inside the scroll view so it fits the web content.
                          _AutoHeightInAppWebView(
                            key: ValueKey(email.id),
                            html: email.body,
                          ),
                        ],
                      ],
                    ),
                    ] else ...[
                      SelectableText(
                        email.body,
                        style: theme.textTheme.bodyMedium,
                      ),
                    ],
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAnalysisCard(EmailAnalysis analysis) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Card(
      color: colorScheme.primaryContainer.withAlpha((0.3 * 255).round()),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  Icons.auto_awesome,
                  size: 20,
                  color: colorScheme.primary,
                ),
                const SizedBox(width: 8),
                Text(
                  'AI Analysis',
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: colorScheme.primary,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            
            if (analysis.intent.isNotEmpty) ...[
              Text(
                'Importance: ${analysis.intent}/10',
                style: theme.textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 8),
            ],
            
            if (analysis.summary.isNotEmpty) ...[
              Text(
                'Summary',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: colorScheme.onSurfaceVariant,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                analysis.summary,
                style: theme.textTheme.bodyMedium,
              ),
              const SizedBox(height: 8),
            ],
            
            if (analysis.entities.isNotEmpty) ...[
              Text(
                'Tags',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: colorScheme.onSurfaceVariant,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 4),
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: analysis.entities.map((entity) {
                  return Chip(
                    label: Text(entity),
                    labelStyle: theme.textTheme.bodySmall,
                    visualDensity: VisualDensity.compact,
                  );
                }).toList(),
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _formatTimestamp(DateTime timestamp) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final emailDate = DateTime(timestamp.year, timestamp.month, timestamp.day);

    if (emailDate == today) {
      return DateFormat('HH:mm').format(timestamp);
    } else if (emailDate == today.subtract(const Duration(days: 1))) {
      return 'Yesterday';
    } else if (now.difference(timestamp).inDays < 7) {
      return DateFormat('EEE').format(timestamp);
    } else {
      return DateFormat('MMM d').format(timestamp);
    }
  }

  String _formatFullTimestamp(DateTime timestamp) {
    return DateFormat('MMM d, yyyy at HH:mm').format(timestamp);
  }
}


class _AutoHeightInAppWebView extends StatefulWidget {
  final String html;

  const _AutoHeightInAppWebView({Key? key, required this.html}) : super(key: key);

  @override
  State<_AutoHeightInAppWebView> createState() => _AutoHeightInAppWebViewState();
}

class _AutoHeightInAppWebViewState extends State<_AutoHeightInAppWebView> {
  InAppWebViewController? _controller;
  double _height = 120; // conservative initial height to reduce visible jump
  Timer? _pollTimer;
  int _attempts = 0;
  final List<double> _recentHeights = [];

  @override
  void initState() {
    super.initState();
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<double?> _measureOnce() async {
    if (_controller == null) return null;
    try {
      final res = await _controller!.evaluateJavascript(
        source:
            "(function(){return Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, document.body.offsetHeight, document.documentElement.offsetHeight).toString();})()",
      );

      double? h;
      if (res is String) {
        h = double.tryParse(res);
      } else if (res is num) {
        h = res.toDouble();
      }

      return h;
    } catch (_) {
      return null;
    }
  }

  void _startPollingHeight() {
    _pollTimer?.cancel();
    _attempts = 0;
    _recentHeights.clear();

    const interval = Duration(milliseconds: 200); // faster polling
    const maxAttempts = 10; // ~2s max

    _pollTimer = Timer.periodic(interval, (t) async {
      _attempts++;
      final measured = await _measureOnce();
      if (!mounted) return t.cancel();
      if (measured != null && measured > 0) {
        // keep last three measurements
        _recentHeights.add(measured);
        if (_recentHeights.length > 3) _recentHeights.removeAt(0);

        final minH = _recentHeights.reduce((a, b) => a < b ? a : b);
        final maxH = _recentHeights.reduce((a, b) => a > b ? a : b);

        // Consider stable when last 3 measurements within 4 pixels
        if (_recentHeights.length >= 3 && (maxH - minH) < 4) {
          final newHeight = maxH + 2; // small padding
          if ((newHeight - _height).abs() > 1) {
            setState(() => _height = newHeight);
          }
          t.cancel();
          return;
        }

        // Update intermediate height to avoid huge jumps but only if larger
        final intermediate = measured + 2;
        if (intermediate > _height + 8) {
          // only grow incrementally to reduce jumpiness
          final growTo = _height + ((intermediate - _height) * 0.6).clamp(20, intermediate - _height);
          setState(() => _height = growTo);
        }
      }

      if (_attempts >= maxAttempts) {
        // fallback to last measured or keep current; add small padding
        final last = _recentHeights.isNotEmpty ? _recentHeights.last : null;
        if (last != null) {
          final finalH = last + 2;
          if ((finalH - _height).abs() > 1) setState(() => _height = finalH);
        }
        t.cancel();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    // Wrap provided HTML to ensure consistent layout (remove default margins)
    final wrapped = '''<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>html,body{margin:0;padding:0;}img{max-width:100%;height:auto;}*{box-sizing:border-box;}</style></head><body>${widget.html}</body></html>''';

    return SizedBox(
      height: _height,
      child: InAppWebView(
        key: widget.key,
        initialData: InAppWebViewInitialData(data: wrapped, baseUrl: WebUri('about:blank')),
        initialSettings: InAppWebViewSettings(
          javaScriptEnabled: true,
          supportZoom: false,
          disableContextMenu: true,
          useHybridComposition: true,
        ),
        onWebViewCreated: (controller) {
          _controller = controller;
        },
        onLoadStop: (controller, url) async {
          // once content loaded, start polling for stable height
          _startPollingHeight();
        },
        onProgressChanged: (controller, progress) async {
          if (progress == 100) {
            _startPollingHeight();
          }
        },
        onLoadError: (controller, url, code, message) async {
          // try a measurement in case of partial load
          await _measureOnce();
        },
        onConsoleMessage: (controller, consoleMessage) {
          // no-op, but can help debugging during development
        },
        onLoadStart: (controller, url) async {
          try {
            if (url != null) {
              final s = url.toString();
              if (!s.startsWith('about:blank') && !s.startsWith('data:')) {
                final uri = Uri.tryParse(s);
                if (uri != null) {
                  await launchUrl(uri, mode: LaunchMode.externalApplication);
                  await controller.stopLoading();
                }
              }
            }
          } catch (_) {}
        },
      ),
    );
  }
}
