import { useEffect, useRef, useState } from "react";

export type HighscoreEntry = {
  id: number;
  name: string;
  score: number;
  createdAt: string;
};

type Props = {
  score: number;
  onPlayAgain: () => void;
};

export function HighscoreOverlay({ score, onPlayAgain }: Props) {
  const [list, setList] = useState<HighscoreEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newEntryId, setNewEntryId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/highscores")
      .then((r) => r.json())
      .then((data: HighscoreEntry[]) => {
        setList(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Could not load highscores.");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!loading && qualifies && inputRef.current) {
      inputRef.current.focus();
    }
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const qualifies =
    !loading &&
    !error &&
    score > 0 &&
    (list.length < 10 || score > (list[list.length - 1]?.score ?? 0));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/highscores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, score }),
      });
      const entry: HighscoreEntry = await res.json();
      setNewEntryId(entry.id);
      // Refresh list to show updated ranking
      const updated: HighscoreEntry[] = await fetch("/api/highscores").then(
        (r) => r.json()
      );
      setList(updated);
    } catch {
      setError("Could not save your score.");
    } finally {
      setSubmitting(false);
    }
  }

  const submitted = newEntryId !== null;

  return (
    <div style={styles.backdrop}>
      <div style={styles.card}>
        <h1 style={styles.title}>GAME OVER</h1>
        <p style={styles.scoreLabel}>YOUR SCORE</p>
        <p style={styles.scoreValue}>{score.toLocaleString()}</p>

        <h2 style={styles.sectionTitle}>TOP 10</h2>

        {loading && <p style={styles.dim}>Loading…</p>}
        {error && <p style={styles.errorText}>{error}</p>}

        {!loading && !error && (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>#</th>
                <th style={{ ...styles.th, textAlign: "left" }}>NAME</th>
                <th style={{ ...styles.th, textAlign: "right" }}>SCORE</th>
              </tr>
            </thead>
            <tbody>
              {list.map((entry, i) => {
                const isNew = entry.id === newEntryId;
                return (
                  <tr key={entry.id} style={isNew ? styles.newRow : undefined}>
                    <td style={styles.tdRank}>{i + 1}</td>
                    <td style={styles.td}>{entry.name}</td>
                    <td style={{ ...styles.td, textAlign: "right" }}>
                      {entry.score.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
              {list.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ ...styles.td, textAlign: "center" }}>
                    No scores yet — be the first!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {qualifies && !submitted && (
          <form
            onSubmit={handleSubmit}
            onKeyDown={(e) => e.stopPropagation()}
            style={styles.form}
          >
            <p style={styles.qualifyMsg}>
              🏆 You made the top 10! Enter your name:
            </p>
            <div style={styles.formRow}>
              <input
                ref={inputRef}
                style={styles.input}
                type="text"
                maxLength={32}
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={submitting}
              />
              <button
                style={submitting ? styles.btnDisabled : styles.btn}
                type="submit"
                disabled={submitting || name.trim().length === 0}
              >
                {submitting ? "Saving…" : "Submit"}
              </button>
            </div>
          </form>
        )}

        <button style={styles.playAgain} onClick={onPlayAgain}>
          ▶ PLAY AGAIN
        </button>
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: "fixed" as const,
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    background: "rgba(0,0,0,0.55)",
  },
  card: {
    background: "#111",
    border: "2px solid #333",
    borderRadius: 12,
    padding: "28px 36px",
    minWidth: 320,
    maxWidth: 420,
    width: "90vw",
    maxHeight: "90vh",
    overflowY: "auto" as const,
    textAlign: "center" as const,
    fontFamily: "'Arial Black', Arial, sans-serif",
    color: "#fff",
    boxShadow: "0 8px 40px rgba(0,0,0,0.8)",
  },
  title: {
    fontSize: 42,
    color: "#ff5555",
    margin: "0 0 4px",
    letterSpacing: 4,
    textShadow: "0 0 16px #ff2222",
  },
  scoreLabel: {
    fontSize: 11,
    color: "#888",
    letterSpacing: 2,
    margin: "12px 0 2px",
  },
  scoreValue: {
    fontSize: 32,
    color: "#ffd54f",
    margin: "0 0 18px",
    textShadow: "0 0 10px #ff9800",
  },
  sectionTitle: {
    fontSize: 13,
    color: "#aaa",
    letterSpacing: 3,
    margin: "0 0 8px",
    borderTop: "1px solid #333",
    paddingTop: 14,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 14,
    marginBottom: 16,
  },
  th: {
    color: "#666",
    fontWeight: "normal",
    fontSize: 11,
    letterSpacing: 1,
    paddingBottom: 6,
    borderBottom: "1px solid #2a2a2a",
    textAlign: "center" as const,
  },
  td: {
    padding: "5px 6px",
    color: "#ddd",
  },
  tdRank: {
    padding: "5px 6px",
    color: "#555",
    width: 28,
    textAlign: "center" as const,
  },
  newRow: {
    background: "rgba(255, 213, 79, 0.12)",
    color: "#ffd54f",
  },
  qualifyMsg: {
    fontSize: 13,
    color: "#ffd54f",
    margin: "4px 0 10px",
  },
  form: {
    marginBottom: 16,
  },
  formRow: {
    display: "flex",
    gap: 8,
  },
  input: {
    flex: 1,
    background: "#1a1a1a",
    border: "1px solid #444",
    borderRadius: 6,
    color: "#fff",
    padding: "8px 10px",
    fontSize: 14,
    fontFamily: "inherit",
    outline: "none",
  },
  btn: {
    background: "#ffd54f",
    color: "#111",
    border: "none",
    borderRadius: 6,
    padding: "8px 14px",
    fontSize: 13,
    fontFamily: "'Arial Black', Arial, sans-serif",
    cursor: "pointer",
    fontWeight: "bold",
  },
  btnDisabled: {
    background: "#555",
    color: "#888",
    border: "none",
    borderRadius: 6,
    padding: "8px 14px",
    fontSize: 13,
    fontFamily: "'Arial Black', Arial, sans-serif",
    cursor: "not-allowed",
    fontWeight: "bold",
  },
  playAgain: {
    marginTop: 8,
    background: "transparent",
    border: "2px solid #555",
    borderRadius: 8,
    color: "#ccc",
    fontSize: 15,
    fontFamily: "'Arial Black', Arial, sans-serif",
    padding: "10px 28px",
    cursor: "pointer",
    letterSpacing: 2,
    transition: "border-color 0.2s, color 0.2s",
  },
  dim: {
    color: "#555",
    fontSize: 13,
  },
  errorText: {
    color: "#ff5555",
    fontSize: 13,
  },
} as const;
