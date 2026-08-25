import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, Loader2 } from 'lucide-react';

interface VoicePlayerProps {
  audioUrl: string;
  duration?: number;
  isSelf?: boolean;
}

export const VoicePlayer: React.FC<VoicePlayerProps> = ({ audioUrl, duration = 0, isSelf = false }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setTotalDuration(Math.round(audio.duration));
      }
      setIsLoading(false);
    };

    const onTimeUpdate = () => {
      setCurrentTime(Math.round(audio.currentTime));
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const onError = () => {
      setIsLoading(false);
      setIsPlaying(false);
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      setIsLoading(true);
      audioRef.current
        .play()
        .then(() => {
          setIsLoading(false);
          setIsPlaying(true);
        })
        .catch((err) => {
          console.warn('Playback error:', err);
          setIsLoading(false);
          setIsPlaying(false);
        });
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const progressPercent = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  return (
    <div className={`flex items-center gap-3 p-2.5 rounded-2xl max-w-[280px] select-none ${
      isSelf ? 'bg-emerald-700/20 text-emerald-950' : 'bg-slate-100 text-slate-800'
    }`}>
      {/* Play / Pause Circular Button */}
      <button
        type="button"
        onClick={togglePlay}
        disabled={isLoading}
        className={`w-10 h-10 rounded-full flex items-center justify-center shadow-sm shrink-0 transition-transform active:scale-95 cursor-pointer ${
          isSelf 
            ? 'bg-emerald-600 hover:bg-emerald-500 text-white' 
            : 'bg-blue-600 hover:bg-blue-500 text-white'
        }`}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : isPlaying ? (
          <Pause className="w-4 h-4" />
        ) : (
          <Play className="w-4 h-4 translate-x-0.5" />
        )}
      </button>

      {/* Waveform Visualization Bars */}
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-0.5 h-6">
          {[30, 60, 45, 90, 70, 40, 85, 60, 35, 75, 50, 95, 40, 65, 80, 50].map((h, i) => {
            const barProgress = (i / 16) * 100;
            const isPassed = progressPercent >= barProgress;
            return (
              <div
                key={i}
                className={`w-1 rounded-full transition-colors ${
                  isPassed 
                    ? (isSelf ? 'bg-emerald-600' : 'bg-blue-600') 
                    : (isSelf ? 'bg-emerald-300/60' : 'bg-slate-300')
                }`}
                style={{ height: `${h}%` }}
              />
            );
          })}
        </div>

        {/* Timers */}
        <div className="flex items-center justify-between text-[10px] font-mono opacity-75">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(totalDuration || duration)}</span>
        </div>
      </div>
    </div>
  );
};
