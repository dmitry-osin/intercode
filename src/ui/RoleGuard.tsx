import { AlertTriangle } from "lucide-react";
import { useI18n } from "@/app/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";

interface RoleGuardProps {
  title: string;
  message: string;
}

export function RoleGuard({ title, message }: RoleGuardProps) {
  const { t } = useI18n();
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center justify-center p-6">
      <Card className="w-full">
        <CardHeader>
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/">{t("common.home")}</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
