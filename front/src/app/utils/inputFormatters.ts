/**
 * Автоформатирование полей ввода: скобки, тире, кавычки
 */

/** Телефон: +7 (912) 345-67-89 */
export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 0) return "";
  const match = digits
    .replace(/^[78]?/, "")
    .slice(0, 10)
    .match(/^(\d{0,3})(\d{0,3})(\d{0,2})(\d{0,2})$/);
  if (!match) return value;
  const parts = [match[1], match[2], match[3], match[4]].filter(Boolean);
  if (parts.length === 0) return "+7";
  return (
    "+7 (" +
    parts[0] +
    (parts[1] ? ") " + parts[1] : "") +
    (parts[2] ? "-" + parts[2] : "") +
    (parts[3] ? "-" + parts[3] : "")
  );
}

/** Извлечь только цифры из отформатированного телефона */
export function parsePhone(formatted: string): string {
  return formatted.replace(/\D/g, "").replace(/^8?7?/, "7");
}

/** Название компании: ООО «Название» */
export function formatCompanyName(value: string): string {
  const inner = value.replace(/^ООО\s*«?|»?$/g, "").trim();
  if (!inner) return "";
  return `ООО «${inner}»`;
}

/** Извлечь внутреннее название из "ООО «Солнышко»" */
export function parseCompanyName(formatted: string): string {
  const m = formatted.match(/ООО\s*«?(.*?)»?$/);
  return m ? m[1].trim() : formatted.replace(/^ООО\s*«?|»?$/g, "").trim();
}

/** Имя/Фамилия: первая буква заглавная */
export function formatName(value: string): string {
  return value
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ""))
    .join(" ")
    .trim();
}

/** Email: убрать пробелы, lowercase для домена */
export function formatEmail(value: string): string {
  const v = value.replace(/\s/g, "");
  const at = v.indexOf("@");
  if (at < 0) return v;
  const local = v.slice(0, at);
  const domain = v.slice(at + 1).toLowerCase();
  return local + "@" + domain;
}

// Алиасы для использования в формах
export const formatPhoneInput = formatPhone;
export const formatCompanyNameInput = formatCompanyName;
export const formatNameInput = formatName;
export const formatEmailInput = formatEmail;
export const extractPhoneDigits = parsePhone;
