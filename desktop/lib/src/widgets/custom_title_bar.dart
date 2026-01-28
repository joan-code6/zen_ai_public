import 'package:flutter/material.dart';
import 'package:bitsdojo_window/bitsdojo_window.dart';
import 'dart:io';
import 'package:flutter/foundation.dart' show kIsWeb;
import '../i18n/i18n.dart';

class CustomTitleBar extends StatelessWidget {
  final Widget? leading;
  final String title;
  final bool isDarkMode;
  final VoidCallback? onClose;

  const CustomTitleBar({
    super.key,
    this.leading,
    this.title = 'Zen AI',
    this.isDarkMode = false,
    this.onClose,
  });

  @override
  Widget build(BuildContext context) {
    // Only show custom title bar on Windows
    if (kIsWeb || !Platform.isWindows) {
      return const SizedBox.shrink();
    }

    final backgroundColor = isDarkMode 
        ? const Color(0xFF101217) // Match your dark theme scaffold color
        : const Color(0xFFFAFAFA); // Slightly off-white for better contrast
    final foregroundColor = isDarkMode 
        ? Colors.white 
        : Colors.black87;

    return Container(
      width: double.infinity,
      height: 40, // Slightly taller for better proportions
      decoration: BoxDecoration(
        color: backgroundColor,
        border: Border(
          bottom: BorderSide(
            color: isDarkMode 
                ? Colors.grey.shade800 
                : Colors.grey.shade200,
            width: 1,
          ),
        ),
        // Add subtle shadow for depth
        boxShadow: [
          if (!isDarkMode)
            BoxShadow(
              color: Colors.black.withOpacity(0.05),
              blurRadius: 4,
              offset: const Offset(0, 1),
            ),
        ],
      ),
      child: Row(
        children: [
          // App icon and title (draggable area)
          Expanded(
            child: MoveWindow(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Row(
                  children: [
                    if (leading != null) ...[
                      leading!,
                      const SizedBox(width: 12),
                    ],
                    // Title
                    Text(
                      title,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: foregroundColor,
                        letterSpacing: 0.2,
                      ),
                    ),
                    const Spacer(),
                  ],
                ),
              ),
            ),
          ),
          // Window controls
          Row(
            children: [
              _WindowButton(
                icon: Icons.remove,
                onPressed: () => appWindow.minimize(),
                isDarkMode: isDarkMode,
                tooltip: context.t('minimize'),
              ),
              _WindowButton(
                icon: appWindow.isMaximized ? Icons.filter_none : Icons.crop_square_sharp,
                onPressed: () => appWindow.maximizeOrRestore(),
                isDarkMode: isDarkMode,
                tooltip: appWindow.isMaximized ? context.t('restore') : context.t('maximize'),
              ),
              _WindowButton(
                icon: Icons.close,
                onPressed: onClose ?? () => appWindow.close(),
                isDarkMode: isDarkMode,
                isClose: true,
                tooltip: context.t('close'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _WindowButton extends StatefulWidget {
  final IconData icon;
  final VoidCallback onPressed;
  final bool isDarkMode;
  final bool isClose;
  final String? tooltip;

  const _WindowButton({
    required this.icon,
    required this.onPressed,
    this.isDarkMode = false,
    this.isClose = false,
    this.tooltip,
  });

  @override
  State<_WindowButton> createState() => _WindowButtonState();
}

class _WindowButtonState extends State<_WindowButton> {
  bool _isHovered = false;

  @override
  Widget build(BuildContext context) {
    Color backgroundColor = Colors.transparent;
    Color iconColor = widget.isDarkMode ? Colors.white70 : Colors.black54;

    if (_isHovered) {
      if (widget.isClose) {
        backgroundColor = Colors.red;
        iconColor = Colors.white;
      } else {
        backgroundColor = widget.isDarkMode 
            ? Colors.white.withOpacity(0.1) 
            : Colors.black.withOpacity(0.05);
        iconColor = widget.isDarkMode ? Colors.white : Colors.black87;
      }
    }

    return MouseRegion(
      onEnter: (_) => setState(() => _isHovered = true),
      onExit: (_) => setState(() => _isHovered = false),
      child: GestureDetector(
        onTap: widget.onPressed,
        child: Container(
          width: 46,
          height: 32,
          decoration: BoxDecoration(
            color: backgroundColor,
          ),
          child: Icon(
            widget.icon,
            size: 14,
            color: iconColor,
          ),
        ),
      ),
    );
  }
}