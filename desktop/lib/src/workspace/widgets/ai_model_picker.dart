import 'dart:math';

import 'package:flutter/material.dart';
import '../../i18n/i18n.dart';

final ValueNotifier<int> aiModelSelectionNotifier = ValueNotifier<int>(0);

int getSelectedAiModelIndex() => aiModelSelectionNotifier.value;

void setSelectedAiModelIndex(int index) {
  if (index < 0 || index >= kAiModelOptions.length) return;
  if (aiModelSelectionNotifier.value == index) return;
  aiModelSelectionNotifier.value = index;
}

class AiCapabilityBadge {
  final IconData icon;
  final String label;

  const AiCapabilityBadge({required this.icon, required this.label});
}

class AiModelOption {
  final String name;
  final String description;
  final IconData icon;
  final Color accentColor;
  final List<AiCapabilityBadge> badges;
  final bool isFavorite;
  final bool isExperimental;
  final bool isPremium;
  final bool isNew;

  const AiModelOption({
    required this.name,
    required this.description,
    required this.icon,
    required this.accentColor,
    required this.badges,
    this.isFavorite = false,
    this.isExperimental = false,
    this.isPremium = false,
    this.isNew = false,
  });
}

const List<AiModelOption> kAiModelOptions = [
  AiModelOption(
    name: 'Gemini 2.5 Flash',
    description: 'Lightning fast, great for multimodal tasks.',
    icon: Icons.auto_awesome,
    accentColor: Color(0xFFBC9CFF),
    badges: [
      AiCapabilityBadge(icon: Icons.visibility_outlined, label: 'Vision'),
      AiCapabilityBadge(icon: Icons.chat_bubble_outline, label: 'Chat'),
      AiCapabilityBadge(icon: Icons.code_outlined, label: 'Code'),
    ],
    isFavorite: true,
  ),
  AiModelOption(
    name: 'Gemini 2.5 Flash Lite',
    description: 'Experimental blend of Flash and Nano.',
    icon: Icons.science_outlined,
    accentColor: Color(0xFFFF8BDB),
    badges: [
      AiCapabilityBadge(icon: Icons.visibility_outlined, label: 'Vision'),
      AiCapabilityBadge(icon: Icons.bolt_outlined, label: 'Speed'),
    ],
    isFavorite: true,
    isExperimental: true,
  ),
  AiModelOption(
    name: 'Gemini 2.5 Flash Image',
    description: 'Image-first model with text understanding.',
    icon: Icons.palette_outlined,
    accentColor: Color(0xFF9ADFFF),
    badges: [
      AiCapabilityBadge(icon: Icons.image_outlined, label: 'Image'),
      AiCapabilityBadge(icon: Icons.visibility_outlined, label: 'Vision'),
    ],
    isFavorite: true,
  ),
  AiModelOption(
    name: 'Gemini 2.5 Pro',
    description: 'Premium reasoning with real-world grounding.',
    icon: Icons.star_outline,
    accentColor: Color(0xFF8EDABF),
    badges: [
      AiCapabilityBadge(icon: Icons.psychology_outlined, label: 'Reasoning'),
      AiCapabilityBadge(icon: Icons.chat_bubble_outline, label: 'Chat'),
      AiCapabilityBadge(icon: Icons.lock_outline, label: 'Secure'),
    ],
    isFavorite: true,
    isPremium: true,
  ),
  AiModelOption(
    name: 'Gemini Imagen 4',
    description: 'Photo-realistic image synthesis.',
    icon: Icons.brush_outlined,
    accentColor: Color(0xFFF6A6C3),
    badges: [
      AiCapabilityBadge(icon: Icons.image_outlined, label: 'Image'),
      AiCapabilityBadge(icon: Icons.palette_outlined, label: 'Style'),
    ],
  ),
  AiModelOption(
    name: 'GPT ImageGen',
    description: 'OpenAI visuals tuned for storyboarding.',
    icon: Icons.photo_filter_outlined,
    accentColor: Color(0xFFB3A0FF),
    badges: [
      AiCapabilityBadge(icon: Icons.image_outlined, label: 'Image'),
      AiCapabilityBadge(icon: Icons.movie_creation_outlined, label: 'Animation'),
    ],
  ),
  AiModelOption(
    name: 'GPT 5',
    description: 'Latest GPT with balanced reasoning.',
    icon: Icons.memory_outlined,
    accentColor: Color(0xFF9BCBFF),
    badges: [
      AiCapabilityBadge(icon: Icons.chat_bubble_outline, label: 'Chat'),
      AiCapabilityBadge(icon: Icons.code_outlined, label: 'Code'),
      AiCapabilityBadge(icon: Icons.language_outlined, label: 'Translate'),
    ],
    isPremium: true,
  ),
  AiModelOption(
    name: 'Claude 4 Sonnet',
    description: 'Anthropic high-context creative writing.',
    icon: Icons.edit_outlined,
    accentColor: Color(0xFFD1B2FF),
    badges: [
      AiCapabilityBadge(icon: Icons.menu_book_outlined, label: 'Writing'),
      AiCapabilityBadge(icon: Icons.lightbulb_outline, label: 'Ideation'),
    ],
  ),
  AiModelOption(
    name: 'Claude 4.5 Sonnet',
    description: 'Reasoning-forward with long context.',
    icon: Icons.psychology_outlined,
    accentColor: Color(0xFFB7E4C7),
    badges: [
      AiCapabilityBadge(icon: Icons.psychology_alt, label: 'Reasoning'),
      AiCapabilityBadge(icon: Icons.chat_bubble_outline, label: 'Chat'),
    ],
    isNew: true,
  ),
  AiModelOption(
    name: 'DeepSeek R1',
    description: 'Open research distilled for math + code.',
    icon: Icons.science_rounded,
    accentColor: Color(0xFFFFC28C),
    badges: [
      AiCapabilityBadge(icon: Icons.functions, label: 'Math'),
      AiCapabilityBadge(icon: Icons.code_outlined, label: 'Code'),
    ],
  ),
];

Future<int?> showAiModelPickerDialog(
  BuildContext context, {
  required int currentIndex,
}) {
  return showDialog<int>(
    context: context,
    barrierColor: Colors.black.withOpacity(0.45),
    builder: (context) {
      return _AiModelPickerDialog(initialIndex: currentIndex);
    },
  );
}

class _AiModelPickerDialog extends StatefulWidget {
  final int initialIndex;

  const _AiModelPickerDialog({required this.initialIndex});

  @override
  State<_AiModelPickerDialog> createState() => _AiModelPickerDialogState();
}

class _AiModelPickerDialogState extends State<_AiModelPickerDialog> {
  late int _selectedIndex = widget.initialIndex;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Dialog(
      backgroundColor: theme.colorScheme.surface,
      elevation: 8,
      insetPadding: const EdgeInsets.symmetric(horizontal: 32, vertical: 40),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: min(MediaQuery.of(context).size.width * 0.9, 940),
          maxHeight: min(MediaQuery.of(context).size.height * 0.85, 640),
        ),
        child: Padding(
          padding: const EdgeInsets.all(28.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.auto_awesome, color: colorScheme.primary),
                  const SizedBox(width: 10),
                  Text(
                    context.t('choose_ai_companion'),
                    style: theme.textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const Spacer(),
                  IconButton(
                    tooltip: context.t('close'),
                    icon: const Icon(Icons.close_rounded),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              Expanded(
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    final width = constraints.maxWidth;
                    final crossAxisCount = width <= 500
                        ? 1
                        : width <= 720
                            ? 2
                            : width <= 900
                                ? 3
                                : 4;
                    final aspectRatio = width <= 720 ? 1.35 : 1.2;
                    return Scrollbar(
                      thumbVisibility: true,
                      child: GridView.builder(
                        padding: const EdgeInsets.only(right: 4),
                        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: crossAxisCount,
                          mainAxisSpacing: 16,
                          crossAxisSpacing: 16,
                          childAspectRatio: aspectRatio,
                        ),
                        itemCount: kAiModelOptions.length,
                        itemBuilder: (context, index) {
                          final option = kAiModelOptions[index];
                          return AiModelCard(
                            option: option,
                            selected: index == _selectedIndex,
                            onTap: () {
                              setState(() => _selectedIndex = index);
                            },
                          );
                        },
                      ),
                    );
                  },
                ),
              ),
              const SizedBox(height: 22),
              Row(
                children: [
                  Text(
                    context.t('selected_model', args: {'name': kAiModelOptions[_selectedIndex].name}),
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const Spacer(),
                  TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: Text(context.t('cancel')),
                  ),
                  const SizedBox(width: 12),
                  ElevatedButton.icon(
                    onPressed: () => Navigator.of(context).pop(_selectedIndex),
                    label: Text(context.t('use_model')),
                    style: ElevatedButton.styleFrom(
                      elevation: 0,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 18,
                        vertical: 12,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class AiModelCard extends StatelessWidget {
  final AiModelOption option;
  final bool selected;
  final VoidCallback onTap;

  const AiModelCard({
    super.key,
    required this.option,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;

    // Selected cards get a subtle tint; non-selected cards should match the
    // surrounding background (keep them visually neutral/transparent).
    final Color background = selected
      ? option.accentColor.withOpacity(isDark ? 0.1 : 0.05)
      : Colors.transparent;
    final Color borderColor = selected
        ? option.accentColor.withOpacity(0.5) // Subtle border color
        : colorScheme.outlineVariant.withOpacity(isDark ? 0.55 : 0.45);

    final badgeAccent = option.accentColor.withOpacity(0.5); // Subdued badge accent

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOutCubic,
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            color: background,
            border: Border.all(
              color: borderColor,
              width: selected ? 2 : 1,
            ),
            boxShadow: [
              BoxShadow(
                color: theme.shadowColor.withOpacity(0.05), // Minimal shadow
                blurRadius: 6, // Very low blur radius
                offset: const Offset(0, 4), // Subtle offset
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: option.accentColor.withOpacity(0.1), // Subtle circle color
                    ),
                    alignment: Alignment.center,
                    child: Icon(option.icon, color: badgeAccent, size: 22),
                  ),
                  const Spacer(),
                  if (option.isNew)
                    _AiModelChip(label: 'NEW', color: badgeAccent),
                  if (option.isExperimental)
                    _AiModelChip(label: 'LAB', color: badgeAccent),
                  if (option.isPremium)
                    _AiModelChip(
                      label: 'PRO',
                      color: badgeAccent,
                      icon: Icons.diamond_outlined,
                    ),
                ],
              ),
              const SizedBox(height: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      option.name,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.1,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 6),
                    Text(
                      option.description,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: colorScheme.onSurface.withOpacity(0.75),
                        height: 1.35,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const Spacer(),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        for (final badge in option.badges)
                          _CapabilityPill(badge: badge, accent: badgeAccent),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AiModelChip extends StatelessWidget {
  final String label;
  final Color color;
  final IconData? icon;

  const _AiModelChip({
    required this.label,
    required this.color,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      margin: const EdgeInsets.only(left: 6),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(isDark ? 0.35 : 0.18),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withOpacity(0.6)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 14, color: color),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: color,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.4,
                ),
          ),
        ],
      ),
    );
  }
}

class _CapabilityPill extends StatelessWidget {
  final AiCapabilityBadge badge;
  final Color accent;

  const _CapabilityPill({required this.badge, required this.accent});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    return Tooltip(
      message: badge.label,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: accent.withOpacity(isDark ? 0.32 : 0.16),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: accent.withOpacity(isDark ? 0.5 : 0.35)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(badge.icon, size: 16, color: accent),
            const SizedBox(width: 6),
            Text(
              badge.label,
              style: theme.textTheme.labelSmall?.copyWith(
                color: accent,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class ModelSelectorChip extends StatelessWidget {
  final AiModelOption option;
  final VoidCallback onTap;
  final bool compact;

  const ModelSelectorChip({
    super.key,
    required this.option,
    required this.onTap,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final accent = option.accentColor;
    final padding = compact
        ? const EdgeInsets.symmetric(horizontal: 12, vertical: 6)
        : const EdgeInsets.symmetric(horizontal: 14, vertical: 7);
    final iconSize = compact ? 16.0 : 18.0;
    final textStyle = (compact
            ? theme.textTheme.labelSmall
            : theme.textTheme.labelMedium)
        ?.copyWith(
      fontWeight: FontWeight.w600,
      color: accent.withOpacity(isDark ? 0.9 : 0.95),
    );
    final backgroundOpacity = compact ? 0.12 : 0.16;
    final borderOpacity = compact ? 0.4 : 0.55;

    return Tooltip(
      message: 'Current model: ${option.name}\nTap to switch',
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          constraints: BoxConstraints(maxWidth: compact ? 180 : 220),
          padding: padding,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            color: accent.withOpacity(isDark ? backgroundOpacity + 0.04 : backgroundOpacity),
            border: Border.all(color: accent.withOpacity(borderOpacity)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(option.icon, size: iconSize, color: accent.withOpacity(isDark ? 0.9 : 1.0)),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  option.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: textStyle,
                ),
              ),
              const SizedBox(width: 6),
              Icon(Icons.expand_more, size: iconSize, color: accent.withOpacity(isDark ? 0.9 : 1.0)),
            ],
          ),
        ),
      ),
    );
  }
}
