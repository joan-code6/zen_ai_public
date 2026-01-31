import 'dart:convert';

import 'package:http/http.dart' as http;

class BackendConfig {
  BackendConfig({required this.baseUrl});

  final String baseUrl;

  Uri resolve(String path, {Map<String, dynamic>? queryParameters}) {
    final normalizedPath = path.startsWith('/') ? path : '/$path';
    return Uri.parse(baseUrl).replace(
      path: '${Uri.parse(baseUrl).path}$normalizedPath',
      queryParameters: queryParameters?.map(
        (key, value) => MapEntry(key, '$value'),
      ),
    );
  }
}

class BackendConfigRepository {
  BackendConfigRepository({http.Client? httpClient})
    : _httpClient = httpClient ?? http.Client();

  static const _configSource =
      'https://gist.githubusercontent.com/joan-code6/8b995d800205dbb119842fa588a2bd2c/raw/zen.json';

  static BackendConfig? _cachedConfig;

  final http.Client _httpClient;

  static String _normalizeBaseUrl(String url) {
    final hasScheme = url.startsWith('http://') || url.startsWith('https://');
    return hasScheme ? url : 'http://$url';
  }

  Future<BackendConfig> load() async {
    if (_cachedConfig != null) return _cachedConfig!;

    try {
      final uri = Uri.parse(_configSource).replace(queryParameters: {
        'randomnumber': DateTime.now().millisecondsSinceEpoch.toString(),
      });

      final response = await _httpClient.get(uri);

      if (response.statusCode == 200) {
        var body = response.body;
        // Handle single quotes which are invalid in standard JSON but present in the Gist
        if (body.contains("'")) {
          body = body.replaceAll("'", '"');
        }

        try {
          final data = jsonDecode(body);
          if (data is Map && data['url'] != null) {
            final url = data['url'].toString();
            if (url.isNotEmpty) {
              _cachedConfig = BackendConfig(baseUrl: _normalizeBaseUrl(url));
            }
          }
        } catch (_) {
          // Fallback to regex if JSON decoding fails
          final match = RegExp(r'''['"]url['"]\s*:\s*['"]([^'"]+)['"]''')
              .firstMatch(response.body);
          if (match != null) {
            final url = match.group(1);
            if (url != null && url.isNotEmpty) {
              _cachedConfig = BackendConfig(baseUrl: _normalizeBaseUrl(url));
            }
          }
        }
      }
    } catch (_) {
      // ignore
    }

    _cachedConfig ??= BackendConfig(baseUrl: _normalizeBaseUrl(''));
    return _cachedConfig!;
  }
}
