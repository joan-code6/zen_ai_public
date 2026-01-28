import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/auth.dart';
import '../models/email.dart';
import '../models/email_analysis.dart';
import 'backend_service.dart';

class EmailService {
  static http.Client? _client;
  static http.Client get _http => _client ??= http.Client();

  // ========== Connection Management ==========

  /// Get Gmail OAuth authorization URL
  static Future<GmailAuthUrl> getGmailAuthUrl({
    required String redirectUri,
    required AuthSession session,
  }) async {
    final validSession = await BackendService.ensureValidToken(session);
    final baseUrl = await BackendService.getBackendUrl();
    final uri = Uri.parse('$baseUrl/email/gmail/auth-url').replace(
      queryParameters: {'redirectUri': redirectUri},
    );
    
    final response = await _http.get(
      uri,
      headers: {'Authorization': 'Bearer ${validSession.idToken}'},
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to get Gmail auth URL: ${response.statusCode}');
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    return GmailAuthUrl.fromJson(data);
  }

  /// Exchange Gmail OAuth code for tokens
  static Future<EmailConnectionStatus> exchangeGmailCode({
    required String code,
    required String redirectUri,
    required AuthSession session,
    String? codeVerifier,
  }) async {
    final validSession = await BackendService.ensureValidToken(session);
    final baseUrl = await BackendService.getBackendUrl();
    final uri = Uri.parse('$baseUrl/email/gmail/exchange');
    
    final response = await _http.post(
      uri,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ${validSession.idToken}',
      },
      body: jsonEncode({
        'code': code,
        'redirectUri': redirectUri,
        if (codeVerifier != null) 'codeVerifier': codeVerifier,
      }),
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to exchange Gmail code: ${response.statusCode}');
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    return EmailConnectionStatus.fromJson(data);
  }

  /// Check Gmail connection status
  static Future<EmailConnectionStatus> checkGmailConnection({
    required AuthSession session,
  }) async {
    final validSession = await BackendService.ensureValidToken(session);
    final baseUrl = await BackendService.getBackendUrl();
    final uri = Uri.parse('$baseUrl/email/gmail/connection');
    
    final response = await _http.get(
      uri,
      headers: {'Authorization': 'Bearer ${validSession.idToken}'},
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to check Gmail connection: ${response.statusCode}');
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    return EmailConnectionStatus.fromJson(data);
  }

  /// Disconnect Gmail
  static Future<void> disconnectGmail({required AuthSession session}) async {
    final validSession = await BackendService.ensureValidToken(session);
    final baseUrl = await BackendService.getBackendUrl();
    final uri = Uri.parse('$baseUrl/email/gmail/connection');
    
    final response = await _http.delete(
      uri,
      headers: {'Authorization': 'Bearer ${validSession.idToken}'},
    );

    if (response.statusCode != 204 && response.statusCode != 200) {
      throw Exception('Failed to disconnect Gmail: ${response.statusCode}');
    }
  }

  /// Connect IMAP account
  static Future<EmailConnectionStatus> connectImap({
    required String host,
    required int port,
    required bool useSsl,
    required String email,
    required String password,
  }) async {
    final baseUrl = await BackendService.getBackendUrl();
    final uri = Uri.parse('$baseUrl/email/imap/connect');
    
    final request = ImapConnectionRequest(
      host: host,
      port: port,
      useSsl: useSsl,
      email: email,
      password: password,
    );
    
    final response = await _http.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(request.toJson()),
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to connect IMAP: ${response.statusCode}');
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    return EmailConnectionStatus.fromJson(data);
  }

  /// Check IMAP connection status
  static Future<EmailConnectionStatus> checkImapConnection({
    required AuthSession session,
  }) async {
    final validSession = await BackendService.ensureValidToken(session);
    final baseUrl = await BackendService.getBackendUrl();
    final uri = Uri.parse('$baseUrl/email/imap/connection');
    
    final response = await _http.get(
      uri,
      headers: {'Authorization': 'Bearer ${validSession.idToken}'},
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to check IMAP connection: ${response.statusCode}');
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    return EmailConnectionStatus.fromJson(data);
  }

  /// Disconnect IMAP
  static Future<void> disconnectImap({required AuthSession session}) async {
    final validSession = await BackendService.ensureValidToken(session);
    final baseUrl = await BackendService.getBackendUrl();
    final uri = Uri.parse('$baseUrl/email/imap/connection');
    
    final response = await _http.delete(
      uri,
      headers: {'Authorization': 'Bearer ${validSession.idToken}'},
    );

    if (response.statusCode != 204 && response.statusCode != 200) {
      throw Exception('Failed to disconnect IMAP: ${response.statusCode}');
    }
  }

  /// Connect SMTP account
  static Future<EmailConnectionStatus> connectSmtp({
    required String host,
    required int port,
    required bool useTls,
    required String email,
    required String password,
  }) async {
    final baseUrl = await BackendService.getBackendUrl();
    final uri = Uri.parse('$baseUrl/email/smtp/connect');
    
    final request = SmtpConnectionRequest(
      host: host,
      port: port,
      useTls: useTls,
      email: email,
      password: password,
    );
    
    final response = await _http.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(request.toJson()),
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to connect SMTP: ${response.statusCode}');
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    return EmailConnectionStatus.fromJson(data);
  }

  /// Check SMTP connection status
  static Future<EmailConnectionStatus> checkSmtpConnection() async {
    final baseUrl = await BackendService.getBackendUrl();
    final uri = Uri.parse('$baseUrl/email/smtp/connection');
    
    final response = await _http.get(uri);

    if (response.statusCode != 200) {
      throw Exception('Failed to check SMTP connection: ${response.statusCode}');
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    return EmailConnectionStatus.fromJson(data);
  }

  /// Disconnect SMTP
  static Future<void> disconnectSmtp({required AuthSession session}) async {
    final validSession = await BackendService.ensureValidToken(session);
    final baseUrl = await BackendService.getBackendUrl();
    final uri = Uri.parse('$baseUrl/email/smtp/connection');
    
    final response = await _http.delete(
      uri,
      headers: {'Authorization': 'Bearer ${validSession.idToken}'},
    );

    if (response.statusCode != 204 && response.statusCode != 200) {
      throw Exception('Failed to disconnect SMTP: ${response.statusCode}');
    }
  }

  // ========== Email Operations ==========

  /// Analyze the content of an email for intent, summary, and entities
  static Future<EmailAnalysis> analyzeEmail({
    required String emailContent,
  }) async {
    final baseUrl = await BackendService.getBackendUrl();
    final uri = Uri.parse('$baseUrl/email/analyze');
    
    final request = EmailAnalyzeRequest(emailContent: emailContent);
    
    final response = await _http.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(request.toJson()),
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to analyze email: ${response.statusCode}');
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    return EmailAnalysis.fromJson(data);
  }

  /// Manually trigger polling of the mailbox for new emails
  static Future<List<Email>> pollEmails({
    required String userId,
  }) async {
    final baseUrl = await BackendService.getBackendUrl();
    final uri = Uri.parse('$baseUrl/email/poll');

    final request = EmailPollRequest(userId: userId);

    final response = await _http.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(request.toJson()),
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to poll emails: ${response.statusCode}');
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    final newEmails = data['new_emails'] as List<dynamic>? ?? [];

    return newEmails
        .map((item) => Email.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  /// Get analysis history for user
  static Future<List<EmailAnalysisRecord>> getAnalysisHistory({
    required AuthSession session,
    int? limit,
  }) async {
    final baseUrl = await BackendService.getBackendUrl();
    final validSession = await BackendService.ensureValidToken(session);

    final uri = Uri.parse('$baseUrl/email/analysis/history').replace(
      queryParameters: {
        if (limit != null) 'limit': limit.toString(),
      }.isNotEmpty
          ? {
              if (limit != null) 'limit': limit.toString(),
            }
          : null,
    );

    final response = await _http.get(
      uri,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ${validSession.idToken}',
      },
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to fetch analysis history: ${response.statusCode}');
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    final items = data['items'] as List<dynamic>? ?? [];
    return items.map((e) => EmailAnalysisRecord.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Get a specific analysis by id
  static Future<EmailAnalysisRecord> getAnalysisById({
    required String analysisId,
    required AuthSession session,
  }) async {
    final baseUrl = await BackendService.getBackendUrl();
    final validSession = await BackendService.ensureValidToken(session);

    final uri = Uri.parse('$baseUrl/email/analysis/${Uri.encodeComponent(analysisId)}');
    final response = await _http.get(
      uri,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ${validSession.idToken}',
      },
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to fetch analysis: ${response.statusCode}');
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    return EmailAnalysisRecord.fromJson(data);
  }

  /// Get analysis statistics
  static Future<Map<String, int>> getAnalysisStats({
    required AuthSession session,
  }) async {
    final baseUrl = await BackendService.getBackendUrl();
    final validSession = await BackendService.ensureValidToken(session);

    final uri = Uri.parse('$baseUrl/email/analysis/stats');
    final response = await _http.get(
      uri,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ${validSession.idToken}',
      },
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to fetch analysis stats: ${response.statusCode}');
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    final result = <String, int>{};
    for (final entry in data.entries) {
      final key = entry.key;
      final value = entry.value is int ? entry.value as int : int.tryParse(entry.value.toString()) ?? 0;
      result[key] = value;
    }
    return result;
  }

  /// Get available analysis categories
  static Future<List<String>> getAnalysisCategories({
    required AuthSession session,
  }) async {
    final baseUrl = await BackendService.getBackendUrl();
    final validSession = await BackendService.ensureValidToken(session);

    final uri = Uri.parse('$baseUrl/email/analysis/categories');
    final response = await _http.get(
      uri,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ${validSession.idToken}',
      },
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to fetch analysis categories: ${response.statusCode}');
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    final cats = (data['categories'] as List<dynamic>?)?.map((e) => e.toString()).toList() ?? [];
    return cats;
  }

  /// Start IMAP IDLE mode for real-time email updates
  static Future<String> startImapIdle({
    required String userId,
  }) async {
    final baseUrl = await BackendService.getBackendUrl();
    final uri = Uri.parse('$baseUrl/email/imap/idle');
    
    final response = await _http.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'user_id': userId}),
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to start IMAP IDLE: ${response.statusCode}');
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    return data['status']?.toString() ?? 'started';
  }

  /// Register a webhook for email events
  static Future<String> registerWebhook({
    required String callbackUrl,
  }) async {
    final baseUrl = await BackendService.getBackendUrl();
    final uri = Uri.parse('$baseUrl/email/webhook/register');
    
    final request = EmailWebhookRegisterRequest(callbackUrl: callbackUrl);
    
    final response = await _http.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(request.toJson()),
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to register webhook: ${response.statusCode}');
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    return data['webhook_id']?.toString() ?? '';
  }

  /// Process incoming webhook events
  static Future<String> processWebhook({
    required Map<String, dynamic> payload,
  }) async {
    final baseUrl = await BackendService.getBackendUrl();
    final uri = Uri.parse('$baseUrl/email/webhook/process');
    
    final response = await _http.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(payload),
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to process webhook: ${response.statusCode}');
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    return data['status']?.toString() ?? 'processed';
  }

  /// Renew or refresh email tokens/services
  static Future<String> renewEmailService({
    required String userId,
  }) async {
    final baseUrl = await BackendService.getBackendUrl();
    final uri = Uri.parse('$baseUrl/email/renew');
    
    final response = await _http.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'user_id': userId}),
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to renew email service: ${response.statusCode}');
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    return data['status']?.toString() ?? 'renewed';
  }

  /// Fetch all emails for the authenticated user
  /// Automatically detects provider (Gmail or IMAP) and uses appropriate endpoint
  static Future<List<Email>> fetchEmails({
    required AuthSession session,
    int? maxResults,
    String? searchQuery,
    String? folder, // For IMAP
    String? pageToken, // For Gmail
  }) async {
    final baseUrl = await BackendService.getBackendUrl();
    final validSession = await BackendService.ensureValidToken(session);
    
    // Try Gmail first
    try {
      final queryParams = <String, String>{
        if (searchQuery != null && searchQuery.isNotEmpty) 'q': searchQuery,
        if (maxResults != null) 'maxResults': maxResults.toString(),
        if (pageToken != null) 'pageToken': pageToken,
      };
      
      final uri = Uri.parse('$baseUrl/email/gmail/messages').replace(
        queryParameters: queryParams.isNotEmpty ? queryParams : null,
      );
      
      final response = await _http.get(
        uri,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ${validSession.idToken}',
        },
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        
        if (data is Map<String, dynamic>) {
          final messages = data['messages'] as List<dynamic>? ?? [];
          return messages
              .map((item) => Email.fromJson(item as Map<String, dynamic>))
              .toList();
        } else if (data is List) {
          return data
              .map((item) => Email.fromJson(item as Map<String, dynamic>))
              .toList();
        }
        return [];
      }
    } catch (_) {
      // Gmail failed, try IMAP
    }

    // If we get here, try to fall back to message detail endpoint for a single message
    // (no-op here; detailed fetching is handled by `fetchEmailDetails` when needed)

    
    // Try IMAP
    try {
      final queryParams = <String, String>{
        if (folder != null) 'folder': folder,
        if (maxResults != null) 'maxResults': maxResults.toString(),
        if (searchQuery != null && searchQuery.isNotEmpty) 'searchCriteria': searchQuery,
      };
      
      final uri = Uri.parse('$baseUrl/email/imap/messages').replace(
        queryParameters: queryParams.isNotEmpty ? queryParams : null,
      );
      
      final response = await _http.get(
        uri,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ${validSession.idToken}',
        },
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        
        if (data is Map<String, dynamic>) {
          final messages = data['messages'] as List<dynamic>? ?? [];
          return messages
              .map((item) => Email.fromJson(item as Map<String, dynamic>))
              .toList();
        } else if (data is List) {
          return data
              .map((item) => Email.fromJson(item as Map<String, dynamic>))
              .toList();
        }
        return [];
      } else {
        throw Exception('Failed to fetch IMAP emails: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Failed to fetch emails from any provider: $e');
    }
  }

  /// Fetch a single message's full details
  /// GET /email/gmail/messages/{message_id}
  /// GET /email/imap/messages/{message_id}
  static Future<Email> fetchEmailDetails({
    required String messageId,
    required AuthSession session,
    bool isGmail = true,
    String? folder,
  }) async {
    final baseUrl = await BackendService.getBackendUrl();
    final validSession = await BackendService.ensureValidToken(session);

    final provider = isGmail ? 'gmail' : 'imap';
    var uri = Uri.parse('$baseUrl/email/$provider/messages/$messageId');
    if (!isGmail && folder != null) {
      uri = uri.replace(queryParameters: {'folder': folder});
    }

    final response = await _http.get(
      uri,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ${validSession.idToken}',
      },
    );

    if (response.statusCode != 200) {
      print('fetchEmailDetails failed: ${response.statusCode} ${response.body}');
      throw Exception('Failed to fetch message details: ${response.statusCode}');
    }

    final raw = response.body;
    print('fetchEmailDetails($messageId): raw length=${raw.length}');
    if (raw.trim().isEmpty) {
      print('fetchEmailDetails: empty raw body for message $messageId');
    }

    final data = jsonDecode(raw) as Map<String, dynamic>;

    // Log keys and body length for debugging
    try {
      final bodyLen = data['body']?.toString().length ?? 0;
      print('fetchEmailDetails($messageId): data keys=${data.keys.toList()}, bodyLen=$bodyLen');
      if (bodyLen == 0) {
        // Also check alternate fields
        final alt = [
          'html', 'html_body', 'body_html', 'text', 'raw', 'payload'
        ].where((k) => data.containsKey(k)).toList();
        if (alt.isNotEmpty) print('fetchEmailDetails($messageId): found alternate keys=${alt}');
      }
    } catch (e) {
      print('fetchEmailDetails: debug inspection failed: $e');
    }

    // Since backend now returns flat JSON, use Email.fromJson directly
    final email = Email.fromJson(data);

    if ((email.subject.isEmpty) && (email.body.isEmpty)) {
      print('fetchEmailDetails: parsed empty subject/body for $messageId');
    } else {
      print('fetchEmailDetails: parsed subject="${email.subject}" bodyLength=${email.body.length} for $messageId');
    }

    return email;
  }

  /// Mark an email as read
  /// Note: Backend endpoints need to be implemented:
  /// - POST /email/gmail/messages/{message_id}/read
  /// - POST /email/imap/messages/{message_id}/read
  static Future<void> markAsRead({
    required String emailId,
    required AuthSession session,
    bool isGmail = true, // Default to Gmail, can be detected from connection status
  }) async {
    final baseUrl = await BackendService.getBackendUrl();
    final validSession = await BackendService.ensureValidToken(session);
    
    final provider = isGmail ? 'gmail' : 'imap';
    final uri = Uri.parse('$baseUrl/email/$provider/messages/$emailId/read');
    
    final response = await _http.post(
      uri,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ${validSession.idToken}',
      },
      body: jsonEncode({'read': true}),
    );

    if (response.statusCode != 200 && response.statusCode != 204) {
      throw Exception('Failed to mark email as read: ${response.statusCode}');
    }
  }

  /// Toggle flag/star status of an email
  /// Note: Backend endpoints need to be implemented:
  /// - POST /email/gmail/messages/{message_id}/star
  /// - POST /email/imap/messages/{message_id}/flag
  static Future<void> toggleFlag({
    required String emailId,
    required AuthSession session,
    required bool isFlagged,
    bool isGmail = true, // Default to Gmail, can be detected from connection status
  }) async {
    final baseUrl = await BackendService.getBackendUrl();
    final validSession = await BackendService.ensureValidToken(session);
    
    final provider = isGmail ? 'gmail' : 'imap';
    final endpoint = isGmail ? 'star' : 'flag';
    final uri = Uri.parse('$baseUrl/email/$provider/messages/$emailId/$endpoint');
    
    final bodyKey = isGmail ? 'starred' : 'flagged';
    final response = await _http.post(
      uri,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ${validSession.idToken}',
      },
      body: jsonEncode({bodyKey: isFlagged}),
    );

    if (response.statusCode != 200 && response.statusCode != 204) {
      throw Exception('Failed to toggle flag: ${response.statusCode}');
    }
  }
}
