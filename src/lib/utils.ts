import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

/** Formats an ISO timestamp to "06 jul às 23h14" (pt-BR friendly) */
export function formatTimestamp(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const day = String(d.getDate()).padStart(2, "0");
    const monthNames = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
    const mon = monthNames[d.getMonth()];
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${day} ${mon} às ${h}h${min}`;
  } catch {
    return isoStr;
  }
}

export function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export function isoToDate(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00");
}

export function dateToISO(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function monthName(month: number): string {
  const names = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  return names[month - 1] ?? "";
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function firstDayOfMonth(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}
