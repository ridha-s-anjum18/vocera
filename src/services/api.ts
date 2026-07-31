import { supabase } from "@/lib/supabase";
import type { Recording, SessionInfo, VoicePhrase } from "@/types/types";

const SESSION_KEY = "vocera_session";
const RECORDINGS_BUCKET = "recordings";

// ── Local session (no accounts — a random id lives in localStorage) ────────

export function getSession(): SessionInfo | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionInfo;
  } catch {
    return null;
  }
}

export function saveSession(session: SessionInfo): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

// ── Recordings ───────────────────────────────────────────────────────────

function extForMime(mimeType: string): string {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

export async function apiUploadRecording(
  blob: Blob,
  phrase: VoicePhrase,
  duration: number,
  sessionId: string,
  speakerName?: string | null
): Promise<Recording> {
  const ext = extForMime(blob.type);
  const filePath = `${sessionId}/${phrase.id}-${Date.now()}.${ext}`;
  const normalizedSpeakerName = speakerName?.trim() ? speakerName.trim() : null;

  const { error: uploadError } = await supabase.storage
    .from(RECORDINGS_BUCKET)
    .upload(filePath, blob, {
      contentType: blob.type || "audio/webm",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data, error: insertError } = await supabase
    .from("recordings")
    .insert({
      session_id: sessionId,
      phrase_id: phrase.id,
      phrase_text: phrase.text,
      file_path: filePath,
      duration,
      speaker_name: normalizedSpeakerName,
    })
    .select()
    .single();

  if (insertError) {
    // Roll back the uploaded file so we don't leave orphans
    await supabase.storage.from(RECORDINGS_BUCKET).remove([filePath]);
    throw new Error(insertError.message);
  }

  return data as Recording;
}

export async function apiGetSessionRecordings(
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
