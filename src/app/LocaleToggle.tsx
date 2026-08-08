import { Languages } from "lucide-react";
import { useI18n, type Locale } from "@/app/i18n";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const options: Array<{ value: Locale; label: string }> = [
  { value: "ru", label: "RU" },
  { value: "en", label: "EN" },
];

export function LocaleToggle() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className="flex items-center gap-1 rounded-lg border bg-card p-1" aria-label={t("locale.label")}>
      <Languages className="ml-1 h-3.5 w-3.5 text-muted-foreground" />
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="sm"
          variant={locale === option.value ? "default" : "ghost"}
          className={cn("h-7 px-2 text-xs", locale !== option.value && "text-muted-foreground")}
          onClick={() => setLocale(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
