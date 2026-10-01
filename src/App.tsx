import { Route, Router, Switch } from "wouter";
import { lazy, Suspense, useEffect } from "react";
import { recordVisit } from "@/analytics/visit";
import { I18nProvider, useI18n } from "@/app/i18n";
import { useIntercodeHashLocation } from "@/app/router";
import { ThemeProvider } from "@/app/theme";
import { Toaster } from "@/components/ui/sonner";
import AboutPage from "@/pages/AboutPage";
import ExportPage from "@/pages/ExportPage";
import HomePage from "@/pages/HomePage";
import LobbyPage from "@/pages/LobbyPage";
import SessionPage from "@/pages/SessionPage";
import { RoleGuard } from "@/ui/RoleGuard";

const AdminPage = lazy(() => import("@/pages/AdminPage"));

export default function App() {
  useEffect(recordVisit, []);
  return (
    <I18nProvider>
      <ThemeProvider>
        <Router hook={useIntercodeHashLocation}>
          <Switch>
            <Route path="/" component={HomePage} />
            <Route path="/about" component={AboutPage} />
            <Route path="/admin"><Suspense fallback={<div role="status" className="p-8">…</div>}><AdminPage /></Suspense></Route>
            <Route path="/lobby/:id">{(params) => <LobbyPage id={params.id} />}</Route>
            <Route path="/s/:id">{(params) => <SessionPage id={params.id} />}</Route>
            <Route path="/export/:id">{(params) => <ExportPage id={params.id} />}</Route>
            <Route>
              <NotFound />
            </Route>
          </Switch>
        </Router>
        <Toaster position="top-right" richColors closeButton />
      </ThemeProvider>
    </I18nProvider>
  );
}

function NotFound() {
  const { t } = useI18n();
  return <RoleGuard title={t("notFound.title")} message={t("notFound.message")} />;
}
