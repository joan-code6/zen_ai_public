import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../state/app_state.dart';
import '../i18n/i18n.dart';

class CalendarPage extends StatefulWidget {
  final AppState appState;
  final VoidCallback? onSignIn;

  const CalendarPage({super.key, required this.appState, this.onSignIn});

  @override
  State<CalendarPage> createState() => _CalendarPageState();
}

class _CalendarPageState extends State<CalendarPage> {
  late DateTime _focusedMonth;
  Map<String, dynamic>? _selectedEvent;

  @override
  void initState() {
    super.initState();
    _focusedMonth = DateTime.now();
  }

  void _previousMonth() {
    setState(() {
      _focusedMonth = DateTime(_focusedMonth.year, _focusedMonth.month - 1);
    });
  }

  void _nextMonth() {
    setState(() {
      _focusedMonth = DateTime(_focusedMonth.year, _focusedMonth.month + 1);
    });
  }

  void _jumpToToday() {
    setState(() {
      _focusedMonth = DateTime.now();
    });
  }

  List<DateTime> _getDaysInWeek(DateTime weekStart) {
    return List.generate(7, (index) => weekStart.add(Duration(days: index)));
  }

  List<DateTime> _getWeeksStarts(DateTime month) {
    final firstDayOfMonth = DateTime(month.year, month.month, 1);
    final int firstWeekday = firstDayOfMonth.weekday;
    final int offset = firstWeekday % 7;
    final startOfGrid = firstDayOfMonth.subtract(Duration(days: offset));

    final List<DateTime> weeks = [];
    // Generate 6 weeks to cover all possible month layouts
    for (int i = 0; i < 6; i++) {
      weeks.add(startOfGrid.add(Duration(days: i * 7)));
    }
    return weeks;
  }

  bool _isSameDay(DateTime a, DateTime b) {
    return a.year == b.year && a.month == b.month && a.day == b.day;
  }

  Color _getEventColor(String summary) {
    final colors = [
      Colors.blue.shade600,
      Colors.green.shade600,
      Colors.purple.shade600,
      Colors.orange.shade600,
      Colors.red.shade600,
      Colors.teal.shade600,
      Colors.indigo.shade600,
      Colors.pink.shade600,
    ];
    return colors[summary.hashCode.abs() % colors.length];
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return ListenableBuilder(
      listenable: widget.appState,
      builder: (context, _) {
        if (!widget.appState.isAuthenticated) {
          return _buildAuthRequiredView(theme);
        }

        if (!widget.appState.isCalendarConnected) {
          return _buildConnectCalendarView(theme);
        }

        if (widget.appState.isLoadingCalendar && widget.appState.calendarEvents.isEmpty) {
          return const Center(child: CircularProgressIndicator());
        }

        return Stack(
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    children: [
                      _buildHeader(theme),
                      _buildWeekDaysHeader(theme),
                      Expanded(
                        child: _buildCalendarBody(theme),
                      ),
                    ],
                  ),
                ),
                if (_selectedEvent != null)
                  _buildEventSidebar(theme),
              ],
            ),
            Positioned(
              right: 24,
              bottom: 24,
              child: FloatingActionButton.extended(
                onPressed: () => _showEventDialog(context),
                icon: const Icon(Icons.add),
                label: const Text('Create Event'),
              ),
            ),
          ],
        );
      },
    );
  }

  Future<void> _showEventDialog(BuildContext context, [Map<String, dynamic>? event]) async {
    final isEditing = event != null;
    final titleController = TextEditingController(text: event?['summary']);
    final descriptionController = TextEditingController(text: event?['description']);
    final locationController = TextEditingController(text: event?['location']);
    
    DateTime start = event != null ? _parseDateTime(event['start'])! : DateTime.now();
    DateTime end = event != null ? _parseDateTime(event['end']) ?? start.add(const Duration(hours: 1)) : start.add(const Duration(hours: 1));
    bool isAllDay = event != null ? _isAllDay(event['start']) : false;
    
    TimeOfDay startTime = TimeOfDay.fromDateTime(start);
    TimeOfDay endTime = TimeOfDay.fromDateTime(end);

    await showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) {
          return AlertDialog(
            title: Text(isEditing ? 'Edit Event' : 'New Event'),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: titleController,
                    decoration: const InputDecoration(labelText: 'Title', border: OutlineInputBorder()),
                    autofocus: true,
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Start'),
                            const SizedBox(height: 4),
                            OutlinedButton(
                              onPressed: () async {
                                final date = await showDatePicker(
                                  context: context,
                                  initialDate: start,
                                  firstDate: DateTime(2000),
                                  lastDate: DateTime(2100),
                                );
                                if (date != null) {
                                  setState(() => start = DateTime(
                                    date.year, date.month, date.day,
                                    start.hour, start.minute,
                                  ));
                                }
                              },
                              child: Text(DateFormat('MMM d, y').format(start)),
                            ),
                            if (!isAllDay) ...[
                              const SizedBox(height: 4),
                              OutlinedButton(
                                onPressed: () async {
                                  final time = await showTimePicker(context: context, initialTime: startTime);
                                  if (time != null) {
                                    setState(() {
                                      startTime = time;
                                      start = DateTime(
                                        start.year, start.month, start.day,
                                        time.hour, time.minute,
                                      );
                                    });
                                  }
                                },
                                child: Text(startTime.format(context)),
                              ),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('End'),
                            const SizedBox(height: 4),
                            OutlinedButton(
                              onPressed: () async {
                                final date = await showDatePicker(
                                  context: context,
                                  initialDate: end,
                                  firstDate: DateTime(2000),
                                  lastDate: DateTime(2100),
                                );
                                if (date != null) {
                                  setState(() => end = DateTime(
                                    date.year, date.month, date.day,
                                    end.hour, end.minute,
                                  ));
                                }
                              },
                              child: Text(DateFormat('MMM d, y').format(end)),
                            ),
                            if (!isAllDay) ...[
                              const SizedBox(height: 4),
                              OutlinedButton(
                                onPressed: () async {
                                  final time = await showTimePicker(context: context, initialTime: endTime);
                                  if (time != null) {
                                    setState(() {
                                      endTime = time;
                                      end = DateTime(
                                        end.year, end.month, end.day,
                                        time.hour, time.minute,
                                      );
                                    });
                                  }
                                },
                                child: Text(endTime.format(context)),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  CheckboxListTile(
                    title: const Text('All Day'),
                    value: isAllDay,
                    onChanged: (val) => setState(() => isAllDay = val ?? false),
                    contentPadding: EdgeInsets.zero,
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: locationController,
                    decoration: const InputDecoration(labelText: 'Location', border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: descriptionController,
                    decoration: const InputDecoration(labelText: 'Description', border: OutlineInputBorder()),
                    maxLines: 3,
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () {
                  final newEvent = {
                    'summary': titleController.text,
                    'description': descriptionController.text,
                    'location': locationController.text,
                    'start': isAllDay 
                        ? {'date': DateFormat('yyyy-MM-dd').format(start)}
                        : {'dateTime': start.toIso8601String()},
                    'end': isAllDay
                        ? {'date': DateFormat('yyyy-MM-dd').format(end.add(const Duration(days: 1)))} // Google Calendar all-day end is exclusive
                        : {'dateTime': end.toIso8601String()},
                  };

                  if (isEditing) {
                    widget.appState.updateEvent(event['id'], newEvent);
                  } else {
                    widget.appState.createEvent(newEvent);
                  }
                  Navigator.pop(context);
                },
                child: Text(isEditing ? 'Save' : 'Create'),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildCalendarBody(ThemeData theme) {
    final weeks = _getWeeksStarts(_focusedMonth);
    
    return LayoutBuilder(
      builder: (context, constraints) {
        final cellWidth = constraints.maxWidth / 7;
        final cellHeight = constraints.maxHeight / 6;

        return Column(
          children: weeks.map((weekStart) {
            return SizedBox(
              height: cellHeight,
              child: _buildWeekRow(theme, weekStart, cellWidth, cellHeight),
            );
          }).toList(),
        );
      },
    );
  }

  Widget _buildWeekRow(ThemeData theme, DateTime weekStart, double cellWidth, double cellHeight) {
    final days = _getDaysInWeek(weekStart);
    final events = _getEventsForWeek(weekStart, days.last);
    final layout = _layoutEvents(events, weekStart);

    return Stack(
      clipBehavior: Clip.none,
      children: [
        // Background Grid
        Row(
          children: days.map((date) => SizedBox(
            width: cellWidth,
            child: _buildDayCell(theme, date),
          )).toList(),
        ),
        // Events Layer
        ...layout.map((item) {
          final event = item.event;
          final top = 28.0 + (item.rowIndex * 22.0); // 28 for date number space
          
          // Don't render if it overflows the cell height
          if (top + 20 > cellHeight) return const SizedBox.shrink();

          return Positioned(
            top: top,
            left: item.startIndex * cellWidth,
            width: item.duration * cellWidth,
            height: 20,
            child: _buildEventBar(theme, event, item.isStart, item.isEnd),
          );
        }),
      ],
    );
  }

  Widget _buildDayCell(ThemeData theme, DateTime date) {
    final isToday = _isSameDay(date, DateTime.now());
    final isOutsideMonth = date.month != _focusedMonth.month;
    final isWeekend = date.weekday == DateTime.saturday || date.weekday == DateTime.sunday;

    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: theme.dividerColor.withOpacity(0.3), width: 0.5),
        color: isOutsideMonth 
            ? theme.colorScheme.surfaceContainerHighest.withOpacity(0.3) // Grayer background
            : null,
      ),
      padding: const EdgeInsets.all(4),
      alignment: Alignment.topCenter,
      child: Container(
        width: 24,
        height: 24,
        decoration: BoxDecoration(
          color: isToday ? theme.colorScheme.primary : Colors.transparent,
          shape: BoxShape.circle,
        ),
        alignment: Alignment.center,
        child: Text(
          '${date.day}',
          style: theme.textTheme.bodySmall?.copyWith(
            color: isToday 
                ? theme.colorScheme.onPrimary 
                : (isOutsideMonth 
                    ? theme.disabledColor // Grayer text
                    : (isWeekend ? theme.colorScheme.secondary : null)),
            fontWeight: isToday ? FontWeight.bold : FontWeight.normal,
          ),
        ),
      ),
    );
  }

  Widget _buildEventBar(ThemeData theme, Map<String, dynamic> event, bool isStart, bool isEnd) {
    final summary = event['summary'] ?? 'No Title';
    final color = _getEventColor(summary);
    final isSelected = _selectedEvent == event;

    return GestureDetector(
      onTap: () {
        setState(() {
          _selectedEvent = event;
        });
      },
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 1, horizontal: 1),
        padding: const EdgeInsets.symmetric(horizontal: 4),
        decoration: BoxDecoration(
          color: color.withOpacity(isSelected ? 1.0 : 0.8),
          borderRadius: BorderRadius.horizontal(
            left: isStart ? const Radius.circular(4) : Radius.zero,
            right: isEnd ? const Radius.circular(4) : Radius.zero,
          ),
          border: isSelected ? Border.all(color: Colors.white, width: 2) : null,
          boxShadow: isSelected ? [
            BoxShadow(color: Colors.black.withOpacity(0.2), blurRadius: 4, offset: const Offset(0, 2))
          ] : null,
        ),
        alignment: Alignment.centerLeft,
        child: Text(
          summary,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 11,
            fontWeight: FontWeight.w500,
          ),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ),
    );
  }

  Widget _buildEventSidebar(ThemeData theme) {
    final event = _selectedEvent!;
    final summary = event['summary'] ?? 'No Title';
    final description = event['description'];
    final location = event['location'];
    
    DateTime? start, end;
    if (event['start'] != null) {
      start = _parseDateTime(event['start']);
    }
    if (event['end'] != null) {
      end = _parseDateTime(event['end']);
    }

    final dateFormat = DateFormat('EEE, MMM d, yyyy');
    final timeFormat = DateFormat('h:mm a');

    return Container(
      width: 300,
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: Border(left: BorderSide(color: theme.dividerColor)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 10,
            offset: const Offset(-2, 0),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'Event Details',
                    style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => setState(() => _selectedEvent = null),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(20),
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Row(
                        children: [
                          IconButton(
                            icon: const Icon(Icons.edit_outlined),
                            onPressed: () {
                              _showEventDialog(context, event);
                            },
                            tooltip: 'Edit',
                          ),
                          IconButton(
                            icon: const Icon(Icons.delete_outline),
                            onPressed: () async {
                              final confirm = await showDialog<bool>(
                                context: context,
                                builder: (context) => AlertDialog(
                                  title: const Text('Delete Event?'),
                                  content: const Text('Are you sure you want to delete this event?'),
                                  actions: [
                                    TextButton(
                                      onPressed: () => Navigator.pop(context, false),
                                      child: const Text('Cancel'),
                                    ),
                                    FilledButton(
                                      onPressed: () => Navigator.pop(context, true),
                                      style: FilledButton.styleFrom(backgroundColor: Colors.red),
                                      child: const Text('Delete'),
                                    ),
                                  ],
                                ),
                              );
                              
                              if (confirm == true) {
                                await widget.appState.deleteEvent(event['id']);
                                setState(() => _selectedEvent = null);
                              }
                            },
                            tooltip: 'Delete',
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 16,
                      height: 16,
                      margin: const EdgeInsets.only(top: 4),
                      decoration: BoxDecoration(
                        color: _getEventColor(summary),
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        summary,
                        style: theme.textTheme.headlineSmall?.copyWith(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                if (start != null) ...[
                  _buildDetailRow(
                    theme, 
                    Icons.access_time, 
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(dateFormat.format(start)),
                        if (!_isAllDay(event['start']))
                          Text('${timeFormat.format(start)} - ${end != null ? timeFormat.format(end) : ''}'),
                      ],
                    )
                  ),
                  const SizedBox(height: 16),
                ],
                if (location != null) ...[
                  _buildDetailRow(theme, Icons.location_on_outlined, Text(location)),
                  const SizedBox(height: 16),
                ],
                if (description != null) ...[
                  _buildDetailRow(theme, Icons.notes, Text(description)),
                  const SizedBox(height: 16),
                ],
                if (event['htmlLink'] != null) ...[
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: () {
                      // Use url_launcher if available, or just print for now
                      // launchUrl(Uri.parse(event['htmlLink']));
                    },
                    icon: const Icon(Icons.open_in_new, size: 16),
                    label: const Text('Open in Google Calendar'),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDetailRow(ThemeData theme, IconData icon, Widget content) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 20, color: theme.colorScheme.onSurfaceVariant),
        const SizedBox(width: 12),
        Expanded(
          child: DefaultTextStyle(
            style: theme.textTheme.bodyMedium!,
            child: content,
          ),
        ),
      ],
    );
  }

  // --- Helpers ---

  DateTime? _parseDateTime(Map<String, dynamic> dateField) {
    if (dateField['dateTime'] != null) {
      return DateTime.parse(dateField['dateTime']).toLocal();
    } else if (dateField['date'] != null) {
      return DateTime.parse(dateField['date']);
    }
    return null;
  }

  bool _isAllDay(Map<String, dynamic> dateField) {
    return dateField['date'] != null;
  }

  List<Map<String, dynamic>> _getEventsForWeek(DateTime start, DateTime end) {
    final events = widget.appState.calendarEvents;
    return events.where((event) {
      final eventStart = _parseDateTime(event['start']);
      final eventEnd = _parseDateTime(event['end']) ?? eventStart;
      
      if (eventStart == null) return false;

      // Check overlap
      // Event starts before week ends AND event ends after week starts
      // Add 1 day to end because end is inclusive for overlap check usually
      final weekEndInclusive = end.add(const Duration(days: 1));
      return eventStart.isBefore(weekEndInclusive) && eventEnd!.isAfter(start);
    }).toList();
  }

  List<_EventLayoutItem> _layoutEvents(List<Map<String, dynamic>> events, DateTime weekStart) {
    // Sort events: longer events first, then by start time
    events.sort((a, b) {
      final startA = _parseDateTime(a['start'])!;
      final startB = _parseDateTime(b['start'])!;
      final durA = (_parseDateTime(a['end']) ?? startA).difference(startA);
      final durB = (_parseDateTime(b['end']) ?? startB).difference(startB);
      
      if (startA != startB) return startA.compareTo(startB);
      return durB.compareTo(durA); // Descending duration
    });

    final List<_EventLayoutItem> layoutItems = [];
    final List<List<bool>> occupied = List.generate(10, (_) => List.filled(7, false)); // Max 10 rows

    for (final event in events) {
      final start = _parseDateTime(event['start'])!;
      final end = _parseDateTime(event['end']) ?? start;
      
      // Calculate start and end indices relative to this week (0-6)
      int startIndex = start.difference(weekStart).inDays;
      int endIndex = end.difference(weekStart).inDays;
      
      // If it's an all-day event (date only), the end date is usually exclusive in Google API
      // e.g. Jan 1 to Jan 2 is 1 day.
      if (_isAllDay(event['start'])) {
        endIndex -= 1;
      }

      // Clamp to week boundaries
      final originalStartIndex = startIndex;
      final originalEndIndex = endIndex;
      
      startIndex = startIndex.clamp(0, 6);
      endIndex = endIndex.clamp(0, 6);

      if (startIndex > endIndex) continue; // Should not happen if overlap check is correct

      // Find first available row
      int row = 0;
      bool fits = false;
      while (row < 10) {
        bool rowClear = true;
        for (int d = startIndex; d <= endIndex; d++) {
          if (occupied[row][d]) {
            rowClear = false;
            break;
          }
        }
        if (rowClear) {
          fits = true;
          break;
        }
        row++;
      }

      if (fits) {
        // Mark occupied
        for (int d = startIndex; d <= endIndex; d++) {
          occupied[row][d] = true;
        }
        
        layoutItems.add(_EventLayoutItem(
          event: event,
          rowIndex: row,
          startIndex: startIndex,
          duration: endIndex - startIndex + 1,
          isStart: originalStartIndex >= 0, // Starts in this week or later
          isEnd: originalEndIndex <= 6,     // Ends in this week or earlier
        ));
      }
    }
    return layoutItems;
  }

  // --- Reused Widgets ---
  
  Widget _buildAuthRequiredView(ThemeData theme) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.lock_outline_rounded, size: 64, color: theme.colorScheme.secondary),
          const SizedBox(height: 24),
          Text(
            context.t('auth_required'),
            style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          Text(context.t('please_sign_in_access_calendar'), style: theme.textTheme.bodyLarge),
          const SizedBox(height: 32),
          FilledButton.icon(
            onPressed: widget.onSignIn,
            icon: const Icon(Icons.login),
            label: Text(context.t('sign_in')),
            style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildConnectCalendarView(ThemeData theme) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.calendar_month_rounded, size: 64, color: theme.colorScheme.primary),
          const SizedBox(height: 24),
          Text(
            context.t('connect_google_calendar'),
            style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          Text(context.t('sync_your_events'), style: theme.textTheme.bodyLarge),
          const SizedBox(height: 32),
          FilledButton.icon(
            onPressed: widget.appState.isLoadingCalendar
                ? null
                : () => widget.appState.connectCalendar(),
            icon: widget.appState.isLoadingCalendar
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Icon(Icons.link),
            label: const Text('Connect Calendar'),
            style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader(ThemeData theme) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 16.0),
      decoration: BoxDecoration(
        color: theme.scaffoldBackgroundColor,
        border: Border(bottom: BorderSide(color: theme.dividerColor)),
      ),
      child: Row(
        children: [
          Text(
            '${_getMonthName(_focusedMonth.month)} ${_focusedMonth.year}',
            style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.bold),
          ),
          const Spacer(),
          IconButton(
            icon: const Icon(Icons.chevron_left),
            onPressed: _previousMonth,
            tooltip: 'Previous Month',
          ),
          IconButton(
            icon: const Icon(Icons.today),
            onPressed: _jumpToToday,
            tooltip: 'Today',
          ),
          IconButton(
            icon: const Icon(Icons.chevron_right),
            onPressed: _nextMonth,
            tooltip: 'Next Month',
          ),
          const SizedBox(width: 16),
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_vert),
            onSelected: (value) {
              if (value == 'refresh') widget.appState.fetchCalendarEvents();
              if (value == 'disconnect') widget.appState.disconnectCalendar();
            },
            itemBuilder: (context) => [
              const PopupMenuItem(
                value: 'refresh',
                child: Row(
                  children: [Icon(Icons.refresh, size: 20), SizedBox(width: 8), Text('Refresh')],
                ),
              ),
              const PopupMenuItem(
                value: 'disconnect',
                child: Row(
                  children: [Icon(Icons.link_off, size: 20), SizedBox(width: 8), Text('Disconnect')],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildWeekDaysHeader(ThemeData theme) {
    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12.0),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        children: weekDays.map((day) => Expanded(
          child: Center(
            child: Text(
              day,
              style: theme.textTheme.titleSmall?.copyWith(
                color: theme.colorScheme.onSurface.withOpacity(0.6),
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        )).toList(),
      ),
    );
  }

  String _getMonthName(int month) {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[month - 1];
  }
}

class _EventLayoutItem {
  final Map<String, dynamic> event;
  final int rowIndex;
  final int startIndex;
  final int duration;
  final bool isStart;
  final bool isEnd;

  _EventLayoutItem({
    required this.event,
    required this.rowIndex,
    required this.startIndex,
    required this.duration,
    required this.isStart,
    required this.isEnd,
  });
}

