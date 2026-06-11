/**
 * Visual Schedule Editor
 * Point-and-click cron schedule configuration.
 * Adapted from OpenClawSwitch CronScheduleEditor.vue
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Clock, Calendar, Code, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  buildCronExpr,
  parseScheduleConfig,
  describeSchedule,
  WEEKDAY_OPTIONS,
  INTERVAL_OPTIONS,
  type ScheduleFreq,
} from '@/utils/schedule';

interface ScheduleEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const FREQ_TABS: Array<{ value: ScheduleFreq; label: string }> = [
  { value: 'interval', label: '间隔' },
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'custom', label: '自定义' },
];

/* ------------------------------------------------------------------ */
//  Time select helpers
/* ------------------------------------------------------------------ */

function TimeSelect({
  value,
  options,
  onChange,
  disabled,
  className,
}: {
  value: number;
  options: { value: number; label: string }[];
  onChange: (v: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn(
          'h-10 rounded-xl border border-input bg-background px-3 py-2 text-sm pr-10 appearance-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
        style={{
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3E%3Cpath d=%22m6 9 6 6 6-6%22/%3E%3C/svg%3E")',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 12px center',
          backgroundSize: '16px 16px',
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: i.toString().padStart(2, '0'),
}));

const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: i * 5,
  label: (i * 5).toString().padStart(2, '0'),
}));

const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => ({
  value: i + 1,
  label: `${i + 1} 日`,
}));

/* ------------------------------------------------------------------ */
//  Component
/* ------------------------------------------------------------------ */

export function ScheduleEditor({ value, onChange, disabled }: ScheduleEditorProps) {
  const [activeFreq, setActiveFreq] = useState<ScheduleFreq>('daily');

  // interval
  const [intervalMinutes, setIntervalMinutes] = useState(5);

  // daily
  const [dailyHour, setDailyHour] = useState(9);
  const [dailyMinute, setDailyMinute] = useState(0);

  // weekly
  const [weeklyDays, setWeeklyDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [weeklyHour, setWeeklyHour] = useState(9);
  const [weeklyMinute, setWeeklyMinute] = useState(0);

  // monthly
  const [monthlyDay, setMonthlyDay] = useState(1);
  const [monthlyHour, setMonthlyHour] = useState(9);
  const [monthlyMinute, setMonthlyMinute] = useState(0);

  // custom
  const [customExpr, setCustomExpr] = useState('');
  const [isNonStandard, setIsNonStandard] = useState(false);

  // sync lock to prevent emit-while-sync loops
  const syncingRef = useRef(false);
  // initializedRef: block emit until first syncFromValue has run
  const initializedRef = useRef(false);

  /* ---------- sync external value → internal state ---------- */
  const syncFromValue = useCallback((expr: string) => {
    if (!expr.trim()) {
      setActiveFreq('daily');
      setDailyHour(9);
      setDailyMinute(0);
      setCustomExpr('');
      setIsNonStandard(false);
      return;
    }

    const parsed = parseScheduleConfig(expr);
    setIsNonStandard(parsed.isNonStandard);

    switch (parsed.freq) {
      case 'interval': {
        const c = parsed.config as { freq: 'interval'; config: { minutes: number } };
        setActiveFreq('interval');
        setIntervalMinutes(c.config.minutes);
        break;
      }
      case 'daily': {
        const c = parsed.config as { freq: 'daily'; config: { hour: number; minute: number } };
        setActiveFreq('daily');
        setDailyHour(c.config.hour);
        setDailyMinute(c.config.minute);
        break;
      }
      case 'weekly': {
        const c = parsed.config as { freq: 'weekly'; config: { days: number[]; hour: number; minute: number } };
        setActiveFreq('weekly');
        setWeeklyDays(c.config.days);
        setWeeklyHour(c.config.hour);
        setWeeklyMinute(c.config.minute);
        break;
      }
      case 'monthly': {
        const c = parsed.config as { freq: 'monthly'; config: { day: number; hour: number; minute: number } };
        setActiveFreq('monthly');
        setMonthlyDay(c.config.day);
        setMonthlyHour(c.config.hour);
        setMonthlyMinute(c.config.minute);
        break;
      }
      case 'custom': {
        const c = parsed.config as { freq: 'custom'; expr: string };
        setActiveFreq('custom');
        setCustomExpr(c.expr);
        break;
      }
    }
  }, []);

  useEffect(() => {
    if (syncingRef.current) return;
    if (initializedRef.current) return;
    initializedRef.current = true;
    syncFromValue(value);
  }, [value, syncFromValue]);

  /* ---------- build current expression ---------- */
  const buildCurrentExpr = useCallback((): string => {
    switch (activeFreq) {
      case 'interval':
        return buildCronExpr({ freq: 'interval', config: { minutes: intervalMinutes } });
      case 'daily':
        return buildCronExpr({ freq: 'daily', config: { hour: dailyHour, minute: dailyMinute } });
      case 'weekly':
        return buildCronExpr({ freq: 'weekly', config: { days: weeklyDays, hour: weeklyHour, minute: weeklyMinute } });
      case 'monthly':
        return buildCronExpr({ freq: 'monthly', config: { day: monthlyDay, hour: monthlyHour, minute: monthlyMinute } });
      case 'custom':
        return customExpr;
    }
  }, [activeFreq, intervalMinutes, dailyHour, dailyMinute, weeklyDays, weeklyHour, weeklyMinute, monthlyDay, monthlyHour, monthlyMinute, customExpr]);

  const generatedExpr = buildCurrentExpr();
  const description = describeSchedule(generatedExpr);

  /* ---------- emit internal state → external ---------- */
  useEffect(() => {
    if (!initializedRef.current) return;
    if (syncingRef.current) return;
    if (generatedExpr === value) return;
    syncingRef.current = true;
    onChange(generatedExpr);
    const timer = setTimeout(() => {
      syncingRef.current = false;
    }, 0);
    return () => clearTimeout(timer);
  }, [generatedExpr, onChange, value]);

  /* ---------- weekday toggle ---------- */
  const toggleWeekday = (day: number) => {
    setWeeklyDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
    );
  };

  return (
    <div className={cn('flex flex-col gap-3', disabled && 'opacity-60 pointer-events-none')}>
      {/* Tabs */}
      <Tabs value={activeFreq} onValueChange={(v) => setActiveFreq(v as ScheduleFreq)}>
        <TabsList className="w-full grid grid-cols-5 h-10 rounded-xl bg-muted p-1">
          {FREQ_TABS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              disabled={disabled}
              className="rounded-lg text-sm font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Interval */}
        <TabsContent value="interval" className="mt-3 space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">执行频率</span>
            <TimeSelect
              value={intervalMinutes}
              options={INTERVAL_OPTIONS}
              onChange={setIntervalMinutes}
              disabled={disabled}
            />
          </div>
          <ExprPreview expr={generatedExpr} description={description} />
        </TabsContent>

        {/* Daily */}
        <TabsContent value="daily" className="mt-3 space-y-3">
          <div className="flex items-center gap-3">
            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground">执行时间</span>
            <TimeSelect value={dailyHour} options={HOUR_OPTIONS} onChange={setDailyHour} disabled={disabled} />
            <span className="text-lg font-semibold text-foreground">:</span>
            <TimeSelect value={dailyMinute} options={MINUTE_OPTIONS} onChange={setDailyMinute} disabled={disabled} />
          </div>
          <ExprPreview expr={generatedExpr} description={description} />
        </TabsContent>

        {/* Weekly */}
        <TabsContent value="weekly" className="mt-3 space-y-3">
          <div className="space-y-2">
            <span className="text-sm text-muted-foreground">重复日期</span>
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_OPTIONS.map((day) => {
                const active = weeklyDays.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleWeekday(day.value)}
                    className={cn(
                      'px-3 py-1.5 rounded-xl border text-sm font-medium transition-all',
                      active
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'bg-background border-input text-muted-foreground hover:border-primary/50 hover:text-foreground',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                    )}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground">执行时间</span>
            <TimeSelect value={weeklyHour} options={HOUR_OPTIONS} onChange={setWeeklyHour} disabled={disabled} />
            <span className="text-lg font-semibold text-foreground">:</span>
            <TimeSelect value={weeklyMinute} options={MINUTE_OPTIONS} onChange={setWeeklyMinute} disabled={disabled} />
          </div>
          <ExprPreview expr={generatedExpr} description={description} />
        </TabsContent>

        {/* Monthly */}
        <TabsContent value="monthly" className="mt-3 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground">每月</span>
            <TimeSelect value={monthlyDay} options={DAY_OPTIONS} onChange={setMonthlyDay} disabled={disabled} />
            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
            <TimeSelect value={monthlyHour} options={HOUR_OPTIONS} onChange={setMonthlyHour} disabled={disabled} />
            <span className="text-lg font-semibold text-foreground">:</span>
            <TimeSelect value={monthlyMinute} options={MINUTE_OPTIONS} onChange={setMonthlyMinute} disabled={disabled} />
          </div>
          <ExprPreview expr={generatedExpr} description={description} />
        </TabsContent>

        {/* Custom */}
        <TabsContent value="custom" className="mt-3 space-y-3">
          {isNonStandard && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-sm text-yellow-700 dark:text-yellow-400">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>此任务使用非标准调度格式，修改后将以标准 Cron 表达式保存</span>
            </div>
          )}
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground shrink-0">Cron 表达式</span>
            <Input
              value={customExpr}
              onChange={(e) => setCustomExpr(e.target.value)}
              placeholder="0 9 * * *"
              disabled={disabled}
              className="h-10 rounded-xl font-mono text-sm bg-background border-input focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          {customExpr.trim() && (
            <div className="text-sm text-primary font-medium">{description}</div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------------------------------------------ */
//  Sub-components
/* ------------------------------------------------------------------ */

function ExprPreview({ expr, description }: { expr: string; description: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/60">
        <Code className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="font-mono text-xs text-muted-foreground select-all">{expr}</span>
      </div>
      <p className="text-sm text-primary font-medium">{description}</p>
    </div>
  );
}
