import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, DoorOpen, Download, Loader2, Lock, Plus, Radio, Users } from "lucide-react";
import { useLocation, useSearchParams } from "wouter";
import { toast } from "sonner";
import type { EditorView } from "@codemirror/view";
import { useI18n } from "@/app/i18n";
import { LocaleToggle } from "@/app/LocaleToggle";
import { ThemeToggle, useAppTheme } from "@/app/theme";
import { CollabError, CollabSession, type CollabStatus } from "@/collab/provider";
import { updateServerSession } from "@/collab/api";
import { canControlRoom, canEdit, canSeeTelemetry, roleColor, roleFromCode, sessionLink } from "@/collab/roles";
import { CodeEditor, type IndentSetting } from "@/editor/CodeEditor";
import { languageIds, languageLabels, type LanguageId } from "@/editor/languages";
import { copyText } from "@/lib/download";
import { generateParticipantName } from "@/lib/names";
import {
  loadEditCount,
  loadFinalCode,
  loadRoleName,
  loadTelemetryHistory,
  saveDisplayName,
  saveEditCount,
  saveFinalCode,
  saveRoleName,
  saveSessionMeta,
} from "@/session/store";
import { attachTelemetryCollector } from "@/telemetry/collector";
import { useTelemetryFeed } from "@/telemetry/feed";
import { ParticipantsBar } from "@/ui/ParticipantsBar";
import { RoleGuard } from "@/ui/RoleGuard";
import { TelemetryPanel } from "@/ui/TelemetryPanel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Participant, Role, SessionMeta } from "@/types";
import { roleLabelKeys } from "@/types";

const roleOrder: Role[] = ["interviewer", "interviewee", "viewer"];

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

function errorMessage(error: unknown, t: (key: string) => string): { title: string; message: string } {
  if (error instanceof CollabError && error.code === "bad_token") {
    return { title: t("room.error.badLink.title"), message: error.message };
  }
  if (error instanceof CollabError && error.code === "not_found") {
    return { title: t("room.error.notFound.title"), message: error.message };
  }
  return {
    title: t("room.error.connect.title"),
    message: error instanceof Error ? error.message : t("room.error.connect.fallback"),
  };
}

export default function SessionPage({ id }: { id: string }) {
  const [, navigate] = useLocation();
  const [searchParams] = useSearchParams();
  const { theme } = useAppTheme();
  const { t } = useI18n();
  const role = roleFromCode(searchParams.get("r"));
  const token = searchParams.get("k") ?? "";
  // Имя роли из хранилища браузера; при отсутствии — случайное сгенерированное имя.
  const [displayName, setDisplayName] = useState(() =>
    role ? loadRoleName(role, generateParticipantName()) : "",
  );
  const [collab, setCollab] = useState<CollabSession | null>(null);
  const [status, setStatus] = useState<CollabStatus>({ connected: false, mode: "local", error: null });
  const [meta, setMeta] = useState<SessionMeta | null>(null);
  const [language, setLanguage] = useState<string>("typescript");
  const [indent, setIndent] = useState<IndentSetting>("2");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [copiedRole, setCopiedRole] = useState<Role | null>(null);
  const editCountRef = useRef(loadEditCount(id));
  const editorKeyRef = useRef(0);

  const readOnly = useMemo(() => (role ? !canEdit(role) : true), [role]);
  const interviewer = role === "interviewer";
  const invalidRoleError = role
    ? null
    : { title: t("room.error.noRole.title"), message: t("room.error.noRole.message") };

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
        session = await CollabSession.create({ sessionId: id, role, token, displayName });
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
            if (nextMeta.status === "ended") {
              // Завершение пришло с сервера: блокируем редактор для всех ролей.
              editorKeyRef.current += 1;
              setSessionEnded(true);
            }
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
        if (!disposed) setError(errorMessage(connectError, t));
      }
    };

    void connect();

    return () => {
      disposed = true;
      detach.forEach((off) => off());
      session?.close();
      setCollab(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- переподключаемся только по id/роли/токену
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
    if (role) saveRoleName(role, name);
    collab?.setDisplayName(name);
  };

  const finalCode = () => editorView?.state.doc.toString() ?? loadFinalCode(id);

  const copyFinalCode = async () => {
    const ok = await copyText(finalCode());
    if (ok) toast.success(t("room.codeCopied"));
    else toast.error(t("common.copyFailed"));
  };

  const copyRoleLink = async (targetRole: Role) => {
    if (!meta) return;
    const ok = await copyText(sessionLink(meta, targetRole));
    if (!ok) {
      toast.error(t("common.copyFailed"));
      return;
    }
    setCopiedRole(targetRole);
    toast.success(t("lobby.linkCopied", { role: t(`role.${targetRole}.short`) }));
    window.setTimeout(() => setCopiedRole(null), 1200);
  };

  const closeSession = () => {
    if (!collab || !meta || !canControlRoom(collab.role)) return;
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
          <span>{t("room.connecting")}</span>
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen overflow-hidden">
      <div className="mx-auto flex h-full max-w-[1500px] flex-col px-4 py-4 sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-bold">{meta.title}</h1>
              <Badge variant={status.connected ? "default" : "destructive"} className="gap-1">
                <Radio className="h-3 w-3" />
                {status.connected
                  ? status.mode === "local"
                    ? t("room.status.local")
                    : t("room.status.server")
                  : t("room.status.offline")}
              </Badge>
              {readOnly && (
                <Badge variant="outline" className="gap-1">
                  <Lock className="h-3 w-3" />
                  {t("room.readOnly")}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {t("common.session")} {id} · {status.error ?? t("room.syncActive")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-md border bg-background pl-2.5">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: roleColor(role) }}
                aria-hidden="true"
              />
              <Input
                value={displayName}
                onChange={(event) => changeName(event.target.value)}
                placeholder={t("room.namePlaceholder")}
                className="h-8 w-32 border-0 px-1.5 shadow-none focus-visible:ring-0"
              />
              <span className="shrink-0 pr-2.5 text-xs whitespace-nowrap text-muted-foreground">
                ({t(roleLabelKeys[role])})
              </span>
            </div>
            <LocaleToggle />
            <ThemeToggle compact />
            {interviewer && (
              <>
                {roleOrder.map((linkRole) => (
                  <Button
                    key={linkRole}
                    variant="outline"
                    onClick={() => void copyRoleLink(linkRole)}
                    title={t("room.copyLinkFor", { role: t(roleLabelKeys[linkRole]) })}
                  >
                    {copiedRole === linkRole ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {t(roleLabelKeys[linkRole])}
                  </Button>
                ))}
                <Button variant="outline" onClick={() => void copyFinalCode()}>
                  <Copy className="h-4 w-4" />
                  {t("common.code")}
                </Button>
                <Button variant="outline" onClick={() => navigate(`/export/${id}`)}>
                  <Download className="h-4 w-4" />
                  {t("common.export")}
                </Button>
                <Button variant="outline" onClick={() => navigate("/")}>
                  <Plus className="h-4 w-4" />
                  {t("common.newSession")}
                </Button>
                <Button variant="destructive" onClick={() => setConfirmClose(true)}>
                  <DoorOpen className="h-4 w-4" />
                  {t("common.close")}
                </Button>
              </>
            )}
          </div>
        </header>

        <section className="mt-4 grid min-h-0 flex-1 items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_370px]">
          <Card className="flex min-h-0 flex-col overflow-hidden">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b py-3">
              <div>
                <CardTitle className="text-base">{t("room.editor.title")}</CardTitle>
                <CardDescription>{t("room.editor.subtitle")}</CardDescription>
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
            <CardContent className="flex min-h-0 flex-1 flex-col p-0">
              <CodeEditor
                key={editorKeyRef.current}
                collab={collab}
                language={language}
                theme={theme}
                readOnly={readOnly || sessionEnded}
                indent={indent}
                onReady={handleEditorReady}
                onDocChange={handleDocChange}
              />
            </CardContent>
          </Card>

          <aside className="flex min-h-0 flex-col gap-4 overflow-hidden">
            <ParticipantsBar participants={participants} />
            {canSeeTelemetry(role) ? (
              <TelemetryPanel sessionId={id} clockOffset={collab.clockOffset} className="min-h-0 flex-1" />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Users className="h-4 w-4" />
                    {t("room.participantMode")}
                  </CardTitle>
                  <CardDescription>
                    {role === "interviewee" ? t("room.participant.interviewee") : t("room.participant.viewer")}
                  </CardDescription>
                </CardHeader>
              </Card>
            )}
          </aside>
        </section>
      </div>

      {/* Подтверждение завершения сессии — popup в стиле приложения */}
      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("room.closeDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("room.closeDialog.desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={closeSession}
            >
              {t("common.close")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Уведомление о завершении сессии для всех участников */}
      <AlertDialog open={sessionEnded}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("room.sessionEnded.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("room.sessionEnded.message")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {interviewer && (
              <AlertDialogCancel onClick={() => navigate(`/export/${id}`)}>
                {t("room.sessionEnded.toExport")}
              </AlertDialogCancel>
            )}
            <AlertDialogAction onClick={() => setSessionEnded(false)}>
              {t("common.ok")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
