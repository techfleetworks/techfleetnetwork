import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Video, Mic, Square, Trash2, Loader2, Camera, Monitor } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/services/logger.service";

const log = createLogger("MediaRecorder");

type MediaType = "video" | "audio";
type VideoSource = "camera" | "screen";

interface MediaRecorderProps {
  /** Called with the public URL after successful upload, or null when cleared */
  onMediaReady: (url: string | null, type: MediaType | null) => void;
  /** Maximum recording duration in seconds (default 300 = 5 min) */
  maxDuration?: number;
  /** Optional existing media URL for display */
  existingUrl?: string | null;
  /** Type of existing media */
  existingType?: MediaType | null;
}

export default function AnnouncementMediaRecorder({
  onMediaReady,
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

  const recorderRef = useRef<globalThis.MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    return () => {
      stopAllTracks();
      if (timerRef.current) clearInterval(timerRef.current);
      if (previewUrl && previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopAllTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startRecording = useCallback(async (type: MediaType) => {
    try {
      let stream: MediaStream;

      if (type === "audio") {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } else if (videoSource === "camera") {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
          audio: true,
        });
      } else {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: true,
        });
      }

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
        : "Could not start recording. Check your device permissions.";
      toast.error(msg);
      log.error("startRecording", msg, {}, err);
    }
  }, [videoSource, maxDuration, stopAllTracks]);

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

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Video className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">Media (optional — video or audio)</span>
      </div>

      {/* Mode selection — only when not recording and no preview */}
      {!recording && !hasPreview && (
        <div className="space-y-3">
          {/* Video options */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Video</p>
            <div className="flex items-center gap-2">
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
