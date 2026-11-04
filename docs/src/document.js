// Shared by every Allowance document. Runs before Paged.js lays out the pages:
// numbers the sections, figures and tables, fills in cross-references
// (<a class="ref" href="#id"></a>), and builds the contents list.
// Paged.js then adds the page numbers to the contents.

window.PagedConfig = {
  auto: true,
  before: () => {
    const toc = document.querySelector(".toc > ol");
    const labels = new Map();
    const n = [0, 0, 0];
    let figures = 0;
    let tables = 0;

    for (const el of document.querySelectorAll("main h1, main h2, main h3, main figure, main .table-caption")) {
      if (el.matches("h1, h2, h3")) {
        const level = Number(el.tagName[1]) - 1;
        n[level]++;
        n.fill(0, level + 1);
        const num = n.slice(0, level + 1).join(".");
        const title = el.textContent.trim();
        el.id ||= "s-" + num.replaceAll(".", "-");
        el.insertAdjacentHTML("afterbegin", `<span class="num">${num}</span>`);
        labels.set(el.id, `section ${num}`);
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

    for (const a of document.querySelectorAll("a.ref")) {
      a.textContent = labels.get(a.getAttribute("href").slice(1)) ?? "[missing reference]";
    }
  },
  after: () => {
    window.__pagedDone = true;
  },
};
