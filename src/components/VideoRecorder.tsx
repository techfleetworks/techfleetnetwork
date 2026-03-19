import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Video, Square, Trash2, Loader2, Camera, Monitor } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/services/logger.service";

const log = createLogger("VideoRecorder");

type SourceMode = "camera" | "screen";

interface VideoRecorderProps {
  /** Called with the public URL after successful upload, or null when cleared */
  onVideoReady: (url: string | null) => void;
  /** Maximum recording duration in seconds (default 300 = 5 min) */
  maxDuration?: number;
  /** Optional existing video URL for display */
  existingUrl?: string | null;
}

export default function VideoRecorder({
  onVideoReady,
  maxDuration = 300,
  existingUrl = null,
}: VideoRecorderProps) {
  const [sourceMode, setSourceMode] = useState<SourceMode>("camera");
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(existingUrl);
  const [elapsed, setElapsed] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);

  // Cleanup on unmount
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

  const startRecording = useCallback(async () => {
    try {
      let stream: MediaStream;
      if (sourceMode === "camera") {
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

      // Show live preview
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
        liveVideoRef.current.play().catch(() => {});
      }

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : "video/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        uploadVideo(blob);
        stopAllTracks();
      };

      // Auto-stop when screen share ends
      if (sourceMode === "screen") {
        stream.getVideoTracks()[0].addEventListener("ended", () => {
          if (mediaRecorderRef.current?.state === "recording") {
            stopRecording();
          }
        });
      }

      recorder.start(1000); // 1s chunks
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
        ? "Permission denied. Please allow camera/microphone access."
        : "Could not start recording. Check your device permissions.";
      toast.error(msg);
      log.error("startRecording", msg, {}, err);
    }
  }, [sourceMode, maxDuration, stopAllTracks]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
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

  const uploadVideo = useCallback(async (blob: Blob) => {
    setUploading(true);
    try {
      const fileName = `${crypto.randomUUID()}.webm`;
      const { error: uploadError } = await supabase.storage
        .from("announcement-videos")
        .upload(fileName, blob, { contentType: "video/webm", upsert: false });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("announcement-videos")
        .getPublicUrl(fileName);

      onVideoReady(urlData.publicUrl);
      toast.success("Video uploaded successfully!");
    } catch (err: any) {
      toast.error("Failed to upload video. Please try again.");
      log.error("uploadVideo", `Upload failed: ${err.message}`, {}, err);
      onVideoReady(null);
    } finally {
      setUploading(false);
    }
  }, [onVideoReady]);

  const clearVideo = useCallback(() => {
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    onVideoReady(null);
  }, [previewUrl, onVideoReady]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Video className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">Video (optional)</span>
      </div>

      {/* Source mode toggle */}
      {!recording && !previewUrl && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={sourceMode === "camera" ? "default" : "outline"}
            size="sm"
            onClick={() => setSourceMode("camera")}
            className="gap-1.5"
          >
            <Camera className="h-3.5 w-3.5" />
            Camera
          </Button>
          <Button
            type="button"
            variant={sourceMode === "screen" ? "default" : "outline"}
            size="sm"
            onClick={() => setSourceMode("screen")}
            className="gap-1.5"
          >
            <Monitor className="h-3.5 w-3.5" />
            Screen
          </Button>
        </div>
      )}

      {/* Live preview during recording */}
      {recording && (
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

      {/* Recorded preview */}
      {previewUrl && !recording && (
        <div className="relative rounded-lg overflow-hidden border border-border bg-black">
          <video
            ref={videoPreviewRef}
            src={previewUrl}
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

      {/* Controls */}
      <div className="flex items-center gap-2">
        {!recording && !previewUrl && (
          <Button type="button" variant="outline" size="sm" onClick={startRecording} className="gap-1.5">
            <Video className="h-3.5 w-3.5 text-destructive" />
            Start Recording
          </Button>
        )}
        {recording && (
          <Button type="button" variant="destructive" size="sm" onClick={stopRecording} className="gap-1.5">
            <Square className="h-3.5 w-3.5" />
            Stop Recording
          </Button>
        )}
        {previewUrl && !recording && !uploading && (
          <Button type="button" variant="ghost" size="sm" onClick={clearVideo} className="gap-1.5 text-destructive hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
            Remove Video
          </Button>
        )}
      </div>
    </div>
  );
}
