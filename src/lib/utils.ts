import clsx, { type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const SYMBOLS: Record<string, string> = { USD: "$", ZWG: "ZWG ", ZAR: "R", BWP: "P", GBP: "£", EUR: "€" };

export function money(amount: number | null | undefined, currency = "USD") {
  const n = amount ?? 0;
  const sym = SYMBOLS[currency] ?? currency + " ";
  const s = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? "-" : "") + sym + s;
}

export function num(v: FormDataEntryValue | null | undefined, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

export function optNum(v: FormDataEntryValue | null | undefined): number | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function str(v: FormDataEntryValue | null | undefined): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

export function optStr(v: FormDataEntryValue | null | undefined): string | null {
  const s = str(v);
  return s === "" ? null : s;
}

export function optDate(v: FormDataEntryValue | null | undefined): Date | null {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function fmtDate(d: Date | string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" }) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", opts);
}

export function fmtDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function fmtTime(d: Date | string) {
  return new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function isoDate(d: Date | string | null | undefined) {
  if (!d) return "";
  const x = new Date(d);
  const off = x.getTimezoneOffset();
  return new Date(x.getTime() - off * 60000).toISOString().slice(0, 10);
}

export function isoDateTimeLocal(d: Date | string) {
  const x = new Date(d);
  const off = x.getTimezoneOffset();
  return new Date(x.getTime() - off * 60000).toISOString().slice(0, 16);
}

export function addMonths(d: Date, months: number) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + months);
  return x;
}

export function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 86400000);
}

export function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function fullName(p: { firstName: string; lastName: string }) {
  return [p.firstName, p.lastName].filter(Boolean).join(" ");
}

export function age(dob: Date | string | null | undefined) {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (365.25 * 86400000));
}

/** Format a dioptre value with explicit sign, e.g. +1.25 / -0.75 */
export function dioptre(v: number | null | undefined) {
  if (v === null || v === undefined) return "—";
  if (v === 0) return "Plano";
  return (v > 0 ? "+" : "") + v.toFixed(2);
}

export function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);
}

/** Normalise a Zimbabwean or international phone number to E.164 (+263...). */
export function toE164(phone: string | null | undefined, defaultCc = "263") {
  if (!phone) return "";
  const p = phone.replace(/[^\d+]/g, "");
  if (p.startsWith("+")) return p;
  if (p.startsWith("00")) return "+" + p.slice(2);
  if (p.startsWith("0")) return "+" + defaultCc + p.slice(1);
  if (p.startsWith(defaultCc)) return "+" + p;
  return "+" + defaultCc + p;
}

/** A date picked in a form: today's date keeps the current time; other days are set to midday local time. */
export function formDate(v: FormDataEntryValue | null | undefined): Date {
  const s = str(v);
  if (!s || s === isoDate(new Date())) return new Date();
  const d = new Date(`${s}T12:00:00`);
  return isNaN(d.getTime()) ? new Date() : d;
}
