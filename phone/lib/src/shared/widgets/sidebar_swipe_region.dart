import 'package:flutter/material.dart';

/// Wraps content with a horizontal swipe detector that triggers callbacks
/// when the user drags decisively left or right anywhere on the screen.
class SidebarSwipeRegion extends StatefulWidget {
  const SidebarSwipeRegion({
    super.key,
    required this.child,
    this.onSwipeLeft,
    this.onSwipeRight,
    this.minDragDistance = 140,
  });

  /// Widget subtree that should respond to the swipe gesture.
  final Widget child;

  /// Called when the user swipes towards the left (finger moves to the left).
  final VoidCallback? onSwipeLeft;

  /// Called when the user swipes towards the right (finger moves to the right).
  final VoidCallback? onSwipeRight;

  /// Minimum horizontal distance (in logical pixels) required to trigger an
  /// action. This helps avoid accidental drawer openings while scrolling.
  final double minDragDistance;

  @override
  State<SidebarSwipeRegion> createState() => _SidebarSwipeRegionState();
}

class _SidebarSwipeRegionState extends State<SidebarSwipeRegion> {
  double _dragDistance = 0;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.translucent,
      onHorizontalDragStart: (_) {
        _dragDistance = 0;
      },
      onHorizontalDragUpdate: (details) {
        _dragDistance += details.primaryDelta ?? 0;
      },
      onHorizontalDragEnd: (details) {
        final velocity = details.primaryVelocity ?? 0;
        final distance = _dragDistance;

        if (distance > widget.minDragDistance || velocity > 600) {
          widget.onSwipeRight?.call();
        } else if (distance < -widget.minDragDistance || velocity < -600) {
          widget.onSwipeLeft?.call();
        }

        _dragDistance = 0;
      },
      child: widget.child,
    );
  }
}
