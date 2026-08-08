import { useState } from "react";
import { ArrowRight, Code2, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useI18n } from "@/app/i18n";
import { LocaleToggle } from "@/app/LocaleToggle";
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
import { loadRoleName, saveDisplayName, saveRoleName, saveSessionMeta } from "@/session/store";
import { defaultAiPromptFor, type RoomConfig, type SessionMeta } from "@/types";

/** Название сессии по умолчанию: дата и время создания (формат текущей локали). */
function generatedSessionTitle(locale: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return locale === "ru" ? `Сессия ${stamp}` : `Session ${stamp}`;
}

export default function HomePage() {
  const [, navigate] = useLocation();
  const { t, locale } = useI18n();
  const [title, setTitle] = useState(() => generatedSessionTitle(locale));
  const [hostName, setHostName] = useState(() => loadRoleName("interviewer", t("defaultName.interviewer")));
  const [language, setLanguage] = useState<LanguageId>("typescript");
  const [initialCode, setInitialCode] = useState(starterCode.typescript);
  const [copyBlocked, setCopyBlocked] = useState(true);
  const [clipboardObfuscation, setClipboardObfuscation] = useState(false);
  const [clipboardCorruption, setClipboardCorruption] = useState(false);
  const [aiPromptInjection, setAiPromptInjection] = useState(false);
  const [aiPromptText, setAiPromptText] = useState(() => defaultAiPromptFor(locale));
  const [devtoolsHeuristics, setDevtoolsHeuristics] = useState(false);

  const createSession = async () => {
    const config: RoomConfig = {
      copyBlocked,
      clipboardObfuscation,
      clipboardCorruption,
      aiPromptInjection,
      aiPromptText: aiPromptText.trim() || defaultAiPromptFor(locale),
      pasteThresholdAlert: 50,
      devtoolsHeuristics,
    };
    const code = initialCode.trim() ? initialCode : starterCode[language];
    const name = hostName.trim() || t("defaultName.interviewer");
    const sessionTitle = title.trim() || generatedSessionTitle(locale);
    saveDisplayName(name);
    saveRoleName("interviewer", name);

    // Если рядом поднят наш сервер (VPS/self-hosted) — сессию и токены создаёт он.
    if (await probeServerApi()) {
      try {
        const remote = await createServerSession({ language, initialCode: code, config });
        const meta: SessionMeta = { ...remote, title: sessionTitle, hostName: name };
        saveSessionMeta(meta);
        toast.success(t("home.toast.server.title"), { description: t("home.toast.server.desc") });
        navigate(`/lobby/${meta.id}`);
        return;
      } catch {
        toast.error(t("home.toast.serverFail.title"), { description: t("home.toast.serverFail.desc") });
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
    toast.success(t("home.toast.local.title"), { description: t("home.toast.local.desc") });
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
              <p className="text-lg font-bold">{t("app.brand")}</p>
              <p className="text-sm text-muted-foreground">{t("app.tagline")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LocaleToggle />
            <ThemeToggle compact />
          </div>
        </header>

        <section className="grid flex-1 items-center gap-6 py-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              {t("home.badge")}
            </div>
            <div className="space-y-4">
              <h1 className="max-w-xl text-4xl font-bold tracking-tight sm:text-5xl">
                {t("home.hero.title")}
              </h1>
              <p className="max-w-2xl text-lg text-muted-foreground">
                {t("home.hero.subtitle")}
              </p>
            </div>
            <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
              <div className="rounded-xl border bg-card p-3">{t("home.feature.roles")}</div>
              <div className="rounded-xl border bg-card p-3">{t("home.feature.editor")}</div>
              <div className="rounded-xl border bg-card p-3">{t("home.feature.export")}</div>
            </div>
          </div>

          <Card className="shadow-xl">
            <CardHeader>
              <CardTitle>{t("home.form.title")}</CardTitle>
              <CardDescription>{t("home.form.description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="title">{t("home.form.name")}</Label>
                  <Input id="title" value={title} onChange={(event) => setTitle(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hostName">{t("home.form.yourName")}</Label>
                  <Input id="hostName" value={hostName} onChange={(event) => setHostName(event.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t("home.form.language")}</Label>
                <Select
                  value={language}
                  onValueChange={(value) => {
                    const next = value as LanguageId;
                    setLanguage(next);
                    setInitialCode(starterCode[next]);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("home.form.languagePlaceholder")} />
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
                <Label htmlFor="initialCode">{t("home.form.initialCode")}</Label>
                <Textarea
                  id="initialCode"
                  value={initialCode}
                  onChange={(event) => setInitialCode(event.target.value)}
                  className="min-h-44 font-mono text-sm"
                />
              </div>

              <div className="grid gap-3 rounded-xl border p-3">
                <div>
                  <p className="text-sm font-medium">{t("home.defense.title")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("home.defense.subtitle")}
                  </p>
                </div>
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>{t("home.defense.block")}</span>
                  <Switch checked={copyBlocked} onCheckedChange={setCopyBlocked} />
                </label>
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>{t("home.defense.obfuscate")}</span>
                  <Switch checked={clipboardObfuscation} onCheckedChange={setClipboardObfuscation} />
                </label>
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>{t("home.defense.corrupt")}</span>
                  <Switch checked={clipboardCorruption} onCheckedChange={setClipboardCorruption} />
                </label>
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>{t("home.defense.aiPrompt")}</span>
                  <Switch checked={aiPromptInjection} onCheckedChange={setAiPromptInjection} />
                </label>
                {aiPromptInjection && (
                  <div className="space-y-2 rounded-lg bg-muted p-3">
                    <Label htmlFor="aiPromptText">{t("home.defense.aiPromptText")}</Label>
                    <Textarea
                      id="aiPromptText"
                      value={aiPromptText}
                      onChange={(event) => setAiPromptText(event.target.value)}
                      className="min-h-24 text-sm"
                    />
                  </div>
                )}
                <label className="flex items-center justify-between gap-3 border-t pt-3 text-sm">
                  <span>{t("home.defense.devtools")}</span>
                  <Switch checked={devtoolsHeuristics} onCheckedChange={setDevtoolsHeuristics} />
                </label>
              </div>

              <Button className="w-full" size="lg" onClick={() => void createSession()}>
                {t("home.form.submit")}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
