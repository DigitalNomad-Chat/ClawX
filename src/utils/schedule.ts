/**
 * Schedule builder & parser — cron expression ↔ visual config
 * Adapted from OpenClawSwitch cronBuilder / cronParser
 */

export type ScheduleFreq = 'interval' | 'daily' | 'weekly' | 'monthly' | 'custom';

export interface IntervalConfig {
  minutes: number; // 1, 5, 10, 15, 20, 30, 60
}

export interface DailyConfig {
  hour: number;
  minute: number;
}

export interface WeeklyConfig {
  days: number[]; // 0=Sun, 1=Mon ... 6=Sat
  hour: number;
  minute: number;
}

export interface MonthlyConfig {
  day: number; // 1-31
  hour: number;
  minute: number;
}

export type ScheduleConfig =
  | { freq: 'interval'; config: IntervalConfig }
  | { freq: 'daily'; config: DailyConfig }
  | { freq: 'weekly'; config: WeeklyConfig }
  | { freq: 'monthly'; config: MonthlyConfig }
  | { freq: 'custom'; expr: string };

export interface ParsedSchedule {
  freq: ScheduleFreq;
  config: ScheduleConfig;
  description: string;
  isNonStandard: boolean;
}

// ============================================================================
// Constants
// ============================================================================

export const WEEKDAY_OPTIONS = [
  { value: 0, label: '周日' },
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
];

export const INTERVAL_OPTIONS = [
  { value: 1, label: '每分钟' },
  { value: 5, label: '每 5 分钟' },
  { value: 10, label: '每 10 分钟' },
  { value: 15, label: '每 15 分钟' },
  { value: 20, label: '每 20 分钟' },
  { value: 30, label: '每 30 分钟' },
  { value: 60, label: '每小时' },
];

// ============================================================================
// Build: ScheduleConfig → cron string
// ============================================================================

export function buildCronExpr(config: ScheduleConfig): string {
  switch (config.freq) {
    case 'interval': {
      const m = config.config.minutes;
      if (m === 1) return '* * * * *';
      if (m === 60) return '0 * * * *';
      return `*/${m} * * * *`;
    }
    case 'daily':
      return `${config.config.minute} ${config.config.hour} * * *`;
    case 'weekly': {
      const daysExpr = config.config.days.length > 0
        ? config.config.days.sort((a, b) => a - b).join(',')
        : '*';
      return `${config.config.minute} ${config.config.hour} * * ${daysExpr}`;
    }
    case 'monthly':
      return `${config.config.minute} ${config.config.hour} ${config.config.day} * *`;
    case 'custom':
      return config.expr;
  }
}

// ============================================================================
// Parse: cron string → ScheduleConfig
// ============================================================================

export function parseScheduleConfig(expr: string): ParsedSchedule {
  const trimmed = expr.trim();
  if (!trimmed) {
    return {
      freq: 'daily',
      config: { freq: 'daily', config: { hour: 9, minute: 0 } },
      description: '每天 09:00',
      isNonStandard: false,
    };
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length !== 5) {
    return {
      freq: 'custom',
      config: { freq: 'custom', expr: trimmed },
      description: trimmed,
      isNonStandard: true,
    };
  }

  const [minute, hour, day, _month, weekday] = parts;

  // Priority: interval > weekly > monthly > daily > custom
  const parsed =
    tryParseAsInterval(minute, hour, day, weekday) ??
    tryParseAsWeekly(minute, hour, day, weekday) ??
    tryParseAsMonthly(minute, hour, day, weekday) ??
    tryParseAsDaily(minute, hour, day, weekday);

  if (parsed) return parsed;

  return {
    freq: 'custom',
    config: { freq: 'custom', expr: trimmed },
    description: trimmed,
    isNonStandard: false,
  };
}

function tryParseAsInterval(
  minute: string, hour: string, day: string, weekday: string,
): ParsedSchedule | null {
  if (day !== '*' && day !== '?') return null;
  if (weekday !== '*' && weekday !== '?') return null;

  // */N * * * *  → 每 N 分钟
  if (minute.startsWith('*/') && hour === '*') {
    const interval = parseInt(minute.slice(2));
    if (!isNaN(interval) && interval > 0 && interval <= 59) {
      return {
        freq: 'interval',
        config: { freq: 'interval', config: { minutes: interval } },
        description: `每 ${interval} 分钟`,
        isNonStandard: false,
      };
    }
  }

  // * * * * *  → 每分钟
  if (minute === '*' && hour === '*') {
    return {
      freq: 'interval',
      config: { freq: 'interval', config: { minutes: 1 } },
      description: '每分钟',
      isNonStandard: false,
    };
  }

  // 0 * * * * → 每小时
  if (minute === '0' && hour === '*') {
    return {
      freq: 'interval',
      config: { freq: 'interval', config: { minutes: 60 } },
      description: '每小时',
      isNonStandard: false,
    };
  }

  return null;
}

function tryParseAsWeekly(
  minute: string, hour: string, _day: string, weekday: string,
): ParsedSchedule | null {
  if (weekday === '*' || weekday === '?') return null;

  const parsedMinute = parseFixedMinute(minute);
  const parsedHour = parseFixedHour(hour);
  if (parsedMinute === null || parsedHour === null) return null;

  const days = expandWeekdays(weekday);
  if (days.length === 0) return null;

  return {
    freq: 'weekly',
    config: { freq: 'weekly', config: { days, hour: parsedHour, minute: parsedMinute } },
    description: buildWeeklyDesc(days, parsedHour, parsedMinute),
    isNonStandard: false,
  };
}

function tryParseAsMonthly(
  minute: string, hour: string, day: string, weekday: string,
): ParsedSchedule | null {
  if ((day === '*' || day === '?') || (weekday !== '*' && weekday !== '?')) return null;

  const parsedMinute = parseFixedMinute(minute);
  const parsedHour = parseFixedHour(hour);
  if (parsedMinute === null || parsedHour === null) return null;

  const d = parseInt(day);
  if (isNaN(d) || d < 1 || d > 31) return null;

  return {
    freq: 'monthly',
    config: { freq: 'monthly', config: { day: d, hour: parsedHour, minute: parsedMinute } },
    description: `每月 ${d} 日 ${pad(parsedHour)}:${pad(parsedMinute)}`,
    isNonStandard: false,
  };
}

function tryParseAsDaily(
  minute: string, hour: string, day: string, weekday: string,
): ParsedSchedule | null {
  if ((day !== '*' && day !== '?') || (weekday !== '*' && weekday !== '?')) return null;

  const parsedMinute = parseFixedMinute(minute);
  const parsedHour = parseFixedHour(hour);
  if (parsedMinute === null || parsedHour === null) return null;

  return {
    freq: 'daily',
    config: { freq: 'daily', config: { hour: parsedHour, minute: parsedMinute } },
    description: `每天 ${pad(parsedHour)}:${pad(parsedMinute)}`,
    isNonStandard: false,
  };
}

// ============================================================================
// Describe: human-readable text for any cron string
// ============================================================================

export function describeSchedule(expr: string): string {
  const trimmed = expr.trim();
  if (!trimmed) return '未配置';

  const parts = trimmed.split(/\s+/);
  if (parts.length !== 5) return trimmed;

  const [minute, hour, day, _month, weekday] = parts;

  if (minute === '*' && hour === '*') return '每分钟';
  if (minute.startsWith('*/') && hour === '*') {
    const n = parseInt(minute.slice(2));
    return `每 ${n} 分钟`;
  }
  if (hour === '*' && !minute.includes('/') && !minute.includes(',')) {
    return `每小时的第 ${minute} 分钟`;
  }
  if ((day === '*' || day === '?') && (weekday === '*' || weekday === '?')) {
    const h = parseInt(hour);
    const m = parseInt(minute);
    if (!isNaN(h) && !isNaN(m)) return `每天 ${pad(h)}:${pad(m)}`;
  }
  if (weekday !== '*' && weekday !== '?') {
    const days = expandWeekdays(weekday);
    const h = parseFirstNumber(hour);
    const m = parseFirstNumber(minute);
    if (days.length && h !== null && m !== null) {
      return buildWeeklyDesc(days, h, m);
    }
  }
  if (day !== '*' && day !== '?') {
    const h = parseFirstNumber(hour);
    const m = parseFirstNumber(minute);
    if (h !== null && m !== null) {
      const d = parseInt(day);
      if (!isNaN(d)) return `每月 ${d} 日 ${pad(h)}:${pad(m)}`;
    }
  }

  return trimmed;
}

// ============================================================================
// Helpers
// ============================================================================

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function parseFixedMinute(minute: string): number | null {
  if (minute === '*') return null;
  const n = parseInt(minute);
  if (!isNaN(n) && n >= 0 && n <= 59) return n;
  return null;
}

function parseFixedHour(hour: string): number | null {
  if (hour === '*') return null;
  const n = parseInt(hour);
  if (!isNaN(n) && n >= 0 && n <= 23) return n;
  return null;
}

function parseFirstNumber(s: string): number | null {
  const n = parseInt(s);
  return isNaN(n) ? null : n;
}

function expandWeekdays(weekday: string): number[] {
  const days = new Set<number>();
  const segments = weekday.split(',');
  for (const seg of segments) {
    if (seg.includes('-')) {
      const [startStr, endStr] = seg.split('-');
      const start = parseInt(startStr) % 7;
      const end = parseInt(endStr) % 7;
      for (let i = start; ; i = (i + 1) % 7) {
        days.add(i);
        if (i === end) break;
      }
    } else {
      const n = parseInt(seg) % 7;
      if (!isNaN(n)) days.add(n);
    }
  }
  return Array.from(days).sort((a, b) => a - b);
}

function buildWeeklyDesc(days: number[], hour: number, minute: number): string {
  const timeStr = `${pad(hour)}:${pad(minute)}`;
  const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  const workdays = [1, 2, 3, 4, 5];
  if (days.length === 5 && workdays.every((d) => days.includes(d))) {
    return `工作日 ${timeStr}`;
  }
  const allDays = [0, 1, 2, 3, 4, 5, 6];
  if (days.length === 7 && allDays.every((d) => days.includes(d))) {
    return `每天 ${timeStr}`;
  }

  const dayStr = days.map((d) => names[d]).join('、');
  return `${dayStr} ${timeStr}`;
}
