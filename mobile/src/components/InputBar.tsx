import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  Animated,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, radius } from '../theme/tokens';

interface InputBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onAttachFile: () => void;
  onVoiceInput: () => void;
  onModelSelect: () => void;
  selectedModel?: string;
  isRecording?: boolean;
  isUploading?: boolean;
  disabled?: boolean;
  attachments?: { name: string }[];
  onRemoveAttachment?: (index: number) => void;
  placeholder?: string;
}

export default function InputBar({
  value,
  onChangeText,
  onSend,
  onAttachFile,
  onVoiceInput,
  onModelSelect,
  selectedModel,
  isRecording,
  isUploading,
  disabled,
  attachments = [],
  onRemoveAttachment,
  placeholder = 'Ask anything...',
}: InputBarProps) {
  const [showActions, setShowActions] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const menuAnim = useRef(new Animated.Value(0)).current;
  const plusBtnAnim = useRef(new Animated.Value(0)).current;

  const canSend = value.trim().length > 0 || attachments.length > 0;
  const isEmpty = value.trim().length === 0 && attachments.length === 0;

  const toggleActions = useCallback(() => {
    if (showActions) {
      Animated.timing(menuAnim, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }).start(() => setShowActions(false));
      Animated.spring(plusBtnAnim, {
        toValue: 0,
        tension: 120,
        friction: 14,
        useNativeDriver: true,
      }).start();
    } else {
      setShowActions(true);
      Animated.spring(menuAnim, {
        toValue: 1,
        tension: 150,
        friction: 13,
        useNativeDriver: true,
      }).start();
      Animated.spring(plusBtnAnim, {
        toValue: 1,
        tension: 150,
        friction: 13,
        useNativeDriver: true,
      }).start();
    }
  }, [showActions, menuAnim, plusBtnAnim]);

  const handleSend = useCallback(() => {
    if (canSend && !disabled) {
      Keyboard.dismiss();
      onSend();
    }
  }, [canSend, disabled, onSend]);

  const handleVoicePress = useCallback(() => {
    Keyboard.dismiss();
    onVoiceInput();
  }, [onVoiceInput]);

  return (
    <View style={s.container}>
      {/* Model selector */}
      <TouchableWithoutFeedback onPress={onModelSelect}>
        <View style={s.modelSelector}>
          <View style={s.modelSelectorInner}>
            <View style={s.modelSelectorDot} />
            <Text style={s.modelSelectorText} numberOfLines={1}>
              {selectedModel || 'Select Model'}
            </Text>
            <Feather name="chevron-up" size={10} color={colors.textSoft} />
          </View>
        </View>
      </TouchableWithoutFeedback>

      {/* Main input bubble */}
      <View style={[
        s.inputBubble,
        isFocused && s.inputBubbleFocused,
      ]}>
        {/* Action buttons popup */}
        {showActions && (
          <Animated.View
            style={[
              s.actionsMenu,
              {
                opacity: menuAnim,
                transform: [
                  {
                    scale: menuAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.9, 1],
                    }),
                  },
                  {
                    translateY: menuAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [8, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Animated.View style={s.actionItem}>
              <Pressable
                style={({ pressed }) => [
                  s.actionBtn,
                  pressed && s.actionBtnPressed,
                ]}
                onPress={() => {
                  toggleActions();
                  onAttachFile();
                }}
              >
                <View style={[s.actionIcon, { backgroundColor: '#58a6ff25' }]}>
                  <Feather name="paperclip" size={20} color="#58a6ff" />
                </View>
              </Pressable>
              <Text style={s.actionLabel}>File</Text>
            </Animated.View>

            <Animated.View style={s.actionItem}>
              <Pressable
                style={({ pressed }) => [
                  s.actionBtn,
                  pressed && s.actionBtnPressed,
                ]}
                onPress={() => {
                  toggleActions();
                  onVoiceInput();
                }}
              >
                <View style={[s.actionIcon, { backgroundColor: colors.success + '25' }]}>
                  <Feather name="mic" size={20} color={colors.success} />
                </View>
              </Pressable>
              <Text style={s.actionLabel}>Voice</Text>
            </Animated.View>
          </Animated.View>
        )}

        <View style={s.inputRow}>
          {/* Plus button */}
          <Animated.View style={{
            transform: [{
              rotate: plusBtnAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0deg', '45deg'],
              }),
            }],
          }}>
            <Pressable
              style={({ pressed }) => [
                s.plusBtn,
                pressed && s.plusBtnPressed,
              ]}
              onPress={toggleActions}
              disabled={disabled}
            >
              <Feather
                name="plus"
                size={22}
                color={colors.textMuted}
              />
            </Pressable>
          </Animated.View>

          {/* Text input */}
          <TextInput
            ref={inputRef}
            style={s.input}
            placeholder={placeholder}
            placeholderTextColor={colors.textSoft}
            value={value}
            onChangeText={onChangeText}
            multiline
            maxLength={8000}
            blurOnSubmit={false}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            editable={!disabled}
          />

          {/* Send or Mic button */}
          {isEmpty ? (
            <Pressable
              style={({ pressed }) => [
                s.micBtn,
                isRecording && s.micBtnRecording,
                pressed && !isRecording && s.micBtnPressed,
              ]}
              onPress={handleVoicePress}
              disabled={disabled || isUploading}
            >
              {isUploading ? (
                <Animated.View style={s.spinner} />
              ) : (
                <Feather
                  name={isRecording ? 'square' : 'mic'}
                  size={20}
                  color={isRecording ? colors.danger : colors.textMuted}
                />
              )}
            </Pressable>
          ) : (
            <Pressable
              style={({ pressed }) => [
                s.sendBtn,
                (!canSend || disabled) && s.sendBtnDisabled,
                pressed && s.sendBtnPressed,
              ]}
              onPress={handleSend}
              disabled={!canSend || disabled}
            >
              <Feather name="arrow-up" size={20} color={colors.primaryText} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  modelSelector: {
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  modelSelectorInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.panelSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  modelSelectorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  modelSelectorText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    maxWidth: 140,
  },
  inputBubble: {
    backgroundColor: colors.panel,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xs,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  inputBubbleFocused: {
    borderColor: colors.success,
    ...Platform.select({
      ios: {
        shadowColor: colors.success,
        shadowOpacity: 0.15,
      },
    }),
  },
  actionsMenu: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xl,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  actionItem: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  actionBtn: {
    padding: 2,
  },
  actionBtnPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionLabel: {
    color: colors.textSoft,
    fontSize: 11,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  plusBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.panelSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  plusBtnPressed: {
    backgroundColor: colors.border,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
    maxHeight: 120,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.95 }],
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  micBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.panelSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  micBtnPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.95 }],
  },
  micBtnRecording: {
    backgroundColor: colors.danger + '20',
  },
  spinner: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.textMuted,
    borderTopColor: 'transparent',
  },
});
