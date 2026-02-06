import 'dart:convert';

import 'package:http/http.dart' as http;

import '../core/backend_config.dart';
import 'api_exception.dart';

class ApiClient {
  ApiClient(this._config, {http.Client? httpClient})
    : _httpClient = httpClient ?? http.Client();

  final BackendConfig _config;
  final http.Client _httpClient;

  Future<dynamic> get(
    String path, {
    Map<String, dynamic>? queryParameters,
    Map<String, String>? headers,
  }) async {
    return _send(() {
      final uri = _config.resolve(path, queryParameters: queryParameters);
      return _httpClient.get(uri, headers: headers);
    });
  }

  Future<dynamic> post(
    String path, {
    Map<String, dynamic>? body,
    Map<String, String>? headers,
  }) async {
    return _send(() {
      final uri = _config.resolve(path);
      final encodedBody = body != null ? jsonEncode(body) : null;
      return _httpClient.post(
        uri,
        headers: {
          'Content-Type': 'application/json',
          if (headers != null) ...headers,
        },
        body: encodedBody,
      );
    });
  }

  Future<dynamic> patch(
    String path, {
    Map<String, dynamic>? body,
    Map<String, String>? headers,
  }) async {
    return _send(() {
      final uri = _config.resolve(path);
      final encodedBody = body != null ? jsonEncode(body) : null;
      return _httpClient.patch(
        uri,
        headers: {
          'Content-Type': 'application/json',
          if (headers != null) ...headers,
        },
        body: encodedBody,
      );
    });
  }

  Future<dynamic> delete(
    String path, {
    Map<String, dynamic>? body,
    Map<String, String>? headers,
  }) async {
    return _send(() {
      final uri = _config.resolve(path);
      final encodedBody = body != null ? jsonEncode(body) : null;
      return _httpClient.delete(
        uri,
        headers: {
          'Content-Type': 'application/json',
          if (headers != null) ...headers,
        },
        body: encodedBody,
      );
    });
  }

  Future<dynamic> postMultipart(
    String path, {
    required Map<String, String> fields,
    required http.MultipartFile file,
  }) async {
    final uri = _config.resolve(path);
    final request = http.MultipartRequest('POST', uri)
      ..fields.addAll(fields)
      ..files.add(file);

    try {
      final streamedResponse = await _httpClient.send(request);
      final response = await http.Response.fromStream(streamedResponse);
      return _handleResponse(response);
    } catch (error, stack) {
      throw ApiException(
        message: 'Network error during multipart upload',
        details: {'error': error.toString(), 'stack': stack.toString()},
      );
    }
  }

  Future<dynamic> _send(Future<http.Response> Function() requestFn) async {
    try {
      final response = await requestFn();
      return _handleResponse(response);
    } catch (error, stack) {
      if (error is ApiException) rethrow;
      throw ApiException(
        message: 'Network request failed',
        details: {'error': error.toString(), 'stack': stack.toString()},
      );
    }
  }

  dynamic _handleResponse(http.Response response) {
    final statusCode = response.statusCode;
    if (statusCode >= 200 && statusCode < 300) {
      if (response.body.isEmpty) return null;
      try {
        return jsonDecode(utf8.decode(response.bodyBytes));
      } catch (_) {
        return response.body;
      }
    }

    Map<String, dynamic>? errorBody;
    try {
      errorBody = jsonDecode(response.body) as Map<String, dynamic>;
    } catch (_) {
      errorBody = {'raw': response.body};
    }

    final message = errorBody['message'] as String?;

    throw ApiException(
      statusCode: statusCode,
      message: message ?? 'Request failed',
      details: errorBody,
    );
  }
}
