import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useI18n } from "@/app/i18n";
import { LocaleToggle } from "@/app/LocaleToggle";
import { ThemeToggle } from "@/app/theme";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Counters = { visits: number; created: number; started: number; ended: number; joins: number; telemetry: number; alerts: number };
type Stats = {
  since: number;
  totals: Counters;
  lifetime: Counters;
  daily: (Counters & { date: string })[];
  languages: Record<string, number>;
  online: number;
  liveInterviews: number;
  recent: { id: string; createdAt: number; startedAt: number | null; closedAt: number | null; language: string; status: string }[];
};
const apiBase = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ?? "";

export default function AdminPage() {
  const { locale } = useI18n();
  const ru = locale === "ru";
  const text = ru ? {
    title: "Статистика приложения", home: "На главную", key: "Ключ администратора", login: "Войти", logout: "Выйти",
    refresh: "Обновить", days: "дней", loading: "Загрузка…", visits: "Заходы", created: "Создано сессий", started: "Начато собеседований",
    ended: "Завершено сессий", joins: "Подключения", telemetry: "События телеметрии", alerts: "Предупреждения", online: "Участников онлайн",
    live: "Комнат с участниками", activity: "Активность по дням", languages: "Языки за всё время", recent: "Последние 100 сессий за всё время",
    date: "Создана", language: "Язык", status: "Статус", duration: "Длительность", active: "Начата", waiting: "Ожидает кандидата", closed: "Завершена",
    empty: "Пока нет данных", disabled: "Админка выключена. Задайте ADMIN_TOKEN длиной не менее 32 символов на сервере и перезапустите его.",
    unauthorized: "Неверный ключ администратора.", unavailable: "Не удалось получить статистику. Проверьте доступность сервера.",
    note: "Заход = загрузка приложения (включая перезагрузку). Начало = первое подключение кандидата. Подключения включают повторные входы. Дни считаются в UTC. Локальные собеседования без сервера не учитываются.",
    since: "Сбор статистики с", lifetime: "За всё время", updated: "Обновлено", min: "мин", loginNote: "Ключ используется только в этой вкладке и не сохраняется в браузере.",
    changeKey: "Изменить ключ входа", currentKey: "Текущий ключ", newKey: "Новый ключ", confirmKey: "Повторите новый ключ", saveKey: "Сохранить ключ", cancel: "Отмена",
    keyHint: "От 32 до 256 символов: латинские буквы, цифры и знаки, без пробелов. Сохраните новый ключ: старый сразу перестанет работать во всех вкладках.",
    invalidKey: "Ключ должен содержать от 32 до 256 символов ASCII без пробелов.", mismatch: "Новые ключи не совпадают.", wrongCurrent: "Текущий ключ неверен или уже изменён.", sameKey: "Новый ключ должен отличаться от текущего.",
    changed: "Ключ изменён. В этой вкладке вход сохранён.", changeFailed: "Не удалось подтвердить смену ключа. Проверьте подключение и попробуйте войти с новым ключом; если он не подходит, используйте старый.",
  } : {
    title: "Application statistics", home: "Home", key: "Admin key", login: "Sign in", logout: "Sign out",
    refresh: "Refresh", days: "days", loading: "Loading…", visits: "Visits", created: "Sessions created", started: "Interviews started",
    ended: "Sessions ended", joins: "Connections", telemetry: "Telemetry events", alerts: "Warnings", online: "Participants online",
    live: "Rooms with participants", activity: "Daily activity", languages: "Languages, all time", recent: "Latest 100 sessions, all time",
    date: "Created", language: "Language", status: "Status", duration: "Duration", active: "Started", waiting: "Awaiting candidate", closed: "Ended",
    empty: "No data yet", disabled: "Admin is disabled. Set ADMIN_TOKEN to at least 32 characters on the server and restart it.",
    unauthorized: "Invalid admin key.", unavailable: "Could not load statistics. Check server availability.",
    note: "Visit = application page load (including reloads). Start = first candidate connection. Connections include reconnects. Days use UTC. Local interviews without a server are excluded.",
    since: "Statistics collected since", lifetime: "All time", updated: "Updated", min: "min", loginNote: "The key is used only in this tab and is not saved in the browser.",
    changeKey: "Change sign-in key", currentKey: "Current key", newKey: "New key", confirmKey: "Repeat new key", saveKey: "Save key", cancel: "Cancel",
    keyHint: "32–256 characters: Latin letters, numbers and symbols, without spaces. Save the new key: the old key will immediately stop working in all tabs.",
    invalidKey: "The key must contain 32–256 ASCII characters without spaces.", mismatch: "The new keys do not match.", wrongCurrent: "The current key is incorrect or has already changed.", sameKey: "The new key must differ from the current key.",
    changed: "Key changed. You remain signed in in this tab.", changeFailed: "Could not confirm the key change. Check your connection and try signing in with the new key; if it fails, use the old one.",
  };
  const [draft, setDraft] = useState("");
  const [token, setToken] = useState("");
  const [days, setDays] = useState(30);
  const [revision, setRevision] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<"disabled" | "unauthorized" | "unavailable" | null>(null);
  const [loading, setLoading] = useState(false);
  const [updated, setUpdated] = useState<number | null>(null);
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [currentKey, setCurrentKey] = useState("");
  const [newKey, setNewKey] = useState("");
  const [confirmKey, setConfirmKey] = useState("");
  const [changingKey, setChangingKey] = useState(false);
  const [keyError, setKeyError] = useState<"invalidKey" | "mismatch" | "wrongCurrent" | "sameKey" | "changeFailed" | null>(null);

  function clearKeyForm() {
    setCurrentKey(""); setNewKey(""); setConfirmKey(""); setKeyError(null); setShowKeyForm(false);
  }

  async function changeKey(event: FormEvent) {
    event.preventDefault();
    if (changingKey) return;
    if (!/^[\x21-\x7e]{32,256}$/.test(newKey)) { setKeyError("invalidKey"); return; }
    if (newKey !== confirmKey) { setKeyError("mismatch"); return; }
    setChangingKey(true); setKeyError(null);
    try {
      const response = await fetch(`${apiBase}/api/admin/key`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentToken: currentKey, newToken: newKey }),
      });
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        setKeyError(response.status === 401 ? "wrongCurrent" : result.error === "same_key" ? "sameKey" : result.error === "invalid_key" ? "invalidKey" : "changeFailed");
        return;
      }
      setToken(newKey); setLoading(true); clearKeyForm(); toast.success(text.changed);
    } catch {
      setKeyError("changeFailed");
    } finally {
      setChangingKey(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`${apiBase}/api/admin/stats?days=${days}`, {
          headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) {
          const code = response.status === 401 ? "unauthorized" : response.status === 503 ? "disabled" : "unavailable";
          if (!controller.signal.aborted) { setError(code); setStats(null); }
          return;
        }
        const result = await response.json() as Stats;
        if (!result.daily || !result.totals) throw new Error("Invalid response");
        if (!controller.signal.aborted) { setStats(result); setError(null); setUpdated(Date.now()); }
      } catch {
        if (!controller.signal.aborted) { setError("unavailable"); setStats(null); }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [token, days, revision]);

  function login(event: FormEvent) {
    event.preventDefault();
    setLoading(true); setError(null); setToken(draft.trim()); setDraft(""); setRevision((n) => n + 1);
    clearKeyForm();
  }
  const formatDate = (ts: number) => new Date(ts).toLocaleString(locale);
  const metrics: (keyof Counters)[] = ["visits", "created", "started", "ended", "joins", "telemetry", "alerts"];

  return <main className="min-h-screen bg-background p-4 text-foreground md:p-8">
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div><Link href="/" className="text-sm text-muted-foreground hover:underline">← {text.home}</Link><h1 className="mt-2 text-2xl font-semibold">{text.title}</h1></div>
        <div className="flex flex-wrap items-center gap-2"><LocaleToggle /><ThemeToggle />{stats && <Button variant="outline" disabled={changingKey} onClick={() => { if (showKeyForm) clearKeyForm(); else setShowKeyForm(true); }}>{text.changeKey}</Button>}{token && <Button variant="outline" disabled={changingKey} onClick={() => { setToken(""); setDraft(""); setStats(null); setError(null); setLoading(false); setUpdated(null); clearKeyForm(); }}>{text.logout}</Button>}</div>
      </header>
      {(!token || error) && <Card className="mx-auto max-w-lg">
        <CardHeader><CardTitle>{text.key}</CardTitle></CardHeader>
        <CardContent><form onSubmit={login} className="space-y-4">
          <Label htmlFor="admin-key">{text.key}</Label>
          <Input id="admin-key" type="password" autoComplete="off" required value={draft} onChange={(e) => setDraft(e.target.value)} />
          <p className="text-sm text-muted-foreground">{text.loginNote}</p>
          <Button type="submit" disabled={loading || !draft.trim()}>{loading ? text.loading : text.login}</Button>
        </form></CardContent>
      </Card>}
      {error && <p role="alert" className="rounded-lg border border-destructive p-4 text-destructive">{text[error]}</p>}
      {token && <div className="flex flex-wrap items-center gap-3">
        <Label htmlFor="admin-period">{ru ? "Период" : "Period"}</Label>
        <select id="admin-period" className="rounded-md border bg-background px-3 py-2" value={days} disabled={loading} onChange={(e) => { setDays(Number(e.target.value)); setLoading(true); }}>
          {[7, 30, 90].map((n) => <option key={n} value={n}>{n} {text.days}</option>)}
        </select>
        <Button variant="outline" disabled={loading} onClick={() => { setLoading(true); setRevision((n) => n + 1); }}>{loading ? text.loading : text.refresh}</Button>
        {updated && <span className="text-xs text-muted-foreground">{text.updated}: {formatDate(updated)}</span>}
      </div>}
      {stats && <>
        {showKeyForm && <Card className="max-w-xl">
          <CardHeader><CardTitle>{text.changeKey}</CardTitle></CardHeader>
          <CardContent><form onSubmit={(event) => void changeKey(event)} className="space-y-4">
            <p className="text-sm text-muted-foreground">{text.keyHint}</p>
            <div className="space-y-2"><Label htmlFor="current-admin-key">{text.currentKey}</Label><Input id="current-admin-key" type="password" autoComplete="off" required maxLength={256} disabled={changingKey} value={currentKey} onChange={(event) => setCurrentKey(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="new-admin-key">{text.newKey}</Label><Input id="new-admin-key" type="password" autoComplete="new-password" required minLength={32} maxLength={256} disabled={changingKey} value={newKey} onChange={(event) => setNewKey(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="confirm-admin-key">{text.confirmKey}</Label><Input id="confirm-admin-key" type="password" autoComplete="new-password" required minLength={32} maxLength={256} disabled={changingKey} value={confirmKey} onChange={(event) => setConfirmKey(event.target.value)} /></div>
            {keyError && <p role="alert" className="text-sm text-destructive">{text[keyError]}</p>}
            <div className="flex gap-2"><Button type="submit" disabled={changingKey}>{changingKey ? text.loading : text.saveKey}</Button><Button type="button" variant="outline" disabled={changingKey} onClick={clearKeyForm}>{text.cancel}</Button></div>
          </form></CardContent>
        </Card>}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {metrics.map((key) => <Card key={key}><CardContent className="pt-5"><p className="text-sm text-muted-foreground">{text[key]}</p><p className="mt-2 text-3xl font-semibold">{stats.totals[key].toLocaleString(locale)}</p></CardContent></Card>)}
          <Card><CardContent className="pt-5"><p className="text-sm text-muted-foreground">{text.online}</p><p className="mt-2 text-3xl font-semibold">{stats.online}</p><p className="mt-1 text-xs text-muted-foreground">{text.live}: {stats.liveInterviews}</p></CardContent></Card>
        </div>
        <p className="text-sm text-muted-foreground">{text.since}: {formatDate(stats.since)}. {text.lifetime}: {stats.lifetime.visits} {text.visits.toLowerCase()}, {stats.lifetime.created} {text.created.toLowerCase()}.</p>
        <p className="text-sm text-muted-foreground">{text.note}</p>
        <Card><CardHeader><CardTitle>{text.activity}</CardTitle></CardHeader><CardContent>
          <div className="h-72 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={stats.daily}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="date" tickFormatter={(date: string) => date.slice(5)} minTickGap={24} /><YAxis allowDecimals={false} /><Tooltip /><Legend />
            <Bar dataKey="visits" name={text.visits} fill="#64748b" /><Bar dataKey="created" name={text.created} fill="#3b82f6" /><Bar dataKey="started" name={text.started} fill="#10b981" /><Bar dataKey="ended" name={text.ended} fill="#a855f7" />
          </BarChart></ResponsiveContainer></div>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>{text.languages}</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-3">
          {Object.entries(stats.languages).sort((a, b) => b[1] - a[1]).map(([language, count]) => <span className="rounded-md bg-muted px-3 py-2 text-sm" key={language}>{language}: <strong>{count}</strong></span>)}
          {!Object.keys(stats.languages).length && <p className="text-muted-foreground">{text.empty}</p>}
        </CardContent></Card>
        <Card><CardHeader><CardTitle>{text.recent}</CardTitle></CardHeader><CardContent className="overflow-x-auto">
          <table className="w-full text-left text-sm"><thead><tr className="border-b">{["ID", text.date, text.language, text.status, text.duration].map((label) => <th className="whitespace-nowrap p-3 font-medium" key={label}>{label}</th>)}</tr></thead>
            <tbody>{stats.recent.map((session) => <tr className="border-b" key={session.id}>
              <td className="p-3 font-mono">{session.id}</td><td className="whitespace-nowrap p-3">{formatDate(session.createdAt)}</td><td className="p-3">{session.language}</td>
              <td className="whitespace-nowrap p-3">{session.status === "ended" ? text.closed : session.startedAt ? text.active : text.waiting}</td>
              <td className="whitespace-nowrap p-3">{session.startedAt && session.closedAt ? `${Math.max(0, Math.round((session.closedAt - session.startedAt) / 60000))} ${text.min}` : "—"}</td>
            </tr>)}</tbody>
          </table>
          {!stats.recent.length && <p className="p-3 text-muted-foreground">{text.empty}</p>}
        </CardContent></Card>
      </>}
    </div>
  </main>;
}
