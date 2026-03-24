import React, { useState, useRef } from 'react';
import { Mic, X, Check } from 'lucide-react';
import { useTypedTranslation } from '@/hooks/useTranslation';
import { getBackendUrl } from '@/lib/backend';
import AuthService from '@/services/authService';

interface VoiceInputProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onRecordingStateChange?: (recording: boolean) => void;
  onTranscribeStart: () => void;
  onTranscribeComplete: (text: string) => void;
  onError: (error: string) => void;
  isProcessing?: boolean;
}

export default function VoiceInput({
  canvasRef,
  onRecordingStateChange,
  onTranscribeStart,
  onTranscribeComplete,
  onError,
  isProcessing = false,
}: VoiceInputProps) {
  const { t } = useTypedTranslation();
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const amplitudesRef = useRef<number[]>([]);
  const lastSampleTimeRef = useRef<number>(0);
  const SAMPLE_FPS = 20; // samples per second used to represent time
  const TARGET_SECONDS = 10; // default window in seconds to represent
  // Draw waveform as a scrolling strip of rounded bars (newest on right)
  const drawWaveform = () => {
    const canvas = canvasRef.current;
    if (!canvas || !analyserRef.current) return;

    // Sync internal resolution to rendered size once visible
    if (canvas.offsetWidth > 0) canvas.width = canvas.offsetWidth;
    if (canvas.offsetHeight > 0) canvas.height = canvas.offsetHeight;

    const analyser = analyserRef.current;
    const timeData = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(timeData);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Determine number of bars primarily from time window (TARGET_SECONDS)
    // but constrained by canvas width. We sample at SAMPLE_FPS so targetNumBars
    // represents TARGET_SECONDS of audio.
    const targetNumBars = SAMPLE_FPS * TARGET_SECONDS;
    const minBarWidth = 4; // make bars small so they look like points/circles
    const gap = 3;
    const maxBarsFit = Math.max(4, Math.floor(W / (minBarWidth + gap)));
    const numBars = Math.min(targetNumBars, maxBarsFit);

    // Compute instantaneous amplitude (RMS) but only push into buffer at SAMPLE_FPS
    const now = performance.now();
    let rms = 0;
    if (now - lastSampleTimeRef.current >= 1000 / SAMPLE_FPS) {
      let sumSq = 0;
      for (let i = 0; i < timeData.length; i++) {
        const v = (timeData[i] - 128) / 128;
        sumSq += v * v;
      }
      rms = Math.sqrt(sumSq / timeData.length);
      lastSampleTimeRef.current = now;

      const amplitudes = amplitudesRef.current;
      amplitudes.push(rms);
      // Trim to keep latest values
      while (amplitudes.length > targetNumBars) amplitudes.shift();
    }

    // Now decide how many bars to render (numBars). Use the most recent samples.
    const amplitudes = amplitudesRef.current.slice(-numBars);
    while (amplitudes.length < numBars) amplitudes.unshift(0);

    // Compute barWidth to fill available width for numBars
    const barWidth = Math.max(2, Math.floor((W - gap * (numBars - 1)) / numBars));

    // Center the strip horizontally
    const totalWidth = numBars * barWidth + (numBars - 1) * gap;
    const startX = Math.max(0, Math.floor((W - totalWidth) / 2));

    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    const minHeight = Math.max(2, Math.floor(barWidth * 0.9));

    for (let i = 0; i < numBars; i++) {
      const amp = amplitudes[i] ?? 0;
      // Grow heights more aggressively for visibility
      const targetH = Math.max(minHeight, Math.min(H, (amp * 1.6) * H));
      const x = startX + i * (barWidth + gap);
      const y = (H - targetH) / 2;
      const radius = Math.min(barWidth / 2, targetH / 2);

      if (targetH <= barWidth + 1) {
        const cx = x + barWidth / 2;
        const cy = H / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(1, Math.floor(barWidth / 2)), 0, Math.PI * 2);
        ctx.fill();
      } else if ((ctx as any).roundRect) {
        ctx.beginPath();
        (ctx as any).roundRect(x, y, barWidth, targetH, radius);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, barWidth, targetH);
      }
    }

    animationFrameRef.current = requestAnimationFrame(drawWaveform);
  };

  // Start recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up audio context for waveform visualization
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      const analyser = audioContext.createAnalyser();
      analyserRef.current = analyser;
      analyser.fftSize = 512;
      analyser.minDecibels = -85;
      analyser.maxDecibels = -10;
      analyser.smoothingTimeConstant = 0.8;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        chunksRef.current.push(event.data);
      };

      mediaRecorder.start();
      setIsRecording(true);
      onRecordingStateChange?.(true);
      // Delay first draw so React can flip canvas to display:block
      setTimeout(drawWaveform, 16);
    } catch (error) {
      onError(t('voice.microphoneAccessDenied'));
      console.error('Error accessing microphone:', error);
    }
  };

  // Stop recording and process
  const stopRecording = async () => {
    if (!mediaRecorderRef.current || !streamRef.current) return;

    return new Promise<void>((resolve) => {
      const mediaRecorder = mediaRecorderRef.current!;

      mediaRecorder.onstop = async () => {
        // Stop animation
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }

        // Stop all tracks
        streamRef.current?.getTracks().forEach((track) => track.stop());

        // Close audio context
        if (audioContextRef.current) {
          try {
            await audioContextRef.current.close();
          } catch (e) {
            console.warn('Error closing audio context:', e);
          }
        }

        // Create blob
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });

        // Reset UI state
        setIsRecording(false);
        onRecordingStateChange?.(false);
        chunksRef.current = [];

        // Send to backend
        onTranscribeStart();
        try {
          const formData = new FormData();
          formData.append('audio', audioBlob, 'recording.webm');

          const token = await AuthService.getValidToken();
          const backendUrl = getBackendUrl();
          
          const response = await fetch(`${backendUrl}/chats/speech-to-text`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
            },
            body: formData,
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || errorData.message || 'Failed to transcribe audio');
          }

          const data = await response.json();
          onTranscribeComplete(data.text);
        } catch (error: any) {
          console.error('Transcription error:', error);
          onError(error?.message || t('voice.transcriptionFailed'));
        }

        resolve();
      };

      mediaRecorder.stop();
    });
  };

  // Cancel recording
  const cancelRecording = () => {
    // Stop recording if active
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    // Stop all tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    // Close audio context
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) {
        console.warn('Error closing audio context:', e);
      }
    }

    // Cancel animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    setIsRecording(false);
    onRecordingStateChange?.(false);
    chunksRef.current = [];
  };

  if (!isRecording) {
    return (
      <button
        type="button"
        onClick={startRecording}
        disabled={isProcessing}
        className="flex items-center justify-center bg-gradient-to-r from-primary to-primary/90 text-primary-foreground rounded-xl hover:shadow-lg active:translate-y-0 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed h-9 w-9"
        aria-label="Start voice recording"
        title={t('voice.startRecording')}
      >
        <Mic className="w-4 h-4" />
      </button>
    );
  }

  // While recording: canvas lives in the textarea slot (rendered by parent).
  // Only render cancel + stop buttons here.
  return (
    <div className="flex items-center gap-2">
      {/* Cancel button */}
      <button
        type="button"
        onClick={cancelRecording}
        disabled={isProcessing}
        className="flex items-center justify-center bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed h-9 w-9"
        aria-label="Cancel recording"
        title={t('voice.cancelRecording')}
      >
        <X className="w-4 h-4" />
      </button>

      {/* Stop/Submit button */}
      <button
        type="button"
        onClick={stopRecording}
        disabled={isProcessing}
        className="flex items-center justify-center bg-gradient-to-r from-green-500 to-green-600 text-white hover:shadow-lg active:translate-y-0 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed h-9 w-9 rounded-lg"
        aria-label="Stop recording and transcribe"
        title={t('voice.stopAndTranscribe')}
      >
        {isProcessing ? (
          <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
        ) : (
          <Check className="w-4 h-4" />
        )}
      </button>
    </div>
  );
}
