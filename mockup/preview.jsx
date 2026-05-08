// Right pane: live Kindle e-ink preview
function Preview({ chapter, book, totalChapters }) {
  if (!chapter) return null;
  const isChapter = chapter.kind === "chapter";
  const pageNum = estimatePage(chapter);
  const totalPages = 312;

  return (
    <section className="pv">
      <div className="pv__head">
        <div className="pv__tabs">
          <button className="pv__tab pv__tab--on">Kindle</button>
          <button className="pv__tab" disabled>iPhone</button>
          <button className="pv__tab" disabled>Impresión</button>
        </div>
        <div className="pv__zoom">
          <button>－</button><span>87%</span><button>＋</button>
        </div>
      </div>

      <div className="pv__stage">
        <div className="kindle">
          <div className="kindle__bezel">
            <div className="kindle__brand">kindle</div>
            <div className="kindle__screen">
              <div className="kindle__statusbar">
                <span className="kindle__bookname">{book.title}</span>
                <span className="kindle__icons">
                  <Wifi /><Battery />
                </span>
              </div>

              <div className="kindle__page">
                <KindlePage chapter={chapter} />
              </div>

              <div className="kindle__footer">
                <span>Pos. {pageNum} de {totalPages}</span>
                <span className="kindle__progress">
                  <span className="kindle__pfill" style={{ width: Math.round((pageNum / totalPages) * 100) + "%" }} />
                </span>
                <span>{Math.round((pageNum / totalPages) * 100)}%</span>
              </div>
            </div>
            <div className="kindle__chinrow">
              <div className="kindle__pageBtn" />
              <div className="kindle__home" />
              <div className="kindle__pageBtn" />
            </div>
          </div>
        </div>
      </div>

      <div className="pv__foot">
        <div className="pv__metric">
          <div className="pv__mN">{totalPages}</div>
          <div className="pv__mL">páginas estimadas</div>
        </div>
        <div className="pv__metric">
          <div className="pv__mN">Bookerly</div>
          <div className="pv__mL">tipografía e‑ink</div>
        </div>
        <div className="pv__metric">
          <div className="pv__mN">A4 → 5×8″</div>
          <div className="pv__mL">también disponible</div>
        </div>
        <button className="pv__exp">Generar archivos · EPUB · MOBI · PDF</button>
      </div>
    </section>
  );
}

function KindlePage({ chapter }) {
  const blocks = chapter.body;
  return (
    <div className={`kp ${chapter.kind === "chapter" ? "kp--chap" : `kp--${chapter.kind}`}`}>
      {blocks.map((b, i) => <KBlock key={i} block={b} />)}
    </div>
  );
}

function KBlock({ block: b }) {
  switch (b.type) {
    case "halftitle": return <h1 className="kp-halftitle">{b.text}</h1>;
    case "title": return <h1 className="kp-title">{b.text}</h1>;
    case "subtitle": return <div className="kp-sub">{b.text}</div>;
    case "author": return <div className="kp-author">{b.text}</div>;
    case "publisher": return <div className="kp-pub">{b.text}</div>;
    case "dedication": return <div className="kp-ded">{b.text.split("\n").map((l, i) => <div key={i}>{l}</div>)}</div>;
    case "chapter-num": return <div className="kp-chnum">{b.text}</div>;
    case "chapter-title": return <h2 className="kp-chtitle">{b.text}</h2>;
    case "h1": return <h2 className="kp-h1">{b.text}</h2>;
    case "first-p":
      return (
        <p className="kp-first">
          <span className="kp-drop">{b.drop}</span>
          {b.text}
        </p>
      );
    case "p": return <p className="kp-p">{b.text}</p>;
    case "scene-break": return <div className="kp-break">✦  ✦  ✦</div>;
    default: return null;
  }
}

function estimatePage(chapter) {
  const idx = window.CHAPTERS.findIndex(c => c.id === chapter.id);
  let p = 1;
  for (let i = 0; i < idx; i++) {
    const c = window.CHAPTERS[i];
    p += Math.max(1, Math.round((c.words || 30) / 220));
  }
  return p;
}

function Wifi() {
  return <svg viewBox="0 0 16 12" width="14" height="10"><path d="M8 9.5a1 1 0 100 2 1 1 0 000-2zM3.5 6.5l1.4 1.4a4 4 0 016.2 0l1.4-1.4a6 6 0 00-9 0zM1 4l1.4 1.4a8 8 0 0111.2 0L15 4a10 10 0 00-14 0z" fill="currentColor"/></svg>;
}
function Battery() {
  return <svg viewBox="0 0 24 12" width="22" height="10"><rect x="0.5" y="0.5" width="20" height="11" rx="1.5" fill="none" stroke="currentColor"/><rect x="21.5" y="3.5" width="2" height="5" fill="currentColor"/><rect x="2" y="2" width="13" height="8" fill="currentColor"/></svg>;
}

window.Preview = Preview;
