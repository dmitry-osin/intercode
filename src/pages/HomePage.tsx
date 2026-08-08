import { useState } from "react";
import { ArrowRight, Code2, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { ThemeToggle } from "@/app/theme";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { languageIds, languageLabels, starterCode, type LanguageId } from "@/editor/languages";
import { randomId } from "@/lib/id";
import { createServerSession, probeServerApi } from "@/collab/api";
import { saveDisplayName, saveSessionMeta } from "@/session/store";
import { defaultAiPromptText, type RoomConfig, type SessionMeta } from "@/types";

export default function HomePage() {
  const [, navigate] = useLocation();
  const [title, setTitle] = useState("Junior FE — debounce task");
  const [hostName, setHostName] = useState("Интервьюер");
  const [language, setLanguage] = useState<LanguageId>("typescript");
  const [initialCode, setInitialCode] = useState(starterCode.typescript);
  const [copyBlocked, setCopyBlocked] = useState(true);
  const [clipboardObfuscation, setClipboardObfuscation] = useState(false);
  const [clipboardCorruption, setClipboardCorruption] = useState(false);
  const [aiPromptInjection, setAiPromptInjection] = useState(false);
  const [aiPromptText, setAiPromptText] = useState(defaultAiPromptText);
  const [devtoolsHeuristics, setDevtoolsHeuristics] = useState(false);

  const createSession = async () => {
    const config: RoomConfig = {
      copyBlocked,
      clipboardObfuscation,
      clipboardCorruption,
      aiPromptInjection,
      aiPromptText: aiPromptText.trim() || defaultAiPromptText,
      pasteThresholdAlert: 50,
      devtoolsHeuristics,
    };
    const code = initialCode.trim() ? initialCode : starterCode[language];
    const name = hostName.trim() || "Интервьюер";
    const sessionTitle = title.trim() || "InterCode session";

    // Если рядом поднят наш сервер (VPS/self-hosted) — сессию и токены создаёт он.
    if (await probeServerApi()) {
      try {
        const remote = await createServerSession({ language, initialCode: code, config });
        const meta: SessionMeta = { ...remote, title: sessionTitle, hostName: name };
        saveSessionMeta(meta);
        saveDisplayName(name);
        toast.success("Сессия создана на сервере", {
          description: "Ссылки работают с любых устройств — отправьте кандидату его ссылку.",
        });
        navigate(`/lobby/${meta.id}`);
        return;
      } catch {
        toast.error("Сервер не ответил", { description: "Создаю локальную демо-сессию в этом браузере." });
      }
    }

    const id = randomId(6);
    const meta: SessionMeta = {
      id,
      title: sessionTitle,
      createdAt: Date.now(),
      closedAt: null,
      language,
      initialCode: code,
      hostName: name,
      config,
      tokens: {
        interviewer: randomId(18),
        interviewee: randomId(18),
        viewer: randomId(18),
      },
    };
    saveSessionMeta(meta);
    saveDisplayName(meta.hostName);
    toast.success("Сессия создана", { description: "Откройте лобби и скопируйте ссылку кандидата." });
    navigate(`/lobby/${id}`);
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,hsl(var(--accent)),transparent_34rem)]">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 sm:px-6">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <Code2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-bold">InterCode</p>
              <p className="text-sm text-muted-foreground">live-собеседования по коду</p>
            </div>
          </div>
          <ThemeToggle compact />
        </header>

        <section className="grid flex-1 items-center gap-6 py-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Yjs + PartyKit · статический фронтенд
            </div>
            <div className="space-y-4">
              <h1 className="max-w-xl text-4xl font-bold tracking-tight sm:text-5xl">
                Комната собеседования с совместным редактором и анти-чит телеметрией
              </h1>
              <p className="max-w-2xl text-lg text-muted-foreground">
                Создайте сессию, отправьте кандидату ссылку и наблюдайте код, курсоры и сигналы:
                копирование, вставку, переключение вкладок и подозрительные комбинации.
              </p>
            </div>
            <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
              <div className="rounded-xl border bg-card p-3">3 роли и ссылки с токенами</div>
              <div className="rounded-xl border bg-card p-3">CodeMirror 6 + lazy языки</div>
              <div className="rounded-xl border bg-card p-3">Экспорт .codesession.json</div>
            </div>
          </div>

          <Card className="shadow-xl">
            <CardHeader>
              <CardTitle>Новая сессия</CardTitle>
              <CardDescription>Стартовый код попадёт в комнату, когда интервьюер откроет её первым.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="title">Название</Label>
                  <Input id="title" value={title} onChange={(event) => setTitle(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hostName">Ваше имя</Label>
                  <Input id="hostName" value={hostName} onChange={(event) => setHostName(event.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Язык подсветки</Label>
                <Select
                  value={language}
                  onValueChange={(value) => {
                    const next = value as LanguageId;
                    setLanguage(next);
                    setInitialCode(starterCode[next]);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите язык" />
                  </SelectTrigger>
                  <SelectContent>
                    {languageIds.map((id) => (
                      <SelectItem key={id} value={id}>
                        {languageLabels[id]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="initialCode">Стартовый фрагмент кода</Label>
                <Textarea
                  id="initialCode"
                  value={initialCode}
                  onChange={(event) => setInitialCode(event.target.value)}
                  className="min-h-44 font-mono text-sm"
                />
              </div>

              <div className="grid gap-3 rounded-xl border p-3">
                <div>
                  <p className="text-sm font-medium">Защита буфера собеседуемого</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Обфускация, порча и AI-инструкция меняют только скопированный текст, не код в комнате.
                  </p>
                </div>
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>Блокировать копирование у собеседуемого</span>
                  <Switch checked={copyBlocked} onCheckedChange={setCopyBlocked} />
                </label>
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>Обфусцировать скопированный код</span>
                  <Switch checked={clipboardObfuscation} onCheckedChange={setClipboardObfuscation} />
                </label>
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>Портить копию: UUID и дубли фрагментов строк</span>
                  <Switch checked={clipboardCorruption} onCheckedChange={setClipboardCorruption} />
                </label>
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>Добавлять AI-инструкцию в конец буфера</span>
                  <Switch checked={aiPromptInjection} onCheckedChange={setAiPromptInjection} />
                </label>
                {aiPromptInjection && (
                  <div className="space-y-2 rounded-lg bg-muted p-3">
                    <Label htmlFor="aiPromptText">Текст AI-инструкции</Label>
                    <Textarea
                      id="aiPromptText"
                      value={aiPromptText}
                      onChange={(event) => setAiPromptText(event.target.value)}
                      className="min-h-24 text-sm"
                    />
                  </div>
                )}
                <label className="flex items-center justify-between gap-3 border-t pt-3 text-sm">
                  <span>Эвристика DevTools (опционально)</span>
                  <Switch checked={devtoolsHeuristics} onCheckedChange={setDevtoolsHeuristics} />
                </label>
              </div>

              <Button className="w-full" size="lg" onClick={createSession}>
                Создать сессию
                <ArrowRight className="h-4 w-4" />
              </Button>
              <p className="text-xs text-muted-foreground">
                Local demo синхронизирует вкладки этого браузера. Для реального real-time задайте
                VITE_PARTYKIT_HOST и задеплойте PartyKit-комнату.
              </p>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
