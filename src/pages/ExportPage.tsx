import { useEffect, useMemo, useState } from "react";
import { Check, CloudDownload, Copy, Download, FileJson } from "lucide-react";
import { Link, useSearchParams } from "wouter";
import { toast } from "sonner";
import { ThemeToggle } from "@/app/theme";
import { RoleGuard } from "@/ui/RoleGuard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { languageLabels, type LanguageId } from "@/editor/languages";
import { probeServerApi, serverExportUrl } from "@/collab/api";
import { copyText, downloadJson } from "@/lib/download";
import { byteSize, formatDuration } from "@/lib/format";
import { buildSnapshot } from "@/snapshot/buildSnapshot";
import { loadFinalCode, loadSessionMeta, loadTelemetryHistory } from "@/session/store";

export default function ExportPage({ id }: { id: string }) {
  const [meta] = useState(() => loadSessionMeta(id));
  const [copied, setCopied] = useState(false);
  const [searchParams] = useSearchParams();
  const [serverSnapshot, setServerSnapshot] = useState<Record<string, unknown> | null | "loading">(null);

  const roleParam = searchParams.get("r") ?? "i";
  const tokenParam = searchParams.get("k") ?? meta?.tokens.interviewer ?? "";
  const canUseServer = Boolean(tokenParam);

  const snapshot = useMemo(() => {
    if (!meta) return null;
    return buildSnapshot(meta, loadFinalCode(id) || meta.initialCode, loadTelemetryHistory(id));
  }, [id, meta]);

  // Если локальной истории нет (другой браузер/устройство) — тянем слепок с сервера.
  useEffect(() => {
    if (meta || !canUseServer) return;
    let cancelled = false;
    setServerSnapshot("loading");
    void probeServerApi()
      .then((ok) => {
        if (!ok) throw new Error("no server");
        return fetch(serverExportUrl(id, "interviewer", tokenParam));
      })
      .then((res) => {
        if (!res.ok) throw new Error(`export ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setServerSnapshot(data as Record<string, unknown>);
      })
      .catch(() => {
        if (!cancelled) setServerSnapshot(null);
      });
    return () => {
      cancelled = true;
    };
  }, [id, meta, canUseServer, tokenParam]);

  void roleParam;

  if (!meta || !snapshot) {
    if (serverSnapshot === "loading") {
      return <RoleGuard title="Загружаем слепок" message="Запрашиваем снапшот сессии с сервера…" />;
    }
    if (serverSnapshot) {
      const json = JSON.stringify(serverSnapshot, null, 2);
      return (
        <main className="min-h-screen">
          <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold">Слепок сессии (сервер)</h1>
                <p className="text-sm text-muted-foreground">{id} · загружен с сервера InterCode</p>
              </div>
              <div className="flex items-center gap-2">
                <ThemeToggle compact />
                <Button onClick={() => downloadJson(`${id}.codesession.json`, serverSnapshot)}>
                  <Download className="h-4 w-4" />
                  Скачать JSON
                </Button>
              </div>
            </header>
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileJson className="h-4 w-4" />
                  Preview .codesession.json
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea readOnly value={json} className="min-h-[560px] font-mono text-xs" />
              </CardContent>
            </Card>
          </div>
        </main>
      );
    }
    return <RoleGuard title="Слепок недоступен" message="Экспорт собирается в браузере интервьюера из локальной истории сессии." />;
  }

  const snapshotJson = JSON.stringify(snapshot, null, 2);

  const copyFinal = async () => {
    await copyText(snapshot.code.final);
    setCopied(true);
    toast.success("Финальный код скопирован");
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">Слепок сессии</h1>
              <Badge variant="secondary">{languageLabels[meta.language as LanguageId] ?? meta.language}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{meta.title} · {id}</p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle compact />
            <Button asChild variant="outline">
              <Link href={`/s/${meta.id}?r=i&k=${meta.tokens.interviewer}`}>Вернуться в комнату</Link>
            </Button>
            <Button onClick={() => downloadJson(`${meta.id}.codesession.json`, snapshot)}>
              <Download className="h-4 w-4" />
              Скачать JSON
            </Button>
            {meta.tokens.interviewer && (
              <Button asChild variant="outline" title="Авторитетный слепок: документ и телеметрия с сервера">
                <a href={serverExportUrl(meta.id, "interviewer", meta.tokens.interviewer)} download>
                  <CloudDownload className="h-4 w-4" />
                  С сервера
                </a>
              </Button>
            )}
          </div>
        </header>

        <section className="mt-6 grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2"><CardDescription>Длительность</CardDescription><CardTitle>{formatDuration(snapshot.stats.durationMs)}</CardTitle></CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>События телеметрии</CardDescription><CardTitle>{snapshot.telemetry.length}</CardTitle></CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Правки</CardDescription><CardTitle>{snapshot.stats.editsTotal}</CardTitle></CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Размер файла</CardDescription><CardTitle>{Math.round(byteSize(snapshotJson) / 1024)} КБ</CardTitle></CardHeader>
          </Card>
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-[360px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Итог</CardTitle>
              <CardDescription>Агрегаты считаются на клиенте интервьюера при экспорте.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button className="w-full" variant="outline" onClick={() => void copyFinal()}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                Скопировать финальный код
              </Button>
              <div className="space-y-2">
                <p className="text-sm font-medium">Участники</p>
                {snapshot.participants.map((participant) => (
                  <div key={participant.clientId} className="rounded-lg border p-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{participant.displayName}</span>
                      <Badge variant="outline">{participant.role}</Badge>
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Телеметрия по типам</p>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(snapshot.stats.telemetryCounts).map(([type, count]) => (
                    <Badge key={type} variant="secondary">{type}: {count}</Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileJson className="h-4 w-4" />
                Preview .codesession.json
              </CardTitle>
              <CardDescription>formatVersion: {snapshot.formatVersion}; полный Yjs update-лог зарезервирован для post-MVP.</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea readOnly value={snapshotJson} className="min-h-[560px] font-mono text-xs" />
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
