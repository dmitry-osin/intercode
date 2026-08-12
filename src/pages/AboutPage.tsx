import { ArrowLeft, Code2, Github, Server, ShieldCheck, Users } from "lucide-react";
import { Link } from "wouter";
import { useI18n } from "@/app/i18n";
import { LocaleToggle } from "@/app/LocaleToggle";
import { ThemeToggle } from "@/app/theme";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Технологии проекта — просто список бейджей, без ссылок и версий. */
const STACK = [
  "React",
  "TypeScript",
  "Vite",
  "Tailwind CSS",
  "shadcn/ui",
  "CodeMirror 6",
  "Yjs",
  "WebSocket",
  "Node.js",
];

const AUTHOR_NAME = "Dmitry Osin";
const AUTHOR_GITHUB_URL = "https://github.com/dmitry-osin";
const AUTHOR_GITHUB_LABEL = "github.com/dmitry-osin";

export default function AboutPage() {
  const { t } = useI18n();

  const features = [
    { icon: Code2, title: t("about.features.editor.title"), desc: t("about.features.editor.desc") },
    { icon: Users, title: t("about.features.roles.title"), desc: t("about.features.roles.desc") },
    { icon: ShieldCheck, title: t("about.features.telemetry.title"), desc: t("about.features.telemetry.desc") },
    { icon: Server, title: t("about.features.selfhosted.title"), desc: t("about.features.selfhosted.desc") },
  ];

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,hsl(var(--accent)),transparent_34rem)]">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-6 sm:px-6">
        <header className="flex items-center justify-between gap-4">
          <Button asChild variant="ghost" className="gap-1.5 pl-2">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              {t("about.back")}
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <LocaleToggle />
            <ThemeToggle compact />
          </div>
        </header>

        <section className="flex flex-1 flex-col justify-center gap-6 py-10">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                <Code2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-lg font-bold">{t("app.brand")}</p>
                <p className="text-sm text-muted-foreground">{t("app.tagline")}</p>
              </div>
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("about.title")}</h1>
            <p className="max-w-2xl text-muted-foreground">{t("about.subtitle")}</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("about.features.title")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {features.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-start gap-3 rounded-xl border bg-card p-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("about.stack.title")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              {STACK.map((item) => (
                <Badge key={item} variant="outline">
                  {item}
                </Badge>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("about.author.title")}</CardTitle>
              <CardDescription>{AUTHOR_NAME}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <a href={AUTHOR_GITHUB_URL} target="_blank" rel="noreferrer noopener" title={t("about.author.github")}>
                  <Github className="h-4 w-4" />
                  {AUTHOR_GITHUB_LABEL}
                </a>
              </Button>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
