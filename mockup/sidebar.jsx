// Left pane: chapter outline / book navigator
const { useState, useMemo } = React;

function Sidebar({ chapters, activeId, onSelect, side, book }) {
  const totalWords = useMemo(
    () => chapters.reduce((s, c) => s + (c.words || 0), 0),
    [chapters]
  );
  const totalRead = useMemo(
    () => chapters.filter(c => c.kind === "chapter").reduce((s, c) => s + (c.readMin || 0), 0),
    [chapters]
  );
  const maxWords = Math.max(...chapters.map(c => c.words || 0));

  const front = chapters.filter(c => c.kind === "front");
  const main  = chapters.filter(c => c.kind === "chapter");
  const back  = chapters.filter(c => c.kind === "back");

  return (
    <aside className={`sb sb--${side}`}>
      <div className="sb__head">
        <div className="sb__crumb">
          <span className="sb__dot" />
          <span>Biblioteca / Manuscritos</span>
        </div>
        <div className="sb__title">{book.title}</div>
        <div className="sb__author">por {book.author}</div>

        <div className="sb__stats">
          <div className="sb__stat">
            <div className="sb__statN">{totalWords.toLocaleString("es-ES")}</div>
            <div className="sb__statL">palabras</div>
          </div>
          <div className="sb__stat">
            <div className="sb__statN">~{totalRead}<span>m</span></div>
            <div className="sb__statL">lectura</div>
          </div>
          <div className="sb__stat">
            <div className="sb__statN">{main.length}</div>
            <div className="sb__statL">capítulos</div>
          </div>
        </div>
      </div>

      <SbGroup label="Preliminares" items={front} activeId={activeId} onSelect={onSelect} maxWords={maxWords} />
      <SbGroup label="Cuerpo de la obra" items={main} activeId={activeId} onSelect={onSelect} maxWords={maxWords} numbered />
      <SbGroup label="Posliminares" items={back} activeId={activeId} onSelect={onSelect} maxWords={maxWords} />

      <div className="sb__foot">
        <button className="sb__add">＋ Añadir elemento</button>
        <div className="sb__legend">
          <span><i className="lg lg--ok"/> revisado</span>
          <span><i className="lg lg--draft"/> borrador</span>
          <span><i className="lg lg--out"/> esbozo</span>
        </div>
      </div>
    </aside>
  );
}

function SbGroup({ label, items, activeId, onSelect, maxWords, numbered }) {
  return (
    <div className="sbg">
      <div className="sbg__label">{label}</div>
      <ul className="sbg__list">
        {items.map((c, i) => {
          const pct = c.words ? Math.max(4, Math.round((c.words / maxWords) * 100)) : 6;
          const status = c.status || (c.kind === "chapter" ? "ok" : "front");
          return (
            <li key={c.id}>
              <button
                className={`sbi ${activeId === c.id ? "sbi--on" : ""}`}
                onClick={() => onSelect(c.id)}
              >
                <span className="sbi__num">
                  {numbered ? String(c.number).padStart(2, "0") : "·"}
                </span>
                <span className="sbi__body">
                  <span className="sbi__t">{c.title}</span>
                  <span className="sbi__bar">
                    <span
                      className={`sbi__fill sbi__fill--${status}`}
                      style={{ width: pct + "%" }}
                    />
                  </span>
                  <span className="sbi__meta">
                    {c.words ? c.words.toLocaleString("es-ES") + " palabras" : "—"}
                    {c.readMin ? ` · ${c.readMin} min` : ""}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

window.Sidebar = Sidebar;
