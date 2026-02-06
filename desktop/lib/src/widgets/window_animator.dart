import 'dart:async';
import 'package:flutter/material.dart';
import 'package:bitsdojo_window/bitsdojo_window.dart';

class WindowAnimator extends StatefulWidget {
  final Widget child;
  const WindowAnimator({super.key, required this.child});

  static WindowAnimatorState? of(BuildContext context) {
    return context.findAncestorStateOfType<WindowAnimatorState>();
  }

  @override
  State<WindowAnimator> createState() => WindowAnimatorState();
}

class WindowAnimatorState extends State<WindowAnimator> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;
  late Animation<double> _opacityAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 300),
      value: 0.0, // Start hidden
    );

    _scaleAnimation = Tween<double>(begin: 0.90, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOutQuart),
    );
    _opacityAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOutQuart),
    );

    // Small delay to allow window to be fully visible/painted by OS before animating
    Timer(const Duration(milliseconds: 150), () {
      if (mounted) _controller.forward();
    });
  }

  Future<void> closeWindow() async {
    if (!mounted) return;
    await _controller.reverse();
    appWindow.close();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Transform.scale(
          scale: _scaleAnimation.value,
          child: Opacity(
            opacity: _opacityAnimation.value,
            child: child,
          ),
        );
      },
      child: widget.child,
    );
  }
}