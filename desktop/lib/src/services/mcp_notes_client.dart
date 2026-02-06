import 'dart:async';
import 'dart:convert';

import 'package:web_socket_channel/io.dart';

class McpClientException implements Exception {
  final String message;
  final int? code;
  final dynamic data;

  const McpClientException(this.message, {this.code, this.data});

  @override
  String toString() {
    final codePart = code != null ? ' (code: $code)' : '';
    return 'McpClientException$codePart: $message';
  }
}

class McpToolDescription {
  final String name;
  final String? description;
  final Map<String, dynamic>? inputSchema;

  const McpToolDescription({
    required this.name,
    this.description,
    this.inputSchema,
  });
}

class McpNotesClient {
  IOWebSocketChannel? _channel;
  StreamSubscription<dynamic>? _subscription;
  final Map<String, Completer<dynamic>> _pending = {};
  int _nextRequestId = 1;
  bool _initialized = false;
  Uri? _endpoint;

  bool get isConnected => _initialized && _channel != null;
  Uri? get endpoint => _endpoint;

  Future<void> connect(Uri uri, {Duration timeout = const Duration(seconds: 6)}) async {
    await disconnect();
    _endpoint = uri;

    try {
      final channel = IOWebSocketChannel.connect(uri, protocols: const ['mcp']);
      _channel = channel;
      _subscription = channel.stream.listen(
        _handleMessage,
        onDone: () => _handleDisconnect(const McpClientException('MCP connection closed')), 
        onError: (Object error, StackTrace stackTrace) =>
            _handleDisconnect(McpClientException(error.toString())),
        cancelOnError: true,
      );

      final initResult = await _sendRequest(
        'initialize',
        {
          'protocolVersion': '0.5',
          'clientInfo': {'name': 'zen-notes-client', 'version': '1.0.0'},
          'capabilities': {
            'tools': <String, dynamic>{},
            'resources': <String, dynamic>{},
            'prompts': <String, dynamic>{},
          },
        },
      ).timeout(timeout);

      if (initResult is! Map<String, dynamic>) {
        throw const McpClientException('Unexpected initialize response');
      }

      _initialized = true;
      await _sendNotification('initialized', const <String, dynamic>{});
    } catch (error) {
      await disconnect();
      if (error is McpClientException) {
        rethrow;
      }
      throw McpClientException(error.toString());
    }
  }

  Future<void> disconnect() async {
    _initialized = false;
    await _subscription?.cancel();
    _subscription = null;
    await _channel?.sink.close();
    _channel = null;
    _failPendingRequests(const McpClientException('Disconnected'));
  }

  Future<void> dispose() => disconnect();

  Future<List<McpToolDescription>> listTools() async {
    final result = await _sendRequest('tools/list');
    if (result is Map<String, dynamic>) {
      final tools = result['tools'];
      if (tools is List) {
        return tools
            .whereType<Map>()
            .map((dynamic entry) {
              final map = entry.cast<String, dynamic>();
              return McpToolDescription(
                name: map['name']?.toString() ?? '',
                description: map['description']?.toString(),
                inputSchema: map['inputSchema'] is Map<String, dynamic>
                    ? map['inputSchema'] as Map<String, dynamic>
                    : null,
              );
            })
            .where((tool) => tool.name.isNotEmpty)
            .toList();
      }
    }
    return const <McpToolDescription>[];
  }

  Future<dynamic> callTool(String name, Map<String, dynamic> arguments) async {
    final result = await _sendRequest('tools/call', {
      'name': name,
      'arguments': arguments,
    });

    if (result is Map<String, dynamic>) {
      final content = result['content'];
      if (content is List && content.isNotEmpty) {
        final first = content.first;
        if (first is Map) {
          final type = first['type']?.toString();
          if (type == 'text') {
            final text = first['text']?.toString();
            if (text != null) {
              try {
                return jsonDecode(text);
              } catch (_) {
                return text;
              }
            }
          }
        }
      }
    }
    return result;
  }

  Future<dynamic> _sendRequest(String method, [Map<String, dynamic>? params]) {
    final channel = _channel;
    if (channel == null) {
      throw const McpClientException('MCP connection is not established');
    }

    final id = _nextRequestId++;
    final key = id.toString();
    final completer = Completer<dynamic>();
    _pending[key] = completer;

    final payload = <String, dynamic>{
      'jsonrpc': '2.0',
      'id': id,
      'method': method,
      if (params != null && params.isNotEmpty) 'params': params,
    };

    channel.sink.add(jsonEncode(payload));
    return completer.future;
  }

  Future<void> _sendNotification(String method, [Map<String, dynamic>? params]) async {
    final channel = _channel;
    if (channel == null) return;
    final payload = <String, dynamic>{
      'jsonrpc': '2.0',
      'method': method,
      if (params != null && params.isNotEmpty) 'params': params,
    };
    channel.sink.add(jsonEncode(payload));
  }

  void _handleMessage(dynamic raw) {
    try {
      final decoded = _decodeMessage(raw);
      if (decoded is! Map<String, dynamic>) {
        return;
      }

      if (decoded.containsKey('id')) {
        final key = decoded['id']?.toString();
        if (key == null) {
          return;
        }
        final completer = _pending.remove(key);
        if (completer == null) {
          return;
        }

        if (decoded.containsKey('error')) {
          final error = decoded['error'];
          if (error is Map<String, dynamic>) {
            completer.completeError(
              McpClientException(
                error['message']?.toString() ?? 'Unknown MCP error',
                code: error['code'] is int ? error['code'] as int : null,
                data: error['data'],
              ),
            );
          } else {
            completer.completeError(
              McpClientException(error?.toString() ?? 'Unknown MCP error'),
            );
          }
        } else {
          completer.complete(decoded['result']);
        }
        return;
      }

      final method = decoded['method']?.toString();
      if (method == null) {
        return;
      }

      if (method.contains('ping')) {
        final params = decoded['params'];
        if (params is Map<String, dynamic>) {
          unawaited(_sendNotification('pong', params));
        } else {
          unawaited(_sendNotification('pong'));
        }
      }
    } catch (error) {
      _handleDisconnect(McpClientException(error.toString()));
    }
  }

  dynamic _decodeMessage(dynamic raw) {
    if (raw is String) {
      return jsonDecode(raw);
    }
    if (raw is List<int>) {
      return jsonDecode(utf8.decode(raw));
    }
    return raw;
  }

  void _handleDisconnect(McpClientException error) {
    if (_channel != null) {
      _initialized = false;
      _channel = null;
    }
    _subscription?.cancel();
    _subscription = null;
    _failPendingRequests(error);
  }

  void _failPendingRequests(McpClientException error) {
    if (_pending.isEmpty) return;
    final pending = Map<String, Completer<dynamic>>.from(_pending);
    _pending.clear();
    for (final completer in pending.values) {
      if (!completer.isCompleted) {
        completer.completeError(error);
      }
    }
  }
}
