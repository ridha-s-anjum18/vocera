import React, { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import {
  Mic, MicOff, RotateCcw, CheckCircle2,
  Volume2, Loader2, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  getSession, saveSession, apiUploadRecording, apiGetSessionRecordings,
} from "@/services/api";
import { VOICE_PHRASES, RECORDING_DURATION_SECONDS, COUNTDOWN_SECONDS } from "@/lib/phrases";
import type { SessionInfo } from "@/types/types";

type Phase = "loading" | "consent" | "idle" | "countdown" | "recording" | "review" | "uploading" | "done";

const TOTAL = VOICE_PHRASES.length;

function makeSessionId(): string {
  return crypto.randomUUID();
}

const VoiceRecorderPage: React.FC = () => {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [currentIdx, setCurrentIdx] = useState(0);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [consentChecked, setConsentChecked] = useState(false);
  const [speakerName, setSpeakerName] = useState("");

  const [countdownVal, setCountdownVal] = useState(COUNTDOWN_SECONDS);
  const [timerVal, setTimerVal] = useState(RECORDING_DURATION_SECONDS);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Bootstrap session ───────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      let s = getSession();

      if (!s) {
        s = { id: makeSessionId(), consentedAt: null, savedPhraseIds: [], speakerName: null };
        saveSession(s);
      }

      setSession(s);
      setSpeakerName(s.speakerName ?? "");

      // Reconcile with server-side saves
      try {
        const recs = await apiGetSessionRecordings(s.id);
        const serverIds = new Set(recs.map((r) => r.phrase_id));
        // Merge local + server
        const merged = new Set([...s.savedPhraseIds, ...serverIds]);
        const updatedSession: SessionInfo = { ...s, savedPhraseIds: [...merged], speakerName: s.speakerName ?? null };
        saveSession(updatedSession);
        setSession(updatedSession);
        setSavedIds(merged);

        if (!s.consentedAt) {
          setPhase("consent");
          return;
        }
        const firstUnsaved = VOICE_PHRASES.findIndex((p) => !merged.has(p.id));
        if (firstUnsaved === -1) { setPhase("done"); return; }
        setCurrentIdx(firstUnsaved);
        setPhase("idle");
      } catch {
        // Offline/error — use local state
        const local = new Set<number>(s.savedPhraseIds);
        setSavedIds(local);
        if (!s.consentedAt) { setPhase("consent"); return; }
        const firstUnsaved = VOICE_PHRASES.findIndex((p) => !local.has(p.id));
        if (firstUnsaved === -1) { setPhase("done"); return; }
        setCurrentIdx(firstUnsaved);
        setPhase("idle");
      }
    };
    init();
  }, []);

  const handleConsent = () => {
    if (!consentChecked || !session) return;
    const trimmedName = speakerName.trim();
    if (!trimmedName) {
      toast.error("Please enter your name before continuing.");
      return;
    }
    const updated: SessionInfo = { ...session, consentedAt: new Date().toISOString(), speakerName: trimmedName };
    saveSession(updated);
    setSession(updated);
    setPhase("idle");
  };

  // ── Recording flow ──────────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg";
      const mr = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mr;
      chunksRef.current = [];

      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setRecordedBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        setPhase("review");
      };

      mr.start();
      setTimerVal(RECORDING_DURATION_SECONDS);
      setPhase("recording");

      let t = RECORDING_DURATION_SECONDS;
      const tick = () => {
        t -= 1;
        setTimerVal(t);
        if (t > 0) { timerRef.current = setTimeout(tick, 1000); }
        else { stopRecording(); }
      };
      timerRef.current = setTimeout(tick, 1000);
    } catch {
      toast.error("Microphone access denied — please allow mic access and try again.");
      setPhase("idle");
    }
  }, [stopRecording]);

  const startCountdown = useCallback(() => {
    setCountdownVal(COUNTDOWN_SECONDS);
    setPhase("countdown");
    let remaining = COUNTDOWN_SECONDS;
    const tick = () => {
      remaining -= 1;
      setCountdownVal(remaining);
      if (remaining > 0) { timerRef.current = setTimeout(tick, 1000); }
      else { startRecording(); }
    };
    timerRef.current = setTimeout(tick, 1000);
  }, [startRecording]);

  const handleReRecord = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setRecordedBlob(null);
    setPhase("idle");
  }, [audioUrl]);

  const handleSave = useCallback(async () => {
    if (!recordedBlob || !session) return;
    setPhase("uploading");
    const elapsed = RECORDING_DURATION_SECONDS - timerVal;
    try {
      await apiUploadRecording(recordedBlob, VOICE_PHRASES[currentIdx], elapsed, session.id, session.speakerName ?? speakerName);
      if (audioUrl) URL.revokeObjectURL(audioUrl);

      const newSaved = new Set(savedIds).add(VOICE_PHRASES[currentIdx].id);
      setSavedIds(newSaved);

      const updatedSession: SessionInfo = { ...session, savedPhraseIds: [...newSaved], speakerName: session.speakerName ?? (speakerName ? speakerName.trim() : null) };
      saveSession(updatedSession);
      setSession(updatedSession);

      toast.success(`Phrase ${currentIdx + 1} saved!`);

      const nextIdx = VOICE_PHRASES.findIndex((p) => !newSaved.has(p.id));
      if (nextIdx === -1) { setPhase("done"); return; }
      setCurrentIdx(nextIdx);
      setRecordedBlob(null);
      setAudioUrl(null);
      setPhase("idle");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
      setPhase("review");
    }
  }, [recordedBlob, session, currentIdx, savedIds, audioUrl, timerVal]);

  // ── SVG ring ────────────────────────────────────────────────────────────
  const R = 52;
  const CIRC = 2 * Math.PI * R;
  const ringFill = phase === "recording"
    ? ((RECORDING_DURATION_SECONDS - timerVal) / RECORDING_DURATION_SECONDS) * CIRC
    : 0;

  // ── Loading ─────────────────────────────────────────────────────────────
  if (phase === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Consent ─────────────────────────────────────────────────────────────
  if (phase === "consent") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-16 bg-background">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="w-full max-w-md"
        >
          {/* Logo */}
          <div className="flex items-center gap-2 mb-12">
            <Mic className="w-5 h-5 text-primary" />
            <span className="font-semibold tracking-tight">Vocera</span>
          </div>

          <h1 className="text-2xl font-semibold mb-2 text-balance">Before we begin</h1>
          <p className="text-sm text-muted-foreground mb-8 text-pretty leading-relaxed">
            We need your consent to record and use your voice samples for
            identity-verification model training.
          </p>

          <div className="mb-6 space-y-2">
            <label className="text-sm font-medium" htmlFor="speaker-name">Your name</label>
            <Input
              id="speaker-name"
              placeholder="Enter your name"
              value={speakerName}
              onChange={(e) => setSpeakerName(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              This name will be saved with your voice samples so the app can recognize who owns each recording.
            </p>
          </div>

          <div className="border border-border rounded-md p-5 bg-secondary mb-6 space-y-3">
            <p className="text-sm text-foreground leading-relaxed text-pretty">
              Your recordings will be stored securely and used solely to train machine-learning
              models for voice-based identity verification. Your data will not be shared with
              third parties.
            </p>
            <p className="text-xs text-muted-foreground">
              No account required — you'll be identified by an anonymous session ID stored in
              your browser.
            </p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer mb-8 group">
            <Checkbox
              checked={consentChecked}
              onCheckedChange={(v) => setConsentChecked(v === true)}
              className="mt-0.5 shrink-0"
            />
            <span className="text-sm text-foreground leading-relaxed select-none">
              I agree my voice will be recorded and used to train an
              identity-verification model.
            </span>
          </label>

          <Button onClick={handleConsent} disabled={!consentChecked || !speakerName.trim()} className="w-full">
            I agree — continue
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </motion.div>
      </div>
    );
  }

  // ── Done ────────────────────────────────────────────────────────────────
  if (phase === "done") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16 bg-background">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="text-center max-w-sm"
        >
          <CheckCircle2 className="w-12 h-12 text-primary mx-auto mb-6" />
          <h1 className="text-2xl font-semibold mb-3 text-balance">All {TOTAL} phrases recorded!</h1>
          <p className="text-sm text-muted-foreground mb-10 text-pretty leading-relaxed">
            Thank you for contributing your voice samples. Your recordings have been saved
            and will be used to train the identity-verification model.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setSavedIds(new Set());
              setCurrentIdx(0);
              setPhase("idle");
            }}
          >
            Record again
          </Button>
        </motion.div>
      </div>
    );
  }

  // ── Main recorder UI ────────────────────────────────────────────────────
  const currentPhrase = VOICE_PHRASES[currentIdx];
  const progress = savedIds.size;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Minimal header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Mic className="w-4 h-4 text-primary" />
          <span className="font-semibold tracking-tight text-sm">Vocera</span>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {progress}/{TOTAL} recorded
        </span>
      </header>

      {/* Progress strip */}
      <div className="px-6 pt-5 max-w-lg mx-auto w-full">
        <div className="flex gap-1.5">
          {VOICE_PHRASES.map((p, i) => (
            <div
              key={p.id}
              className={`flex-1 h-1 rounded-full transition-all duration-500 ${
                savedIds.has(p.id)
                  ? "bg-primary"
                  : i === currentIdx
                  ? "bg-primary/30"
                  : "bg-muted"
              }`}
            />
          ))}
        </div>
      </div>

      <Separator className="mt-5" />

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 max-w-lg mx-auto w-full">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${phase}-${currentIdx}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="w-full flex flex-col items-center gap-10"
          >
            {/* Phrase */}
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-widest mb-3 font-medium">
                Phrase {currentIdx + 1} of {TOTAL}
              </p>
              <p className="text-xl md:text-2xl font-semibold text-foreground text-balance leading-snug max-w-sm mx-auto">
                "{currentPhrase.text}"
              </p>
              <p className="text-xs text-muted-foreground mt-3">
                Read this phrase clearly when recording starts
              </p>
            </div>

            {/* Countdown / ring */}
            {(phase === "countdown" || phase === "recording") && (
              <div className="relative flex items-center justify-center w-32 h-32">
                <svg width="128" height="128" className="-rotate-90 absolute inset-0">
                  <circle cx="64" cy="64" r={R} fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
                  {phase === "recording" && (
                    <circle
                      cx="64" cy="64" r={R}
                      fill="none"
                      stroke="hsl(var(--primary))"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={CIRC}
                      strokeDashoffset={CIRC - ringFill}
                      style={{ transition: "stroke-dashoffset 0.9s linear" }}
                    />
                  )}
                </svg>
                <div className="flex flex-col items-center z-10">
                  {phase === "countdown" ? (
                    <>
                      <motion.span
                        key={countdownVal}
                        initial={{ scale: 1.3, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.25 }}
                        className="text-4xl font-bold tabular-nums"
                      >
                        {countdownVal}
                      </motion.span>
                      <span className="text-xs text-muted-foreground mt-0.5">get ready</span>
                    </>
                  ) : (
                    <>
                      <motion.span
                        key={timerVal}
                        initial={{ scale: 1.1, opacity: 0.7 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.2 }}
                        className="text-4xl font-bold tabular-nums text-primary"
                      >
                        {timerVal}
                      </motion.span>
                      <span className="text-xs text-muted-foreground mt-0.5">seconds left</span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Idle — tap to record */}
            {phase === "idle" && (
              <div className="flex flex-col items-center gap-4">
                <button
                  type="button"
                  onClick={startCountdown}
                  className="w-20 h-20 rounded-full border border-border flex items-center justify-center hover:border-primary hover:bg-primary/5 transition-colors group"
                >
                  <Mic className="w-7 h-7 text-muted-foreground group-hover:text-primary transition-colors" />
                </button>
                <p className="text-xs text-muted-foreground">Tap to start recording</p>
              </div>
            )}

            {/* Recording — animated mic */}
            {phase === "recording" && (
              <div className="flex flex-col items-center gap-4">
                <button
                  type="button"
                  onClick={stopRecording}
                  className="w-20 h-20 rounded-full bg-primary/8 border border-primary/20 flex items-center justify-center hover:bg-primary/15 transition-colors"
                >
                  <motion.div
                    animate={{ scale: [1, 1.12, 1] }}
                    transition={{ repeat: Infinity, duration: 1.1, ease: "easeInOut" }}
                  >
                    <MicOff className="w-7 h-7 text-primary" />
                  </motion.div>
                </button>
                <p className="text-xs text-primary font-medium tracking-wide">
                  Recording — tap to stop early
                </p>
              </div>
            )}

            {/* Review */}
            {(phase === "review" || phase === "uploading") && audioUrl && (
              <div className="w-full space-y-4">
                <div className="flex items-center gap-3 px-4 py-3 border border-border rounded-md">
                  <Volume2 className="w-4 h-4 text-muted-foreground shrink-0" />
                  <audio src={audioUrl} controls className="flex-1 min-w-0 h-8" />
                </div>
                <p className="text-xs text-center text-muted-foreground">
                  Listen to your recording, then save or re-record
                </p>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleReRecord}
                    disabled={phase === "uploading"}
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                    Re-record
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleSave}
                    disabled={phase === "uploading"}
                  >
                    {phase === "uploading" ? (
                      <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving…</>
                    ) : (
                      <><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />Save</>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Phrase list */}
            <div className="w-full">
              <Separator className="mb-4" />
              <div className="space-y-0.5">
                {VOICE_PHRASES.map((p, i) => (
                  <div
                    key={p.id}
                    className={`flex items-center gap-3 px-3 py-2 rounded text-xs transition-colors ${
                      i === currentIdx ? "bg-secondary text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    <span className="font-mono w-4 shrink-0 text-center">{i + 1}</span>
                    <span className="flex-1 min-w-0 truncate">{p.text}</span>
                    {savedIds.has(p.id) && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default VoiceRecorderPage;
