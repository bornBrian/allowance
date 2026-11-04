// The mark: a coin with one slice lifted out. An allowance is the share of
// your money you hand over, and only that share.

export function Mark({ size = 34, light = false }: { size?: number; light?: boolean }) {
  const tile = light ? "#ffffff" : "#003087";
  const body = light ? "#003087" : "#ffffff";
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden className="logo-mark">
      <rect width="40" height="40" rx="11" fill={tile} />
      <path d="M19 21.5V10a11.5 11.5 0 1 0 11.5 11.5z" fill={body} />
      <path d="M22 18.5V7A11.5 11.5 0 0 1 33.5 18.5z" fill="#7cc0ff" />
    </svg>
  );
}

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className={light ? "logo light" : "logo"}>
      <Mark light={light} />
      Allowance
    </span>
  );
}
