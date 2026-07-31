import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, LogOut, Mic, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatDate } from "@/lib/utils";
import { apiAdminListSessions, adminSignOut, type SessionSummary } from "@/services/adminApi";

const AdminSessionsPage: React.FC = () => {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    apiAdminListSessions()
      .then(setSessions)
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const handleSignOut = async () => {
    await adminSignOut();
    navigate("/login/admin");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Mic className="w-4 h-4 text-primary" />
          <span className="font-semibold tracking-tight text-sm">Vocera Admin</span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleSignOut}>
          <LogOut className="w-3.5 h-3.5 mr-1.5" />
          Sign out
        </Button>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-lg font-semibold mb-1">Recording sessions</h1>
        <p className="text-xs text-muted-foreground mb-6">
          {sessions.length} session{sessions.length === 1 ? "" : "s"} with saved recordings
        </p>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-16">
            No recordings yet.
          </p>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            {sessions.map((s, i) => (
              <React.Fragment key={s.session_id}>
                {i > 0 && <Separator />}
                <button
                  onClick={() => navigate(`/admin/sessions/${s.session_id}`)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent transition-colors text-left"
                >
                  <div>
                    <p className="text-sm font-mono">{s.session_id.slice(0, 8)}…</p>
                    <p className="text-xs text-foreground">
                      {s.speaker_name ? `Speaker: ${s.speaker_name}` : "Speaker: unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      First recorded {formatDate(s.first_recorded_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {s.recording_count}/5 recorded
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </button>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminSessionsPage;
