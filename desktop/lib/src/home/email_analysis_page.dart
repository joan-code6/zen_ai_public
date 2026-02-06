import 'package:flutter/material.dart';

import '../models/email_analysis.dart';
import '../models/auth.dart';
import '../services/email_service.dart';

class EmailAnalysisPage extends StatefulWidget {
  final AuthSession? session;

  const EmailAnalysisPage({super.key, this.session});

  @override
  State<EmailAnalysisPage> createState() => _EmailAnalysisPageState();
}

class _EmailAnalysisPageState extends State<EmailAnalysisPage> {
  List<EmailAnalysisRecord> _items = [];
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadHistory();
  }

  Future<void> _loadHistory() async {
    if (widget.session == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final items = await EmailService.getAnalysisHistory(session: widget.session!, limit: 100);
      if (mounted) {
        setState(() {
          _items = items;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  Future<void> _openDetail(EmailAnalysisRecord item) async {
    if (widget.session == null) return;
    Navigator.of(context).push(MaterialPageRoute(
      builder: (context) => EmailAnalysisDetailPage(
        analysisId: item.id,
        session: widget.session!,
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Email Analysis'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadHistory,
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text('Failed to load: $_error'))
              : _items.isEmpty
                  ? Center(child: Text('No analysis history found'))
                  : ListView.separated(
                      itemCount: _items.length,
                      separatorBuilder: (_, __) => const Divider(height: 1),
                      itemBuilder: (context, index) {
                        final it = _items[index];
                        return ListTile(
                          title: Text(it.contentSummary.isNotEmpty ? it.contentSummary : it.senderSummary),
                          subtitle: Text('${it.provider} · ${it.importance} · ${it.categories.join(', ')}'),
                          trailing: it.createdNoteId != null ? const Icon(Icons.note, size: 18) : null,
                          onTap: () => _openDetail(it),
                        );
                      },
                    ),
    );
  }
}

class EmailAnalysisDetailPage extends StatefulWidget {
  final String analysisId;
  final AuthSession session;

  const EmailAnalysisDetailPage({super.key, required this.analysisId, required this.session});

  @override
  State<EmailAnalysisDetailPage> createState() => _EmailAnalysisDetailPageState();
}

class _EmailAnalysisDetailPageState extends State<EmailAnalysisDetailPage> {
  EmailAnalysisRecord? _item;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final it = await EmailService.getAnalysisById(analysisId: widget.analysisId, session: widget.session);
      if (mounted) setState(() {
        _item = it;
        _loading = false;
      });
    } catch (e) {
      if (mounted) setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Analysis Details'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text('Failed to load: $_error'))
              : _item == null
                  ? const Center(child: Text('Not found'))
                  : Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: SingleChildScrollView(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Sender', style: theme.textTheme.titleSmall),
                            const SizedBox(height: 8),
                            Text(_item!.senderSummary, style: theme.textTheme.bodyMedium),
                            const SizedBox(height: 16),
                            Text('Content Summary', style: theme.textTheme.titleSmall),
                            const SizedBox(height: 8),
                            Text(_item!.contentSummary, style: theme.textTheme.bodyMedium),
                            const SizedBox(height: 16),
                            if (_item!.extractedInfo != null) ...[
                              Text('Extracted Info', style: theme.textTheme.titleSmall),
                              const SizedBox(height: 8),
                              Text(_item!.extractedInfo.toString(), style: theme.textTheme.bodySmall),
                              const SizedBox(height: 16),
                            ],
                            Text('Categories: ${_item!.categories.join(', ')}'),
                            const SizedBox(height: 8),
                            Text('Importance: ${_item!.importance}'),
                            const SizedBox(height: 8),
                            Text('Matched notes: ${_item!.matchedNoteIds.join(', ')}'),
                            const SizedBox(height: 8),
                            if (_item!.createdNoteId != null) Text('Created note: ${_item!.createdNoteId}'),
                          ],
                        ),
                      ),
                    ),
    );
  }
}
