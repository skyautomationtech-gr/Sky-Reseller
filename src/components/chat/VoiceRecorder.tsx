import React, { useState, useEffect, useRef } from 'react';
import { Square, Trash2, Send, Loader2, AlertCircle, RefreshCw } from 'lucide-react';

interface VoiceRecorderProps {
  onSendVoice: (audioBlob: Blob, duration: number) => void;
  onCancel: () => void;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onSendVoice, onCancel }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [waveformLevels, setWaveformLevels] = useState<number[]>([20, 35, 55, 75, 40, 85, 60, 35, 50, 70, 30, 90]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);
  const animFrameRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingSecondsRef = useRef(0);

  useEffect(() => {
    startRecording();

    return () => {
      stopStreams();
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  const stopStreams = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {}
      });
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch (e) {}
    }
  };

  const startRecording = async () => {
    setErrorMsg(null);
    audioChunksRef.current = [];
    setRecordingSeconds(0);
    recordingSecondsRef.current = 0;
    setIsSubmitting(false);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone recording is not supported in this browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      });
      streamRef.current = stream;

      // Realtime Audio Analyzer for visual waveform feedback
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const audioCtx = new AudioCtx();
          audioContextRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          analyserRef.current = analyser;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const updateWaveform = () => {
            if (analyserRef.current) {
              analyserRef.current.getByteFrequencyData(dataArray);
              const sliced = Array.from(dataArray.slice(0, 12)).map((v) => Math.max(15, (v / 255) * 100));
              setWaveformLevels(sliced);
            }
            animFrameRef.current = requestAnimationFrame(updateWaveform);
          };
          updateWaveform();
        }
      } catch (e) {
        console.warn('Audio Visualizer note:', e);
      }

      // Check supported MIME types
      let mimeType = '';
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/aac')) {
          mimeType = 'audio/aac';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        }
      }

      const mediaRecorder = mimeType 
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
        
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(250);
      setIsRecording(true);

      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          const next = prev + 1;
          recordingSecondsRef.current = next;
          return next;
        });
      }, 1000);
    } catch (err: any) {
      console.error('Error accessing microphone:', err);
      setErrorMsg(err.message || 'Microphone access was denied. Please allow microphone permission to send voice notes.');
      setIsRecording(false);
    }
  };

  const handleStopAndSend = () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    const rec = mediaRecorderRef.current;
    const finalSecs = Math.max(recordingSecondsRef.current, 1);

    if (rec && rec.state !== 'inactive') {
      try {
        if (rec.state === 'recording') {
          rec.requestData();
        }
      } catch (e) {}

      rec.onstop = () => {
        const mime = rec.mimeType || 'audio/webm';
        const finalBlob = new Blob(audioChunksRef.current, { type: mime });
        stopStreams();
        onSendVoice(finalBlob, finalSecs);
      };

      try {
        rec.stop();
      } catch (e) {
        const mime = rec.mimeType || 'audio/webm';
        const finalBlob = new Blob(audioChunksRef.current, { type: mime });
        stopStreams();
        onSendVoice(finalBlob, finalSecs);
      }
    } else if (audioChunksRef.current.length > 0) {
      const finalBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      stopStreams();
      onSendVoice(finalBlob, finalSecs);
    } else {
      stopStreams();
      onCancel();
    }
  };

  const handleCancel = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {}
    }
    stopStreams();
    onCancel();
  };

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins}:${s < 10 ? '0' : ''}${s}`;
  };

  if (errorMsg) {
    return (
      <div className="flex items-center justify-between p-2.5 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-xs w-full gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span className="truncate">{errorMsg}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={startRecording}
            className="px-2.5 py-1 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Retry</span>
          </button>
          <button
            onClick={handleCancel}
            className="px-2.5 py-1 bg-white border border-rose-300 text-rose-700 hover:bg-rose-100 rounded-xl text-xs font-bold shrink-0 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 w-full bg-slate-900 text-white px-3 sm:px-4 py-2 rounded-2xl shadow-lg border border-slate-800 animate-in slide-in-from-bottom-2 duration-150">
      {/* Delete / Cancel Button */}
      <button
        type="button"
        onClick={handleCancel}
        disabled={isSubmitting}
        className="p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 disabled:opacity-50 rounded-xl transition-colors cursor-pointer shrink-0"
        title="Cancel Voice Recording"
      >
        <Trash2 className="w-5 h-5" />
      </button>

      {/* Pulsing Mic & Live Duration */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
        <span className="font-mono text-sm font-bold text-rose-400">
          {formatSeconds(recordingSeconds)}
        </span>
      </div>

      {/* Dynamic Animated Waveform */}
      <div className="flex-1 flex items-center justify-center gap-1 h-8 max-w-[200px] overflow-hidden px-2">
        {waveformLevels.map((lvl, idx) => (
          <div
            key={idx}
            className="w-1 bg-gradient-to-t from-rose-500 to-amber-400 rounded-full transition-all duration-75"
            style={{ height: `${Math.max(15, lvl)}%` }}
          />
        ))}
      </div>

      {/* Send Voice Note Button */}
      <button
        type="button"
        onClick={handleStopAndSend}
        disabled={isSubmitting}
        className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition-all cursor-pointer select-none shrink-0"
        title="Send Voice Message"
      >
        {isSubmitting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Send className="w-4 h-4" />
        )}
        <span className="hidden sm:inline">
          {isSubmitting ? 'Sending...' : 'Send Voice'}
        </span>
      </button>
    </div>
  );
};
