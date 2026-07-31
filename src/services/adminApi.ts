import { supabase } from "@/lib/supabase";
import type { Recording } from "@/types/types";

const RECORDINGS_BUCKET = "recordings";

export interface SessionSummary {
  session_id: string;
  speaker_name?: string | null;
  recording_count: number;
  first_recorded_at: string;
  last_recorded_at: string;
}

// ── Auth (admin only — customers never sign in) ─────────────────────────

export async function adminSignIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function adminSignOut() {
  await supabase.auth.signOut();
}

export async function getAdminSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// ── Data ─────────────────────────────────────────────────────────────────

export async function apiAdminListSessions(): Promise<SessionSummary[]> {
  const { data, error } = await supabase
    .from("recordings")
    .select("session_id, speaker_name, created_at")
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const bySession = new Map<string, { count: number; first: string; last: string; speakerName: string | null }>();
  for (const row of data ?? []) {
    const existing = bySession.get(row.session_id);
    if (!existing) {
      bySession.set(row.session_id, {
        count: 1,
        first: row.created_at,
        last: row.created_at,
        speakerName: row.speaker_name ?? null,
      });
    } else {
      existing.count += 1;
      existing.last = row.created_at;
      if (!existing.speakerName && row.speaker_name) {
        existing.speakerName = row.speaker_name;
      }
    }
  }

  return Array.from(bySession.entries()).map(([session_id, v]) => ({
    session_id,
    speaker_name: v.speakerName,
    recording_count: v.count,
    first_recorded_at: v.first,
    last_recorded_at: v.last,
  }));
}

export async function apiAdminGetSessionRecordings(
  sessionId: string
): Promise<Recording[]> {
  const { data, error } = await supabase
    .from("recordings")
    .select("*")
    .eq("session_id", sessionId)
    .order("phrase_id", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as Recording[];
}

export async function apiAdminGetAudioUrl(filePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(RECORDINGS_BUCKET)
    .createSignedUrl(filePath, 60 * 10); // 10 minutes

  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function apiAdminDeleteRecording(recording: Recording): Promise<void> {
  const { error: storageError } = await supabase.storage
    .from(RECORDINGS_BUCKET)
    .remove([recording.file_path]);
  if (storageError) throw new Error(storageError.message);

  const { error: dbError } = await supabase
    .from("recordings")
    .delete()
    .eq("id", recording.id);
  if (dbError) throw new Error(dbError.message);
}

/**
 * Downloads every recording for a session and zips them client-side.
 * Uses the dynamically-imported `jszip` package so it's not in the main bundle.
 */
export async function apiAdminDownloadSessionZip(
  sessionId: string,
  recordings: Recording[]
): Promise<void> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  for (const rec of recordings) {
    const { data, error } = await supabase.storage
      .from(RECORDINGS_BUCKET)
      .download(rec.file_path);
    if (error) throw new Error(error.message);
    const ext = rec.file_path.split(".").pop() ?? "webm";
    zip.file(`phrase-${rec.phrase_id}-${rec.id}.${ext}`, data);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vocera-${sessionId}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
