class ApiException implements Exception {
  const ApiException({this.statusCode, this.message, this.details});

  final int? statusCode;
  final String? message;
  final Map<String, dynamic>? details;

  @override
  String toString() =>
      'ApiException(statusCode: $statusCode, message: $message, details: $details)';
}
