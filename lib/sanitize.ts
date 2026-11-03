// Text from people and from shops is cleaned before it is stored, shown to
// Claude or put on the page. React already escapes what it renders; this is
// about the characters that look harmless but aren't.

// Control characters, except tab and newline.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
// Zero-width characters and direction overrides. They can hide text from a
// person while Claude still reads it, or make "evil.com" display as "moc.live".
const INVISIBLE = /[­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁤⁦-⁯﻿￹-￻]/g;

// NFKC folds look-alike forms into plain ones, so a full-width "ｔａｒｇｅｔ.ｃｏｍ"
// becomes "target.com" before the guard compares shop names.
export function cleanText(value: unknown, max = Infinity): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .replace(INVISIBLE, "")
    .replace(CONTROL, " ")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n[\s]*/g, "\n")
    .trim()
    .slice(0, max)
    .trim();
}

// One line of text: newlines become spaces.
export function cleanLine(value: unknown, max = Infinity): string {
  return cleanText(typeof value === "string" ? value.replace(/\s+/g, " ") : value, max);
}

// Only plain https links, with no user name or password hidden in them.
export function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

// A shop's domain, lower case, without "www.".
export function cleanDomain(value: unknown): string {
  return cleanLine(value, 253)
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/[^a-z0-9.-]/g, "");
}
