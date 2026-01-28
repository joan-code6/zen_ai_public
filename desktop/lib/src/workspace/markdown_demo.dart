import 'package:flutter/material.dart';
import 'markdown_message.dart';
import '../i18n/i18n.dart';

/// Simple demo widget to test markdown rendering
class MarkdownDemo extends StatelessWidget {
  const MarkdownDemo({super.key});

  @override
  Widget build(BuildContext context) {
    const sampleMarkdown = '''
# Markdown Test

This is a **bold text** and this is *italic text*.

## Code Examples

Here's some `inline code` and a code block:

```dart
void main() {
  print('Hello, World!');
}
```

## Lists

- Item 1
- Item 2
  - Nested item
  - Another nested item

## Links

[Visit Flutter](https://flutter.dev)

## Blockquote

> This is a blockquote
> It can span multiple lines
''';

    return Scaffold(
      appBar: AppBar(title: Text(context.t('markdown_demo'))),
      body: const Padding(
        padding: EdgeInsets.all(16.0),
        child: SingleChildScrollView(
          child: MarkdownMessage(
            content: sampleMarkdown,
            textColor: Colors.black87,
            fromUser: false,
          ),
        ),
      ),
    );
  }
}