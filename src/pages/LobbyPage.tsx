import { useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, QrCode } from "lucide-react";
import { Link } from "wouter";
import { toDataURL } from "qrcode";
import { toast } from "sonner";
import { useI18n } from "@/app/i18n";
import { LocaleToggle } from "@/app/LocaleToggle";
import { ThemeToggle } from "@/app/theme";
import { RoleGuard } from "@/ui/RoleGuard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { languageLabels, type LanguageId } from "@/editor/languages";
import { copyText } from "@/lib/download";
import { formatTime } from "@/lib/format";
import { loadSessionMeta } from "@/session/store";
import type { Role, SessionMeta } from "@/types";
import { codeFromRole } from "@/collab/roles";
import { roleLabelKeys } from "@/types";

const roleOrder: Role[] = ["interviewer", "interviewee", "viewer"];

function sessionLink(meta: SessionMeta, role: Role): string {
  const url = new URL(window.location.href);
  url.hash = `/s/${meta.id}?r=${codeFromRole(role)}&k=${meta.tokens[role]}`;
  url.search = "";
  return url.href;
}

export default function LobbyPage({ id }: { id: string }) {
  const { t } = useI18n();
  const [meta] = useState<SessionMeta | null>(() => loadSessionMeta(id));
  const [copiedRole, setCopiedRole] = useState<Role | null>(null);
  const [qr, setQr] = useState("");

  const links = useMemo(() => {
    if (!meta) return null;
    return {
      interviewer: sessionLink(meta, "interviewer"),
      interviewee: sessionLink(meta, "interviewee"),
      viewer: sessionLink(meta, "viewer"),
    };
  }, [meta]);

  useEffect(() => {
    if (!links) return;
    void toDataURL(links.interviewee, { width: 220, margin: 1 }).then(setQr).catch(() => setQr(""));
  }, [links]);

  if (!meta || !links) {
    return <RoleGuard title={t("lobby.notFound.title")} message={t("lobby.notFound.message")} />;
  }

  const copyRole = async (role: Role) => {
    await copyText(links[role]);
    setCopiedRole(role);
    toast.success(t("lobby.linkCopied", { role: t(`role.${role}.short`) }));
    window.setTimeout(() => setCopiedRole(null), 1200);
  };

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{meta.title}</h1>
              <Badge variant="secondary">{languageLabels[meta.language as LanguageId] ?? meta.language}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("common.session")} {meta.id} · {t("lobby.createdAt", { time: formatTime(meta.createdAt) })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <LocaleToggle />
            <ThemeToggle compact />
            <Button asChild>
              <Link href={`/s/${meta.id}?r=i&k=${meta.tokens.interviewer}`}>
                {t("lobby.openRoom")}
                <ExternalLink className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </header>

        <section className="mt-6 grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="grid gap-4 md:grid-cols-3">
            {roleOrder.map((role) => (
              <Card key={role}>
                <CardHeader>
                  <CardTitle className="text-base">{t(roleLabelKeys[role])}</CardTitle>
                  <CardDescription>
                    {role === "interviewer" && t("lobby.role.interviewer.desc")}
                    {role === "interviewee" && t("lobby.role.interviewee.desc")}
                    {role === "viewer" && t("lobby.role.viewer.desc")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="max-h-24 overflow-auto rounded-lg bg-muted p-2 font-mono text-xs break-all text-muted-foreground">
                    {links[role]}
                  </div>
                  <Button className="w-full" variant="outline" onClick={() => void copyRole(role)}>
                    {copiedRole === role ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {t("lobby.copyLink")}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <QrCode className="h-4 w-4" />
                {t("lobby.qr.title")}
              </CardTitle>
              <CardDescription>{t("lobby.qr.desc")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-3">
              {qr ? <img src={qr} alt={t("lobby.qr.alt")} className="rounded-xl border bg-white p-2" /> : <div className="h-[220px] w-[220px] animate-pulse rounded-xl bg-muted" />}
              <p className="text-center text-xs text-muted-foreground">
                {t("lobby.qr.hint")}
              </p>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
