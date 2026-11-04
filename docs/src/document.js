// Shared by every Allowance document. Runs before Paged.js lays out the pages:
// numbers the sections, figures and tables, fills in cross-references
// (<a class="ref" href="#id"></a>), and builds the contents list.
// Paged.js then adds the page numbers to the contents.

// Sequence diagrams are written as data and drawn here, so they all look the same:
//   <script type="application/json" class="sequence">
//     { "participants": ["Person", "Server"],
//       "steps": [["Person", "Server", "Ask"], ["Server", "Person", "Result", "reply"],
//                 { "frame": "If the guard says pay" }, ..., { "end": true }] }
//   </script>
function drawSequences() {
  const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  document.querySelectorAll("script.sequence").forEach((holder, index) => {
    const { participants, steps } = JSON.parse(holder.textContent);
    const W = 640;
    const gap = (W - 120) / (participants.length - 1);
    const x = (name) => {
      const i = participants.indexOf(name);
      if (i < 0) throw new Error(`Unknown participant ${name}`);
      return 60 + i * gap;
    };
    const id = `seq${index}`;
    const body = [];
    const frames = [];
    let y = 52;
    let n = 0;
    for (const step of steps) {
      if (step.frame) {
        frames.push({ label: step.frame, y0: y - 12 });
        y += 18;
        continue;
      }
      if (step.end) {
        frames.findLast((f) => f.y1 === undefined).y1 = y - 10;
        y += 10;
        continue;
      }
      const [from, to, text, kind] = step;
      const label = `${++n}. ${esc(text)}`;
      const reply = kind === "reply";
      if (from === to) {
        const x0 = x(from);
        body.push(`<path class="line" d="M${x0} ${y - 4} H${x0 + 26} V${y + 8} H${x0 + 3}" marker-end="url(#${id})"/>`);
        body.push(`<text class="label" x="${x0 + 32}" y="${y + 6}">${label}</text>`);
        y += 32;
      } else {
        const x0 = x(from);
        const x1 = x(to);
        const end = x1 > x0 ? x1 - 2 : x1 + 2;
        body.push(`<path class="${reply ? "line-soft" : "line"}" d="M${x0} ${y} H${end}" marker-end="url(#${id}${reply ? "s" : ""})"/>`);
        body.push(`<text class="label" x="${(x0 + x1) / 2}" y="${y - 5}" text-anchor="middle">${label}</text>`);
        y += 27;
      }
    }
    const H = y + 6;
    const heads = participants
      .map((p) => {
        const cx = x(p);
        return `<rect class="box-soft" x="${cx - 52}" y="2" width="104" height="26" rx="6"/>
          <text class="name" x="${cx}" y="19.5" text-anchor="middle" style="font-size:11px">${esc(p)}</text>
          <path d="M${cx} 28 V${H - 4}" stroke="#c7c7cc" stroke-width="1"/>`;
      })
      .join("");
    const boxes = frames
      .map((f) => {
        const w = f.label.length * 5.4 + 16;
        return `<rect x="8" y="${f.y0}" width="${W - 16}" height="${f.y1 - f.y0}" fill="none" stroke="#8e8e93" stroke-width="0.8"/>
          <path d="M8 ${f.y0} H${8 + w} V${f.y0 + 11} L${w + 2} ${f.y0 + 16} H8 Z" fill="#f5f5f7" stroke="#8e8e93" stroke-width="0.8"/>
          <text class="label" x="14" y="${f.y0 + 11}" style="font-weight:600">${esc(f.label)}</text>`;
      })
      .join("");
    const svg = `<svg viewBox="0 0 ${W} ${H}" role="img">
      <defs>
        <marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1,1 L9,5 L1,9" fill="none" stroke="#1d1d1f" stroke-width="1.3"/></marker>
        <marker id="${id}s" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1,1 L9,5 L1,9" fill="none" stroke="#8e8e93" stroke-width="1.3"/></marker>
      </defs>${heads}${boxes}${body.join("")}</svg>`;
    holder.insertAdjacentHTML("beforebegin", svg);
    holder.remove();
  });
}

window.PagedConfig = {
  auto: true,
  before: () => {
    drawSequences();
    const toc = document.querySelector(".toc > ol");
    const labels = new Map();
    const n = [0, 0, 0];
    let figures = 0;
    let appendix = null;
    let tables = 0;

    for (const el of document.querySelectorAll("main h1, main h2, main h3, main figure, main .table-caption")) {
      if (el.matches("h1, h2, h3")) {
        const level = Number(el.tagName[1]) - 1;
        n[level]++;
        n.fill(0, level + 1);
        // Appendices are lettered: A, A.1, B ...
        if (level === 0 && el.dataset.appendix) appendix = el.dataset.appendix;
        if (level === 0 && !el.dataset.appendix) appendix = null;
        const num = appendix ? [appendix, ...n.slice(1, level + 1)].join(".") : n.slice(0, level + 1).join(".");
        const title = el.textContent.trim();
        el.id ||= "s-" + num.replaceAll(".", "-");
        const shown = level === 0 && appendix ? `Appendix ${appendix}` : num;
        el.insertAdjacentHTML("afterbegin", `<span class="num${shown === num ? "" : " wide"}">${shown}</span>`);
        labels.set(el.id, level === 0 && appendix ? `appendix ${appendix}` : `section ${num}`);
        if (toc && level < 2) {
          const li = document.createElement("li");
          li.innerHTML = `<a href="#${el.id}"><span class="num">${num}</span>${el.dataset.toc ?? title}<span class="leader"></span></a>`;
          if (level === 0) {
            li.append(document.createElement("ol"));
            toc.append(li);
          } else {
            toc.lastElementChild?.querySelector("ol")?.append(li);
          }
        }
      } else if (el.matches("figure")) {
        figures++;
        el.querySelector("figcaption")?.insertAdjacentHTML("afterbegin", `<b>Figure ${figures}.</b> `);
        if (el.id) labels.set(el.id, `Figure ${figures}`);
      } else {
        tables++;
        el.insertAdjacentHTML("afterbegin", `<b>Table ${tables}.</b> `);
        if (el.id) labels.set(el.id, `Table ${tables}`);
      }
    }

    // Lists of figures and tables, for documents that have them.
    const lists = [
      [".lof > ol", "main figure", (el) => el.querySelector("figcaption")],
      [".lot > ol", "main .table-caption", (el) => el],
    ];
    for (const [where, what, captionOf] of lists) {
      const list = document.querySelector(where);
      if (!list) continue;
      let i = 0;
      for (const el of document.querySelectorAll(what)) {
        i++;
        el.id ||= `${what.includes("figure") ? "f" : "t"}-${i}`;
        const caption = captionOf(el);
        const text = caption.textContent.replace(/^(Figure|Table) \d+\.\s*/, "").split(". ")[0].replace(/\.$/, "");
        const li = document.createElement("li");
        li.innerHTML = `<a href="#${el.id}"><span class="num">${i}</span>${text}<span class="leader"></span></a>`;
        list.append(li);
      }
    }

    for (const a of document.querySelectorAll("a.ref")) {
      a.textContent = labels.get(a.getAttribute("href").slice(1)) ?? "[missing reference]";
    }
  },
  after: () => {
    window.__pagedDone = true;
  },
};
