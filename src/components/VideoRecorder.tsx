import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Video, Mic, Square, Trash2, Loader2, Camera, Monitor } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/services/logger.service";

const log = createLogger("MediaRecorder");

type MediaType = "video" | "audio";
type VideoSource = "camera" | "screen";

const MIC_PREF_KEY = "announcement-recorder:preferred-mic-id";

interface MediaRecorderProps {
  onMediaReady: (url: string | null, type: MediaType | null) => void;
  onBusyChange?: (busy: boolean) => void;
  maxDuration?: number;
  existingUrl?: string | null;
  existingType?: MediaType | null;
}

const buildAudioConstraints = (deviceId: string | null): MediaTrackConstraints => ({
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
});

export default function AnnouncementMediaRecorder({
  onMediaReady,
  onBusyChange,
  maxDuration = 300,
  existingUrl = null,
  existingType = null,
}: MediaRecorderProps) {
  const [mediaType, setMediaType] = useState<MediaType | null>(existingType);
  const [videoSource, setVideoSource] = useState<VideoSource>("camera");
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(existingUrl);
  const [previewType, setPreviewType] = useState<MediaType | null>(existingType);
  const [elapsed, setElapsed] = useState(0);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(MIC_PREF_KEY) ?? "";
  });

  const recorderRef = useRef<globalThis.MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceStreamsRef = useRef<MediaStream[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);

  const refreshAudioInputs = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter((d) => d.kind === "audioinput");
      setAudioInputs(mics);
      // Clear stored preference if device no longer exists
      setSelectedMicId((prev) => {
        if (!prev) return prev;
        return mics.some((m) => m.deviceId === prev) ? prev : "";
      });
    } catch (err) {
      log.error("refreshAudioInputs", "Failed to list audio inputs", {}, err);
    }
  }, []);

  useEffect(() => {
    refreshAudioInputs();
    const handler = () => refreshAudioInputs();
    navigator.mediaDevices?.addEventListener?.("devicechange", handler);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", handler);
    };
  }, [refreshAudioInputs]);

  useEffect(() => {
    return () => {
      stopAllTracks();
      if (timerRef.current) clearInterval(timerRef.current);
      if (previewUrl && previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onBusyChange?.(recording || uploading);
  }, [recording, uploading, onBusyChange]);

  const handleMicChange = useCallback((value: string) => {
    const next = value === "__default__" ? "" : value;
    setSelectedMicId(next);
    try {
      if (next) window.localStorage.setItem(MIC_PREF_KEY, next);
      else window.localStorage.removeItem(MIC_PREF_KEY);
    } catch {
      /* localStorage may be unavailable */
    }
  }, []);

  const stopAllTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    sourceStreamsRef.current.forEach((stream) => stream.getTracks().forEach((t) => t.stop()));
    sourceStreamsRef.current = [];
    streamRef.current = null;

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async (type: MediaType) => {
    try {
      const audioConstraints = buildAudioConstraints(selectedMicId || null);
      let stream: MediaStream;

      if (type === "audio") {
        stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
      } else if (videoSource === "camera") {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
          audio: audioConstraints,
        });
      } else {
        const micPromise = navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
          video: false,
        }).catch((micErr) => {
          log.error("startRecording", "Microphone unavailable for screen recording", {}, micErr);
          return null;
        });

        let displayStream: MediaStream;
        try {
          displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
            audio: true,
          });
        } catch (displayErr) {
          const pendingMicStream = await micPromise;
          pendingMicStream?.getTracks().forEach((track) => track.stop());
          throw displayErr;
        }

        const micStream = await micPromise;
        sourceStreamsRef.current = micStream ? [displayStream, micStream] : [displayStream];

        const videoTrack = displayStream.getVideoTracks()[0];
        const systemAudioTracks = displayStream.getAudioTracks();
        const micAudioTracks = micStream?.getAudioTracks() ?? [];
        const audioTracks: MediaStreamTrack[] = [];

        if (systemAudioTracks.length > 0 && micAudioTracks.length > 0) {
          const AudioContextCtor = window.AudioContext ?? (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

          if (AudioContextCtor) {
            const ctx = new AudioContextCtor();
            audioContextRef.current = ctx;
            const destination = ctx.createMediaStreamDestination();
            ctx.createMediaStreamSource(new MediaStream(systemAudioTracks)).connect(destination);
            ctx.createMediaStreamSource(new MediaStream(micAudioTracks)).connect(destination);
            audioTracks.push(...destination.stream.getAudioTracks());
          } else {
            audioTracks.push(micAudioTracks[0]);
          }
        } else if (micAudioTracks.length > 0) {
          audioTracks.push(micAudioTracks[0]);
        } else if (systemAudioTracks.length > 0) {
          audioTracks.push(systemAudioTracks[0]);
        }

        if (audioTracks.length === 0) {
          toast.warning("No microphone audio was captured. Allow microphone access to record voiceover.");
        }

        stream = new MediaStream([videoTrack, ...audioTracks]);
      }

      // Refresh device list now that permission is granted (labels become available)
      refreshAudioInputs();

      streamRef.current = stream;
      chunksRef.current = [];
      setMediaType(type);

      if (type === "video" && liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
        liveVideoRef.current.play().catch(() => {});
      }

      const mimeType = type === "audio"
        ? (globalThis.MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm")
        : (globalThis.MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm");

      const recorder = new globalThis.MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setPreviewType(type);
        uploadMedia(blob, type);
        stopAllTracks();
      };

      if (type === "video" && videoSource === "screen") {
        stream.getVideoTracks()[0].addEventListener("ended", () => {
          if (recorderRef.current?.state === "recording") {
            stopRecording();
          }
        });
      }

      recorder.start(1000);
      setRecording(true);
      setElapsed(0);

      timerRef.current = setInterval(() => {
        setElapsed((prev) => {
          if (prev + 1 >= maxDuration) {
            stopRecording();
            return prev + 1;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: any) {
      const msg = err?.name === "NotAllowedError"
        ? "Permission denied. Please allow device access."
        : err?.name === "NotFoundError"
          ? "Selected microphone not found. Try a different device."
          : err?.name === "NotReadableError"
            ? "Microphone is in use by another application."
            : "Could not start recording. Check your device permissions.";
      toast.error(msg);
      log.error("startRecording", msg, {}, err);
    }
  }, [videoSource, maxDuration, stopAllTracks, selectedMicId, refreshAudioInputs]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRecording(false);
    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = null;
    }
  }, []);

  const uploadMedia = useCallback(async (blob: Blob, type: MediaType) => {
    setUploading(true);
    try {
      const ext = type === "audio" ? "webm" : "webm";
      const contentType = type === "audio" ? "audio/webm" : "video/webm";
      const fileName = `${type}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("announcement-videos")
        .upload(fileName, blob, { contentType, upsert: false });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("announcement-videos")
        .getPublicUrl(fileName);

      onMediaReady(urlData.publicUrl, type);
      toast.success(`${type === "audio" ? "Audio" : "Video"} uploaded successfully!`);
    } catch (err: any) {
      toast.error("Failed to upload. Please try again.");
      log.error("uploadMedia", `Upload failed: ${err.message}`, {}, err);
      onMediaReady(null, null);
    } finally {
      setUploading(false);
    }
  }, [onMediaReady]);

  const clearMedia = useCallback(() => {
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewType(null);
    setMediaType(null);
    onMediaReady(null, null);
  }, [previewUrl, onMediaReady]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const hasPreview = !!previewUrl && !recording;
  const micSelectValue = selectedMicId || "__default__";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Video className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">Media (optional — video or audio)</span>
      </div>

      {/* Microphone picker — visible whenever no preview exists and not recording */}
      {!recording && !hasPreview && (
        <div className="space-y-1.5">
          <label htmlFor="mic-select" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Microphone
          </label>
          <Select value={micSelectValue} onValueChange={handleMicChange}>
            <SelectTrigger id="mic-select" className="h-9 text-sm" aria-label="Select microphone">
              <SelectValue placeholder="System default" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">System default</SelectItem>
              {audioInputs.map((device, idx) => (
                <SelectItem key={device.deviceId || idx} value={device.deviceId || `mic-${idx}`}>
                  {device.label || `Microphone ${idx + 1}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {audioInputs.every((d) => !d.label) && audioInputs.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Device names appear after granting microphone permission once.
            </p>
          )}
        </div>
      )}

      {/* Mode selection — only when not recording and no preview */}
      {!recording && !hasPreview && (
        <div className="space-y-3">
          {/* Video options */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Video</p>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                type="button"
                variant={videoSource === "camera" ? "default" : "outline"}
                size="sm"
                onClick={() => setVideoSource("camera")}
                className="gap-1.5"
              >
                <Camera className="h-3.5 w-3.5" />
                Camera
              </Button>
              <Button
                type="button"
                variant={videoSource === "screen" ? "default" : "outline"}
                size="sm"
                onClick={() => setVideoSource("screen")}
                className="gap-1.5"
              >
                <Monitor className="h-3.5 w-3.5" />
                Screen
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => startRecording("video")}
                className="gap-1.5"
              >
                <Video className="h-3.5 w-3.5 text-destructive" />
                Record Video
              </Button>
            </div>
          </div>

          {/* Audio option */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Audio</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => startRecording("audio")}
              className="gap-1.5"
            >
              <Mic className="h-3.5 w-3.5 text-destructive" />
              Record Audio
            </Button>
          </div>
        </div>
      )}

      {/* Live preview during video recording */}
      {recording && mediaType === "video" && (
        <div className="relative rounded-lg overflow-hidden border border-destructive bg-black">
          <video
            ref={liveVideoRef}
            muted
            playsInline
            className="w-full aspect-video object-cover"
            aria-label="Live recording preview"
          />
          <div className="absolute top-3 left-3 flex items-center gap-2 bg-destructive/90 text-destructive-foreground px-2.5 py-1 rounded-md text-xs font-semibold">
            <span className="h-2 w-2 rounded-full bg-destructive-foreground animate-pulse" />
            REC {formatTime(elapsed)} / {formatTime(maxDuration)}
          </div>
        </div>
      )}

      {/* Live indicator during audio recording */}
      {recording && mediaType === "audio" && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive bg-muted/50 p-4">
          <div className="flex items-center gap-2 bg-destructive/90 text-destructive-foreground px-2.5 py-1 rounded-md text-xs font-semibold">
            <span className="h-2 w-2 rounded-full bg-destructive-foreground animate-pulse" />
            REC
          </div>
          <Mic className="h-5 w-5 text-destructive" />
          <span className="text-sm font-medium text-foreground">{formatTime(elapsed)} / {formatTime(maxDuration)}</span>
        </div>
      )}

      {/* Video preview */}
      {hasPreview && previewType === "video" && (
        <div className="relative rounded-lg overflow-hidden border border-border bg-black">
          <video
            src={previewUrl!}
            controls
            playsInline
            className="w-full aspect-video"
            aria-label="Recorded video preview"
          />
          {uploading && (
            <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Uploading…
              </div>
            </div>
          )}
        </div>
      )}

      {/* Audio preview */}
      {hasPreview && previewType === "audio" && (
        <div className="relative rounded-lg border border-border bg-muted/30 p-4">
          <div className="flex items-center gap-3">
            <Mic className="h-5 w-5 text-primary shrink-0" />
            <audio
              src={previewUrl!}
              controls
              className="w-full h-10"
              aria-label="Recorded audio preview"
            />
          </div>
          {uploading && (
            <div className="absolute inset-0 rounded-lg bg-background/70 flex items-center justify-center">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Uploading…
              </div>
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-2">
        {recording && (
          <Button type="button" variant="destructive" size="sm" onClick={stopRecording} className="gap-1.5">
            <Square className="h-3.5 w-3.5" />
            Stop Recording
          </Button>
        )}
        {hasPreview && !uploading && (
          <Button type="button" variant="ghost" size="sm" onClick={clearMedia} className="gap-1.5 text-destructive hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
            Remove {previewType === "audio" ? "Audio" : "Video"}
          </Button>
        )}
      </div>
    </div>
  );
}
