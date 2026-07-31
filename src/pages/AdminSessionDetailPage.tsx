import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { ArrowLeft, Download, Loader2, Trash2, Mic } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatDate } from "@/lib/utils";
import useGoBack from "@/hooks/use-go-back";
import type { Recording } from "@/types/types";
import {
  apiAdminGetSessionRecordings,
  apiAdminGetAudioUrl,
  apiAdminDeleteRecording,
  apiAdminDownloadSessionZip,
} from "@/services/adminApi";

const AdminSessionDetailPage: React.FC = () => {
  const { sessionId = "" } = useParams();
  const goBack = useGoBack();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const recs = await apiAdminGetSessionRecordings(sessionId);
      setRecordings(recs);
      const urls = await Promise.all(
        recs.map(async (r) => {
          try {
            return [r.id, await apiAdminGetAudioUrl(r.file_path)] as const;
          } catch {
            return [r.id, ""] as const;
          }
        })
      );
      setAudioUrls(Object.fromEntries(urls));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);


  const handleDelete = async (rec: Recording) => {
    if (!window.confirm(`Delete recording for phrase ${rec.phrase_id}? This can't be undone.`)) return;
    setBusyId(rec.id);
    try {
      await apiAdminDeleteRecording(rec);
      setRecordings((prev) => prev.filter((r) => r.id !== rec.id));
      toast.success("Recording deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleDownloadAll = async () => {
    setZipping(true);
    try {
      await apiAdminDownloadSessionZip(sessionId, recordings);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <button onClick={goBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex items-center gap-2">
          <Mic className="w-4 h-4 text-primary" />
          <span className="font-semibold tracking-tight text-sm">Vocera Admin</span>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold font-mono">{sessionId}</h1>
            <p className="text-xs text-foreground mt-1">
              {recordings[0]?.speaker_name ? `Speaker: ${recordings[0].speaker_name}` : "Speaker: unknown"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {recordings.length} recording{recordings.length === 1 ? "" : "s"}
            </p>
          </div>
          <Button size="sm" onClick={handleDownloadAll} disabled={zipping || recordings.length === 0}>
            {zipping ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
            Download all (.zip)
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            {recordings.map((rec, i) => (
              <React.Fragment key={rec.id}>
                {i > 0 && <Separator />}
                <div className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">
                        Phrase {rec.phrase_id}
                      </p>
                      <p className="text-sm font-medium truncate">{rec.phrase_text}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {rec.duration}s · {formatDate(rec.created_at)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={busyId === rec.id}
                      onClick={() => handleDelete(rec)}
                    >
                      {busyId === rec.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4 text-destructive" />
                      )}
                    </Button>
                  </div>
                  <audio
                    controls
                    className="w-full h-8"
                    src={audioUrls[rec.id]}
                    preload="none"
                  />
                </div>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminSessionDetailPage;
