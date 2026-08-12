import type { RiskLevel } from '@taxflow/core';

export function fmtDays(days: number): string {
  if (!Number.isFinite(days)) return '—';
  if (Math.abs(days) < 1) return `${Math.round(days * 24)}h`;
  return `${days % 1 === 0 ? days : days.toFixed(1)}d`;
}

export function fmtRate(perWeek: number): string {
  return `${perWeek.toFixed(perWeek < 10 ? 1 : 0)}/wk`;
}

export function fmtWeeks(weeks: number | null): string {
  if (weeks === null) return 'stalled';
  if (!Number.isFinite(weeks)) return 'stalled';
  return `${weeks.toFixed(1)} wk`;
}

export function fmtMoney(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function fmtHours(hours: number): string {
  return `${Math.round(hours).toLocaleString('en-US')}h`;
}

export const RISK_LABEL: Record<RiskLevel, string> = {
  on_track: 'On track',
  at_risk: 'At risk',
  will_miss: 'Will miss',
};

export const RISK_TONE: Record<RiskLevel, 'ok' | 'warn' | 'bad'> = {
  on_track: 'ok',
  at_risk: 'warn',
  will_miss: 'bad',
};
