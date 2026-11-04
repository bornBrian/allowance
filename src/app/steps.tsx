// One numbered line in a short how-it-works list.
export function Step({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <li>
      <span className="num">{String(n).padStart(2, "0")}</span>
      <b>{title}</b>
      <span>{text}</span>
    </li>
  );
}
