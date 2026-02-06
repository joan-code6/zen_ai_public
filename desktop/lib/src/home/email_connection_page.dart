import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/auth.dart';
import '../services/email_service.dart';

class EmailConnectionPage extends StatefulWidget {
  final AuthSession? session;
  final VoidCallback onConnectionEstablished;

  const EmailConnectionPage({
    super.key,
    this.session,
    required this.onConnectionEstablished,
  });

  @override
  State<EmailConnectionPage> createState() => _EmailConnectionPageState();
}

class _EmailConnectionPageState extends State<EmailConnectionPage> {
  bool _isConnecting = false;
  String? _error;
  String _selectedProvider = 'gmail';
  HttpServer? _callbackServer;

  // IMAP/SMTP form fields
  final _imapHostController = TextEditingController();
  final _imapPortController = TextEditingController(text: '993');
  final _imapEmailController = TextEditingController();
  final _imapPasswordController = TextEditingController();
  bool _imapUseSsl = true;

  final _smtpHostController = TextEditingController();
  final _smtpPortController = TextEditingController(text: '465');
  final _smtpEmailController = TextEditingController();
  final _smtpPasswordController = TextEditingController();
  bool _smtpUseTls = true;

  @override
  void dispose() {
    _callbackServer?.close();
    _imapHostController.dispose();
    _imapPortController.dispose();
    _imapEmailController.dispose();
    _imapPasswordController.dispose();
    _smtpHostController.dispose();
    _smtpPortController.dispose();
    _smtpEmailController.dispose();
    _smtpPasswordController.dispose();
    super.dispose();
  }

  Future<void> _connectGmail() async {
    setState(() {
      _isConnecting = true;
      _error = null;
    });

    try {
      // Start local server to catch OAuth callback
      const redirectUri = 'http://localhost:8080/oauth/callback';
      
      // Close any existing server
      await _callbackServer?.close();
      
      // Start new callback server
      _callbackServer = await HttpServer.bind('localhost', 8080);
      
      // Check if user is authenticated
      if (widget.session == null) {
        throw Exception('Please sign in first to connect your email');
      }
      
      // Get the OAuth URL
      final authUrl = await EmailService.getGmailAuthUrl(
        redirectUri: redirectUri,
        session: widget.session!,
      );
      
      // Launch the browser
      final uri = Uri.parse(authUrl.authorizationUrl);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
        
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Please complete the Gmail authorization in your browser. '
                'The connection will be established automatically.',
              ),
              duration: Duration(seconds: 5),
            ),
          );
        }

        // Wait for the callback
        await _handleOAuthCallback(redirectUri);
      } else {
        throw Exception('Could not launch authorization URL');
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'Failed to start Gmail connection: $e';
          _isConnecting = false;
        });
      }
      await _callbackServer?.close();
      _callbackServer = null;
    }
  }

  Future<void> _handleOAuthCallback(String redirectUri) async {
    if (_callbackServer == null) return;

    try {
      // Wait for incoming request with timeout
      final request = await _callbackServer!.first.timeout(
        const Duration(minutes: 5),
        onTimeout: () {
          throw TimeoutException('OAuth authorization timed out');
        },
      );

      // Extract the authorization code from the query parameters
      final queryParams = request.uri.queryParameters;
      final code = queryParams['code'];
      final error = queryParams['error'];

      if (error != null) {
        throw Exception('OAuth error: $error');
      }

      if (code == null) {
        throw Exception('No authorization code received');
      }

      // Send success response to browser
      request.response
        ..statusCode = 200
        ..headers.contentType = ContentType.html
        ..write('''
          <!DOCTYPE html>
          <html>
            <head>
              <title>Authorization Successful</title>
              <style>
                body {
                  font-family: Arial, sans-serif;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  height: 100vh;
                  margin: 0;
                  background: #f5f5f5;
                }
                .container {
                  text-align: center;
                  background: white;
                  padding: 40px;
                  border-radius: 12px;
                  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                }
                .success {
                  color: #4CAF50;
                  font-size: 48px;
                  margin-bottom: 20px;
                }
                h1 { color: #333; margin: 0 0 10px 0; }
                p { color: #666; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="success">✓</div>
                <h1>Authorization Successful!</h1>
                <p>You can close this window and return to Zen AI.</p>
                <script>setTimeout(() => window.close(), 2000);</script>
              </div>
            </body>
          </html>
        ''');
      await request.response.close();

      // Exchange the code for tokens
      if (widget.session == null) {
        throw Exception('Session expired. Please sign in again.');
      }
      
      await EmailService.exchangeGmailCode(
        code: code,
        redirectUri: redirectUri,
        session: widget.session!,
      );

      if (mounted) {
        setState(() => _isConnecting = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Gmail connected successfully!'),
            backgroundColor: Colors.green,
          ),
        );
        widget.onConnectionEstablished();
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'Failed to complete Gmail authorization: $e';
          _isConnecting = false;
        });
      }
    } finally {
      await _callbackServer?.close();
      _callbackServer = null;
    }
  }

  Future<void> _connectImap() async {
    if (_imapHostController.text.isEmpty ||
        _imapEmailController.text.isEmpty ||
        _imapPasswordController.text.isEmpty) {
      setState(() => _error = 'Please fill in all IMAP fields');
      return;
    }

    setState(() {
      _isConnecting = true;
      _error = null;
    });

    try {
      final port = int.tryParse(_imapPortController.text) ?? 993;
      
      await EmailService.connectImap(
        host: _imapHostController.text.trim(),
        port: port,
        useSsl: _imapUseSsl,
        email: _imapEmailController.text.trim(),
        password: _imapPasswordController.text,
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('IMAP connected successfully!'),
            backgroundColor: Colors.green,
          ),
        );
        widget.onConnectionEstablished();
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'Failed to connect IMAP: $e';
          _isConnecting = false;
        });
      }
    }
  }

  Future<void> _connectSmtp() async {
    if (_smtpHostController.text.isEmpty ||
        _smtpEmailController.text.isEmpty ||
        _smtpPasswordController.text.isEmpty) {
      setState(() => _error = 'Please fill in all SMTP fields');
      return;
    }

    setState(() {
      _isConnecting = true;
      _error = null;
    });

    try {
      final port = int.tryParse(_smtpPortController.text) ?? 465;
      
      await EmailService.connectSmtp(
        host: _smtpHostController.text.trim(),
        port: port,
        useTls: _smtpUseTls,
        email: _smtpEmailController.text.trim(),
        password: _smtpPasswordController.text,
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('SMTP connected successfully!'),
            backgroundColor: Colors.green,
          ),
        );
        widget.onConnectionEstablished();
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'Failed to connect SMTP: $e';
          _isConnecting = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 600),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(32.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Icon(
                  Icons.email_outlined,
                  size: 80,
                  color: colorScheme.primary,
                ),
                const SizedBox(height: 24),
                Text(
                  'Connect Your Email',
                  style: theme.textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 12),
                Text(
                  'Choose your email provider to get started',
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: colorScheme.onSurfaceVariant,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 48),

                // Provider selection
                SegmentedButton<String>(
                  selected: {_selectedProvider},
                  onSelectionChanged: (Set<String> newSelection) {
                    setState(() {
                      _selectedProvider = newSelection.first;
                      _error = null;
                    });
                  },
                  segments: const [
                    ButtonSegment(
                      value: 'gmail',
                      label: Text('Gmail'),
                      icon: Icon(Icons.email),
                    ),
                    ButtonSegment(
                      value: 'imap',
                      label: Text('IMAP'),
                      icon: Icon(Icons.mail_outline),
                    ),
                    ButtonSegment(
                      value: 'smtp',
                      label: Text('SMTP'),
                      icon: Icon(Icons.send),
                    ),
                  ],
                ),
                const SizedBox(height: 32),

                // Error message
                if (_error != null)
                  Container(
                    padding: const EdgeInsets.all(16),
                    margin: const EdgeInsets.only(bottom: 24),
                    decoration: BoxDecoration(
                      color: colorScheme.errorContainer,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          Icons.error_outline,
                          color: colorScheme.onErrorContainer,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            _error!,
                            style: TextStyle(
                              color: colorScheme.onErrorContainer,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),

                // Provider-specific content
                if (_selectedProvider == 'gmail') _buildGmailContent(),
                if (_selectedProvider == 'imap') _buildImapContent(),
                if (_selectedProvider == 'smtp') _buildSmtpContent(),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildGmailContent() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(
                      Icons.info_outline,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        'Gmail OAuth Setup',
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Text(
                  'You\'ll be redirected to Google to authorize Zen AI to access your Gmail account.',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                const SizedBox(height: 24),
                ElevatedButton.icon(
                  onPressed: _isConnecting ? null : _connectGmail,
                  icon: _isConnecting
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.login),
                  label: Text(_isConnecting ? 'Connecting...' : 'Connect with Gmail'),
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 24,
                      vertical: 16,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildImapContent() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'IMAP Settings',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                ),
                const SizedBox(height: 24),
                TextField(
                  controller: _imapHostController,
                  decoration: const InputDecoration(
                    labelText: 'IMAP Host',
                    hintText: 'imap.example.com',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _imapPortController,
                  decoration: const InputDecoration(
                    labelText: 'Port',
                    hintText: '993',
                    border: OutlineInputBorder(),
                  ),
                  keyboardType: TextInputType.number,
                ),
                const SizedBox(height: 16),
                CheckboxListTile(
                  title: const Text('Use SSL'),
                  value: _imapUseSsl,
                  onChanged: (value) {
                    setState(() => _imapUseSsl = value ?? true);
                  },
                  contentPadding: EdgeInsets.zero,
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _imapEmailController,
                  decoration: const InputDecoration(
                    labelText: 'Email',
                    hintText: 'user@example.com',
                    border: OutlineInputBorder(),
                  ),
                  keyboardType: TextInputType.emailAddress,
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _imapPasswordController,
                  decoration: const InputDecoration(
                    labelText: 'Password',
                    border: OutlineInputBorder(),
                  ),
                  obscureText: true,
                ),
                const SizedBox(height: 24),
                ElevatedButton.icon(
                  onPressed: _isConnecting ? null : _connectImap,
                  icon: _isConnecting
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.link),
                  label: Text(_isConnecting ? 'Connecting...' : 'Connect IMAP'),
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 24,
                      vertical: 16,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildSmtpContent() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'SMTP Settings',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                ),
                const SizedBox(height: 24),
                TextField(
                  controller: _smtpHostController,
                  decoration: const InputDecoration(
                    labelText: 'SMTP Host',
                    hintText: 'smtp.example.com',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _smtpPortController,
                  decoration: const InputDecoration(
                    labelText: 'Port',
                    hintText: '465',
                    border: OutlineInputBorder(),
                  ),
                  keyboardType: TextInputType.number,
                ),
                const SizedBox(height: 16),
                CheckboxListTile(
                  title: const Text('Use TLS'),
                  value: _smtpUseTls,
                  onChanged: (value) {
                    setState(() => _smtpUseTls = value ?? true);
                  },
                  contentPadding: EdgeInsets.zero,
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _smtpEmailController,
                  decoration: const InputDecoration(
                    labelText: 'Email',
                    hintText: 'user@example.com',
                    border: OutlineInputBorder(),
                  ),
                  keyboardType: TextInputType.emailAddress,
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _smtpPasswordController,
                  decoration: const InputDecoration(
                    labelText: 'Password',
                    border: OutlineInputBorder(),
                  ),
                  obscureText: true,
                ),
                const SizedBox(height: 24),
                ElevatedButton.icon(
                  onPressed: _isConnecting ? null : _connectSmtp,
                  icon: _isConnecting
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.link),
                  label: Text(_isConnecting ? 'Connecting...' : 'Connect SMTP'),
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 24,
                      vertical: 16,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
