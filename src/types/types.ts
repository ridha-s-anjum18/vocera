// Vocera type definitions — no-auth version

export interface Recording {
  id: string;
  session_id: string;
  phrase_id: number;
  phrase_text: string;
  file_path: string;
  duration: number;
  created_at: string;
  speaker_name?: string | null;
}

export interface VoicePhrase {
  id: number;
  text: string;
}

// Lightweight browser session — no accounts
export interface SessionInfo {
  /** Random UUID generated on first visit */
  id: string;
  /** Consent accepted timestamp */
  consentedAt: string | null;
  /** Set of phrase IDs already saved */
  savedPhraseIds: number[];
  /** Name entered by the speaker */
  speakerName?: string | null;
}
