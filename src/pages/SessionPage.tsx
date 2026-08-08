import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, DoorOpen, Download, Loader2, Lock, Radio, Users } from "lucide-react";
import { useLocation, useSearchParams } from "wouter";
import { toast } from "sonner";
import type { EditorView } from "@codemirror/view";
import { ThemeToggle, useAppTheme } from "@/app/theme";
import { CollabError, CollabSession, type CollabStatus } from "@/collab/provider";
import { updateServerSession } from "@/collab/api";
import { canControlRoom, canEdit, canSeeTelemetry, roleFromCode } from "@/collab/roles";
import { CodeEditor, type IndentSetting } from "@/editor/CodeEditor";
import { languageIds, languageLabels, type LanguageId } from "@/editor/languages";
import { copyText } from "@/lib/download";
import {
  loadDisplayName,
  loadEditCount,
  loadFinalCode,
  loadTelemetryHistory,
  saveDisplayName,
  saveEditCount,
  saveFinalCode,
  saveSessionMeta,
} from "@/session/store";
import { attachTelemetryCollector } from "@/telemetry/collector";
import { useTelemetryFeed } from "@/telemetry/feed";
import { ParticipantsBar } from "@/ui/ParticipantsBar";
import { RoleGuard } from "@/ui/RoleGuard";
import { TelemetryPanel } from "@/ui/TelemetryPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Participant, Role, SessionMeta } from "@/types";
import { roleLabels } from "@/types";

function participantsFromAwareness(collab: CollabSession): Participant[] {
  const participants = new Map<string, Participant>();
  collab.awareness.getStates().forEach((state) => {
    const user = state.user as
      | { clientId?: string; name?: string; role?: Role; color?: string; joinedAt?: number; ua?: string }
      | undefined;
    if (!user?.clientId) return;
    participants.set(user.clientId, {
      clientId: user.clientId,
      role: user.role ?? "viewer",
      displayName: user.name ?? user.clientId,
      color: user.color ?? "#2563eb",
      joinedAt: user.joinedAt ?? Date.now(),
      ua: user.ua ?? "",
    });
  });
  return Array.from(participants.values()).sort((a, b) => a.joinedAt - b.joinedAt);
}

function errorMessage(error: unknown): { title: string; message: string } {
  if (error instanceof CollabError && error.code === "bad_token") {
    return { title: "Неверная ссылка", message: error.message };
  }
  if (error instanceof CollabError && error.code === "not_found") {
    return { title: "Комната недоступна локально", message: error.message };
  }
  return {
    title: "Не удалось подключиться",
    message: error instanceof Error ? error.message : "Проверьте ссылку и доступность PartyKit.",
  };
}

export default function SessionPage({ id }: { id: string }) {
  const [, navigate] = useLocation();
  const [searchParams] = useSearchParams();
  const { theme } = useAppTheme();
  const role = roleFromCode(searchParams.get("r"));
  const token = searchParams.get("k") ?? "";
  const [displayName, setDisplayName] = useState(() => loadDisplayName());
  const [collab, setCollab] = useState<CollabSession | null>(null);
  const [status, setStatus] = useState<CollabStatus>({ connected: false, mode: "local", error: null });
  const [meta, setMeta] = useState<SessionMeta | null>(null);
  const [language, setLanguage] = useState<string>("typescript");
  const [indent, setIndent] = useState<IndentSetting>("2");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const editCountRef = useRef(loadEditCount(id));

  const readOnly = useMemo(() => (role ? !canEdit(role) : true), [role]);
  const interviewer = role === "interviewer";
  const invalidRoleError = role
    ? null
    : { title: "Роль не указана", message: "Откройте одну из трёх ссылок из лобби: interviewer, interviewee или viewer." };

  useEffect(() => {
    if (!role) return;
    let disposed = false;
    let session: CollabSession | null = null;
    const detach: Array<() => void> = [];

    const connect = async () => {
      try {
        if (canSeeTelemetry(role)) {
          const feed = useTelemetryFeed.getState();
          feed.clear();
          feed.addEvents(loadTelemetryHistory(id));
        }
        session = await CollabSession.create({ sessionId: id, role, token, displayName: loadDisplayName() });
        if (disposed) {
          session.close();
          return;
        }
        setCollab(session);
        setMeta(session.sessionMeta);
        setLanguage(session.sessionMeta.language);
        detach.push(session.onStatus((nextStatus) => setStatus(nextStatus)));
        detach.push(
          session.onMeta((nextMeta) => {
            setMeta(nextMeta);
            setLanguage(nextMeta.language);
            saveSessionMeta(nextMeta);
          }),
        );
        if (canSeeTelemetry(role)) {
          detach.push(session.onTelemetry((event) => useTelemetryFeed.getState().addEvents([event])));
        }
        const updateParticipants = () => session && setParticipants(participantsFromAwareness(session));
        session.awareness.on("change", updateParticipants);
        detach.push(() => session?.awareness.off("change", updateParticipants));
        updateParticipants();
      } catch (connectError) {
        if (!disposed) setError(errorMessage(connectError));
      }
    };

    void connect();

    return () => {
      disposed = true;
      detach.forEach((off) => off());
      session?.close();
      setCollab(null);
    };
  }, [id, role, token]);

  useEffect(() => {
    if (!collab || !meta) return;
    return attachTelemetryCollector(collab, editorView?.dom ?? null, meta.config);
  }, [collab, editorView, meta]);

  const handleDocChange = useCallback(
    (code: string) => {
      saveFinalCode(id, code);
      editCountRef.current += 1;
      saveEditCount(id, editCountRef.current);
    },
    [id],
  );

  const handleEditorReady = useCallback((view: EditorView | null) => setEditorView(view), []);

  const changeLanguage = (nextLanguage: string) => {
    if (!collab || !meta || !interviewer) return;
    const nextMeta = { ...meta, language: nextLanguage };
    setMeta(nextMeta);
    setLanguage(nextLanguage);
    saveSessionMeta(nextMeta);
    collab.sendMeta(nextMeta);
  };

  const changeName = (name: string) => {
    setDisplayName(name);
    saveDisplayName(name);
    collab?.setDisplayName(name);
  };

  const finalCode = () => editorView?.state.doc.toString() ?? loadFinalCode(id);

  const copyFinalCode = async () => {
    await copyText(finalCode());
    toast.success("Финальный код скопирован");
  };

  const closeSession = () => {
    if (!collab || !meta || !canControlRoom(collab.role)) return;
    if (!window.confirm("Завершить сессию и открыть страницу экспорта?")) return;
    const closedMeta = { ...meta, closedAt: Date.now(), status: "ended" as const };
    saveFinalCode(id, finalCode());
    saveSessionMeta(closedMeta);
    if (collab.currentStatus.mode === "server") {
      // Сервер закроет комнату для новых подключений и сохранит снапшот.
      void updateServerSession(id, collab.role, token, { status: "ended" });
    } else {
      collab.sendMeta(closedMeta);
    }
    navigate(`/export/${id}`);
  };

  if (invalidRoleError) return <RoleGuard title={invalidRoleError.title} message={invalidRoleError.message} />;
  if (error) return <RoleGuard title={error.title} message={error.message} />;

  if (!collab || !meta || !role) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span>Подключаемся к комнате…</span>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col px-4 py-4 sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-bold">{meta.title}</h1>
              <Badge variant="secondary">{roleLabels[role]}</Badge>
              <Badge variant={status.connected ? "default" : "destructive"} className="gap-1">
                <Radio className="h-3 w-3" />
                {status.connected
                  ? status.mode === "local"
                    ? "local demo"
                    : status.mode === "server"
                      ? "server"
                      : "PartyKit"
                  : "offline"}
              </Badge>
              {readOnly && (
                <Badge variant="outline" className="gap-1">
                  <Lock className="h-3 w-3" />
                  read-only
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">Сессия {id} · {status.error ?? "синхронизация активна"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={displayName}
              onChange={(event) => changeName(event.target.value)}
              placeholder="Ваше имя"
              className="w-40"
            />
            <ThemeToggle compact />
            {interviewer && (
              <>
                <Button variant="outline" onClick={() => void copyFinalCode()}>
                  <Copy className="h-4 w-4" />
                  Код
                </Button>
                <Button variant="outline" onClick={() => navigate(`/export/${id}`)}>
                  <Download className="h-4 w-4" />
                  Экспорт
                </Button>
                <Button variant="destructive" onClick={closeSession}>
                  <DoorOpen className="h-4 w-4" />
                  Завершить
                </Button>
              </>
            )}
          </div>
        </header>

        <section className="mt-4 grid flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_370px]">
          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b py-3">
              <div>
                <CardTitle className="text-base">Совместный редактор</CardTitle>
                <CardDescription>Код и курсоры синхронизируются через Yjs.</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={language} onValueChange={changeLanguage} disabled={!interviewer}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {languageIds.map((languageId) => (
                      <SelectItem key={languageId} value={languageId}>
                        {languageLabels[languageId as LanguageId]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={indent} onValueChange={(value) => setIndent(value as IndentSetting)}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">2 spaces</SelectItem>
                    <SelectItem value="4">4 spaces</SelectItem>
                    <SelectItem value="tab">tab</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <CodeEditor
                collab={collab}
                language={language}
                theme={theme}
                readOnly={readOnly}
                indent={indent}
                onReady={handleEditorReady}
                onDocChange={handleDocChange}
              />
            </CardContent>
          </Card>

          <aside className="space-y-4">
            <ParticipantsBar participants={participants} />
            {canSeeTelemetry(role) ? (
              <TelemetryPanel sessionId={id} clockOffset={collab.clockOffset} />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Users className="h-4 w-4" />
                    Режим участника
                  </CardTitle>
                  <CardDescription>
                    {role === "interviewee"
                      ? "Вы можете редактировать код и видеть курсоры других участников."
                      : "Вы наблюдаете за кодом и курсорами в режиме read-only."}
                  </CardDescription>
                </CardHeader>
              </Card>
            )}
          </aside>
        </section>
      </div>
    </main>
  );
}
