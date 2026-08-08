import { Route, Router, Switch } from "wouter";
import { useIntercodeHashLocation } from "@/app/router";
import { ThemeProvider } from "@/app/theme";
import { Toaster } from "@/components/ui/sonner";
import ExportPage from "@/pages/ExportPage";
import HomePage from "@/pages/HomePage";
import LobbyPage from "@/pages/LobbyPage";
import SessionPage from "@/pages/SessionPage";
import { RoleGuard } from "@/ui/RoleGuard";

export default function App() {
  return (
    <ThemeProvider>
      <Router hook={useIntercodeHashLocation}>
        <Switch>
          <Route path="/" component={HomePage} />
          <Route path="/lobby/:id">{(params) => <LobbyPage id={params.id} />}</Route>
          <Route path="/s/:id">{(params) => <SessionPage id={params.id} />}</Route>
          <Route path="/export/:id">{(params) => <ExportPage id={params.id} />}</Route>
          <Route>
            <RoleGuard title="Страница не найдена" message="Проверьте hash-ссылку сессии." />
          </Route>
        </Switch>
      </Router>
      <Toaster position="top-right" richColors closeButton />
    </ThemeProvider>
  );
}
