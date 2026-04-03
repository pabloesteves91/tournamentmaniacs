import { useEffect, useMemo, useState } from "react";
import { computeStandings as computeStandingsLocal } from "./lib/engine/standings";
import { getDivisionStructure, getTournamentDivisions } from "./lib/engine/rules";
import {
  clearTournament,
  createTournament,
  exportBackupJson,
  exportPairings,
  exportStandings,
  generateNextRound,
  importBackupJson,
  loadTournament,
  registerPlayer,
  reportMatchResult,
  setPlayerDropped,
} from "./lib/services";
import type { Division, Match, MatchInput, Tournament, TournamentConfig, TournamentPreset } from "./lib/types";
import { formatPercent } from "./lib/utils";

const presetOptions: Array<{ value: TournamentPreset; label: string }> = [
  { value: "league_challenge", label: "League Challenge (Swiss only)" },
  { value: "league_cup", label: "League Cup" },
  { value: "tcg_single_day", label: "TCG Single Day" },
  { value: "tcg_2025_championship", label: "2025 Championship Format" },
];

const divisionOptions: Array<{ value: Division; label: string }> = [
  { value: "junior", label: "Junior" },
  { value: "senior", label: "Senior" },
  { value: "masters", label: "Masters" },
];

const download = (filename: string, content: Blob | string): void => {
  const blob = typeof content === "string" ? new Blob([content], { type: "text/plain;charset=utf-8" }) : content;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const defaultConfig: TournamentConfig = {
  name: "Maniacs Official",
  date: todayIso(),
  preset: "league_cup",
  matchFormat: "BO3",
  roundTimerMinutes: 50,
  divisionMode: "age",
  roundConfigMode: "auto",
  allowTopCut: true,
  manualSwissRounds: 5,
  manualTopCutSize: 8,
};

type MatchDraft = Record<string, MatchInput>;

export default function App() {
  const logoUrl = `${import.meta.env.BASE_URL}logo.png`;
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [setupConfig, setSetupConfig] = useState<TournamentConfig>(defaultConfig);
  const [playerName, setPlayerName] = useState("");
  const [playerDeckName, setPlayerDeckName] = useState("");
  const [playerIdInput, setPlayerIdInput] = useState("");
  const [playerDivision, setPlayerDivision] = useState<Division>("masters");
  const [activeDivision, setActiveDivision] = useState<Division>("masters");
  const [backupText, setBackupText] = useState("");
  const [matchDrafts, setMatchDrafts] = useState<MatchDraft>({});

  const refreshTournament = async () => {
    const loaded = await loadTournament();
    setTournament(loaded);
    if (loaded) {
      const divisions = getTournamentDivisions(loaded);
      if (!divisions.includes(activeDivision)) {
        setActiveDivision(divisions[0]);
      }
    }
  };

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        await refreshTournament();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Failed to load tournament");
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, []);

  const divisions = useMemo(() => {
    if (!tournament) {
      return ["masters"] as Division[];
    }

    return getTournamentDivisions(tournament);
  }, [tournament]);

  const standings = useMemo(() => {
    if (!tournament) {
      return [];
    }

    return computeStandingsLocal(tournament, activeDivision);
  }, [tournament, activeDivision]);

  const roundsByDivision = useMemo(() => {
    if (!tournament) {
      return [];
    }

    return tournament.rounds
      .filter((round) => round.division === activeDivision)
      .sort((a, b) => {
        if (a.number !== b.number) {
          return a.number - b.number;
        }

        if (a.phase === b.phase) {
          return 0;
        }

        return a.phase === "swiss" ? -1 : 1;
      });
  }, [tournament, activeDivision]);

  const currentRound = useMemo(() => {
    return [...roundsByDivision].reverse().find((round) => round.status === "pending") ?? null;
  }, [roundsByDivision]);

  const currentRoundMatches = useMemo(() => {
    if (!tournament || !currentRound) {
      return [] as Match[];
    }

    return tournament.matches
      .filter((match) => currentRound.matchIds.includes(match.id))
      .sort((a, b) => a.tableNumber - b.tableNumber);
  }, [tournament, currentRound]);

  const latestRoundForDivision = useMemo(() => {
    if (!roundsByDivision.length) {
      return null;
    }

    return roundsByDivision[roundsByDivision.length - 1];
  }, [roundsByDivision]);

  const setAppError = (cause: unknown) => {
    setError(cause instanceof Error ? cause.message : "Unknown error");
  };

  const onCreateTournament = async () => {
    try {
      setError(null);
      const created = await createTournament(setupConfig);
      setTournament(created);
      setActiveDivision(created.config.divisionMode === "single" ? "masters" : "masters");
    } catch (cause) {
      setAppError(cause);
    }
  };

  const onRegisterPlayer = async () => {
    if (!playerName.trim() || !playerDeckName.trim()) {
      setError("Player name and deck name are required");
      return;
    }

    try {
      setError(null);
      const updated = await registerPlayer({
        name: playerName,
        deckName: playerDeckName,
        division: playerDivision,
        playerId: playerIdInput,
      });
      setTournament(updated);
      setPlayerName("");
      setPlayerDeckName("");
      setPlayerIdInput("");
    } catch (cause) {
      setAppError(cause);
    }
  };

  const onGenerateNextRound = async () => {
    if (!tournament) {
      return;
    }

    try {
      setError(null);
      const updated = await generateNextRound(tournament.id);
      setTournament(updated);
    } catch (cause) {
      setAppError(cause);
    }
  };

  const onReportMatch = async (match: Match) => {
    if (!tournament) {
      return;
    }

    const draft = matchDrafts[match.id] ?? { outcome: "A_WIN" as const };

    try {
      setError(null);
      const updated = await reportMatchResult(match.id, draft);
      setTournament(updated);
      setMatchDrafts((previous) => {
        const next = { ...previous };
        delete next[match.id];
        return next;
      });
    } catch (cause) {
      setAppError(cause);
    }
  };

  const onToggleDropPlayer = async (playerId: string, dropped: boolean) => {
    if (!tournament) {
      return;
    }

    try {
      setError(null);
      const updated = await setPlayerDropped(playerId, dropped);
      setTournament(updated);
    } catch (cause) {
      setAppError(cause);
    }
  };

  const onClearTournament = async () => {
    const confirmed = window.confirm("Delete the active tournament?");
    if (!confirmed) {
      return;
    }

    try {
      setError(null);
      await clearTournament();
      setTournament(null);
      setMatchDrafts({});
    } catch (cause) {
      setAppError(cause);
    }
  };

  const onExportStandings = async (format: "csv" | "pdf") => {
    try {
      setError(null);
      const exported = await exportStandings(format, activeDivision);
      download(exported.filename, exported.content);
    } catch (cause) {
      setAppError(cause);
    }
  };

  const onExportPairings = async (format: "csv" | "pdf") => {
    if (!latestRoundForDivision) {
      setError("No rounds available to export");
      return;
    }

    try {
      setError(null);
      const exported = await exportPairings(latestRoundForDivision.id, format);
      download(exported.filename, exported.content);
    } catch (cause) {
      setAppError(cause);
    }
  };

  const onExportBackup = async () => {
    try {
      setError(null);
      const backup = await exportBackupJson();
      download("tournament-backup.json", backup);
    } catch (cause) {
      setAppError(cause);
    }
  };

  const onImportBackup = async () => {
    if (!backupText.trim()) {
      setError("Paste backup JSON first");
      return;
    }

    try {
      setError(null);
      const imported = await importBackupJson(backupText);
      setTournament(imported);
      setBackupText("");
    } catch (cause) {
      setAppError(cause);
    }
  };

  if (loading) {
    return <div className="shell">Loading…</div>;
  }

  if (!tournament) {
    return (
      <div className="shell">
        <header className="hero">
          <img src={logoUrl} alt="Maniacs" className="hero-logo" />
          <div>
            <h1>Maniacs Pokémon TCG Tracker</h1>
            <p>Official-style Swiss, Top Cut, pairings, standings, and exports.</p>
          </div>
        </header>

        <section className="panel">
          <h2>Start Tournament</h2>
          {error ? <p className="error">{error}</p> : null}

          <div className="grid two">
            <label>
              Event Name
              <input
                value={setupConfig.name}
                onChange={(event) => setSetupConfig((prev) => ({ ...prev, name: event.target.value }))}
              />
            </label>

            <label>
              Date
              <input
                type="date"
                value={setupConfig.date}
                onChange={(event) => setSetupConfig((prev) => ({ ...prev, date: event.target.value }))}
              />
            </label>

            <label>
              Preset
              <select
                value={setupConfig.preset}
                onChange={(event) =>
                  setSetupConfig((prev) => ({
                    ...prev,
                    preset: event.target.value as TournamentPreset,
                  }))
                }
              >
                {presetOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Match Format
              <select
                value={setupConfig.matchFormat}
                onChange={(event) =>
                  setSetupConfig((prev) => ({
                    ...prev,
                    matchFormat: event.target.value as TournamentConfig["matchFormat"],
                  }))
                }
              >
                <option value="BO1">Bo1</option>
                <option value="BO3">Bo3</option>
              </select>
            </label>

            <label>
              Round Timer (minutes)
              <input
                type="number"
                min={1}
                value={setupConfig.roundTimerMinutes}
                onChange={(event) =>
                  setSetupConfig((prev) => ({
                    ...prev,
                    roundTimerMinutes: Number(event.target.value),
                  }))
                }
              />
            </label>

            <label>
              Division Mode
              <select
                value={setupConfig.divisionMode}
                onChange={(event) =>
                  setSetupConfig((prev) => ({
                    ...prev,
                    divisionMode: event.target.value as TournamentConfig["divisionMode"],
                  }))
                }
              >
                <option value="age">Junior / Senior / Masters</option>
                <option value="single">Single open division</option>
              </select>
            </label>

            <label>
              Rounds/Cut Config
              <select
                value={setupConfig.roundConfigMode}
                onChange={(event) =>
                  setSetupConfig((prev) => ({
                    ...prev,
                    roundConfigMode: event.target.value as TournamentConfig["roundConfigMode"],
                  }))
                }
              >
                <option value="auto">Auto by official preset table</option>
                <option value="manual">Manual override</option>
              </select>
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={setupConfig.allowTopCut}
                onChange={(event) =>
                  setSetupConfig((prev) => ({
                    ...prev,
                    allowTopCut: event.target.checked,
                  }))
                }
              />
              Enable Top Cut
            </label>
          </div>

          {setupConfig.roundConfigMode === "manual" ? (
            <div className="grid two">
              <label>
                Swiss Rounds
                <input
                  type="number"
                  min={1}
                  value={setupConfig.manualSwissRounds ?? 5}
                  onChange={(event) =>
                    setSetupConfig((prev) => ({
                      ...prev,
                      manualSwissRounds: Number(event.target.value),
                    }))
                  }
                />
              </label>

              <label>
                Top Cut Size
                <input
                  type="number"
                  min={0}
                  value={setupConfig.manualTopCutSize ?? 8}
                  onChange={(event) =>
                    setSetupConfig((prev) => ({
                      ...prev,
                      manualTopCutSize: Number(event.target.value),
                    }))
                  }
                />
              </label>
            </div>
          ) : null}

          <button className="btn primary" onClick={onCreateTournament}>
            Create Tournament
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="shell">
      <header className="hero compact">
        <img src={logoUrl} alt="Maniacs" className="hero-logo" />
        <div>
          <h1>{tournament.config.name}</h1>
          <p>
            {tournament.config.date} • {tournament.config.matchFormat} • {tournament.status.toUpperCase()}
          </p>
        </div>
        <div className="hero-actions">
          <button className="btn" onClick={onGenerateNextRound}>
            Generate Next Round
          </button>
          <button className="btn danger" onClick={onClearTournament}>
            Delete Tournament
          </button>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}

      <section className="panel">
        <h2>Official Round/Cut Targets</h2>
        <div className="chips">
          {divisions.map((division) => {
            const structure = getDivisionStructure(tournament, division);
            const createdSwissRounds = tournament.rounds.filter(
              (round) => round.phase === "swiss" && round.division === division,
            ).length;

            return (
              <div key={division} className="chip">
                <strong>{division.toUpperCase()}</strong> Swiss {createdSwissRounds}/{structure.swissRounds} • Top Cut {structure.topCutSize}
                {structure.notes ? ` • ${structure.notes}` : ""}
              </div>
            );
          })}
        </div>
        <p className="muted">BYE rule active: odd player count gets BYE as match win points.</p>
      </section>

      <section className="panel">
        <h2>Player Registration</h2>
        <div className="grid three">
          <label>
            Player name
            <input value={playerName} onChange={(event) => setPlayerName(event.target.value)} />
          </label>
          <label>
            Deck name
            <input value={playerDeckName} onChange={(event) => setPlayerDeckName(event.target.value)} />
          </label>
          <label>
            Player ID (optional)
            <input value={playerIdInput} onChange={(event) => setPlayerIdInput(event.target.value)} />
          </label>
          {tournament.config.divisionMode === "age" ? (
            <label>
              Division
              <select value={playerDivision} onChange={(event) => setPlayerDivision(event.target.value as Division)}>
                {divisionOptions.map((division) => (
                  <option key={division.value} value={division.value}>
                    {division.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <button className="btn" onClick={onRegisterPlayer} disabled={tournament.rounds.length > 0}>
          Add Player
        </button>
        {tournament.rounds.length > 0 ? <p className="muted">Registration locks after round 1 starts.</p> : null}

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Deck</th>
                <th>Division</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tournament.players.map((player) => (
                <tr key={player.id}>
                  <td>{player.name}</td>
                  <td>{player.deckName}</td>
                  <td>{player.division.toUpperCase()}</td>
                  <td>{player.dropped ? "Dropped" : "Active"}</td>
                  <td>
                    <button className="btn small" onClick={() => onToggleDropPlayer(player.id, !player.dropped)}>
                      {player.dropped ? "Re-activate" : "Drop"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-top-row">
          <h2>Division View</h2>
          <select value={activeDivision} onChange={(event) => setActiveDivision(event.target.value as Division)}>
            {divisions.map((division) => (
              <option key={division} value={division}>
                {division.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        <div className="split two-col">
          <div>
            <h3>Current Matchups</h3>
            {currentRound ? (
              <p className="muted">
                Round {currentRound.number} • {currentRound.phase.toUpperCase()}
              </p>
            ) : (
              <p className="muted">No pending round in this division.</p>
            )}

            {currentRoundMatches.map((match) => {
              const playerA = tournament.players.find((player) => player.id === match.playerAId);
              const playerB = tournament.players.find((player) => player.id === match.playerBId);
              const draft = matchDrafts[match.id] ?? {
                outcome: "A_WIN" as const,
                gameWinsA: tournament.config.matchFormat === "BO3" ? 2 : 1,
                gameWinsB: 0,
              };
              const canTie = currentRound?.phase === "swiss";

              return (
                <div key={match.id} className="match-card">
                  <div>
                    <strong>Table {match.tableNumber}</strong>
                  </div>
                  <div className="match-line">
                    {playerA?.name ?? "Unknown"} vs {playerB?.name ?? "BYE"}
                  </div>
                  {match.isBye ? <p className="muted">BYE auto-resolved as win.</p> : null}
                  {match.result ? (
                    <p className="muted">Result: {match.result.outcome}</p>
                  ) : (
                    <div className="match-controls">
                      <select
                        value={draft.outcome}
                        onChange={(event) =>
                          setMatchDrafts((previous) => ({
                            ...previous,
                            [match.id]: {
                              ...draft,
                              outcome: event.target.value as MatchInput["outcome"],
                            },
                          }))
                        }
                      >
                        <option value="A_WIN">Player A wins</option>
                        <option value="B_WIN">Player B wins</option>
                        {canTie ? <option value="TIE">Tie</option> : null}
                      </select>

                      {tournament.config.matchFormat === "BO3" ? (
                        <>
                          <input
                            type="number"
                            min={0}
                            max={2}
                            value={draft.gameWinsA ?? 2}
                            onChange={(event) =>
                              setMatchDrafts((previous) => ({
                                ...previous,
                                [match.id]: {
                                  ...draft,
                                  gameWinsA: Number(event.target.value),
                                },
                              }))
                            }
                          />
                          <input
                            type="number"
                            min={0}
                            max={2}
                            value={draft.gameWinsB ?? 0}
                            onChange={(event) =>
                              setMatchDrafts((previous) => ({
                                ...previous,
                                [match.id]: {
                                  ...draft,
                                  gameWinsB: Number(event.target.value),
                                },
                              }))
                            }
                          />
                        </>
                      ) : null}

                      <button className="btn small" onClick={() => onReportMatch(match)}>
                        Save Result
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div>
            <h3>Standings</h3>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Player</th>
                    <th>Deck</th>
                    <th>W-L-T</th>
                    <th>MP</th>
                    <th>OWP</th>
                    <th>OOWP</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((row) => (
                    <tr key={row.playerId}>
                      <td>{row.rank}</td>
                      <td>{row.playerName}</td>
                      <td>{row.deckName}</td>
                      <td>
                        {row.wins}-{row.losses}-{row.ties}
                      </td>
                      <td>{row.matchPoints}</td>
                      <td>{formatPercent(row.oppWinPct)}</td>
                      <td>{formatPercent(row.oppOppWinPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Exports & Backup</h2>
        <div className="button-row">
          <button className="btn" onClick={() => onExportStandings("csv")}>
            Export Standings CSV
          </button>
          <button className="btn" onClick={() => onExportStandings("pdf")}>
            Export Standings PDF
          </button>
          <button className="btn" onClick={() => onExportPairings("csv")}>
            Export Latest Pairings CSV
          </button>
          <button className="btn" onClick={() => onExportPairings("pdf")}>
            Export Latest Pairings PDF
          </button>
          <button className="btn" onClick={onExportBackup}>
            Export Backup JSON
          </button>
        </div>

        <label>
          Restore Backup JSON
          <textarea
            rows={5}
            value={backupText}
            onChange={(event) => setBackupText(event.target.value)}
            placeholder="Paste backup JSON here"
          />
        </label>
        <button className="btn" onClick={onImportBackup}>
          Import Backup
        </button>
      </section>
    </div>
  );
}
