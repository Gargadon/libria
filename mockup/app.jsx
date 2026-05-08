// Main app
const { useState: useStateApp } = React;

function App() {
  const [t, setTweak] = useTweaks(window.TWEAK_DEFAULTS);
  const [activeId, setActiveId] = useStateApp("ch-1");
  const chapter = window.CHAPTERS.find(c => c.id === activeId);

  const sbSide = t.sidebar; // "left" | "right"

  return (
    <div className={`app app--sb-${sbSide}`} data-screen-label="Libria — Editor">
      <Topbar book={window.BOOK} />
      <div className="layout">
        {sbSide === "left" && (
          <Sidebar chapters={window.CHAPTERS} activeId={activeId} onSelect={setActiveId} side="left" book={window.BOOK} />
        )}
        <Editor chapter={chapter} />
        <Preview chapter={chapter} book={window.BOOK} totalChapters={window.CHAPTERS.length} />
        {sbSide === "right" && (
          <Sidebar chapters={window.CHAPTERS} activeId={activeId} onSelect={setActiveId} side="right" book={window.BOOK} />
        )}
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Disposición" />
        <TweakRadio
          label="Barra lateral"
          value={t.sidebar}
          options={["left", "right"]}
          onChange={(v) => setTweak("sidebar", v)}
        />
        <TweakSection label="Tipografía" />
        <TweakRadio
          label="Cuerpo"
          value={t.bookFont}
          options={["spectral", "lora"]}
          onChange={(v) => setTweak("bookFont", v)}
        />
      </TweaksPanel>
    </div>
  );
}

function Topbar({ book }) {
  return (
    <header className="tb">
      <div className="tb__left">
        <div className="tb__logo">
          <svg viewBox="0 0 28 28" width="22" height="22">
            <rect x="3" y="3" width="22" height="22" rx="2" fill="#1a1612"/>
            <path d="M9 7v14M9 7c3 0 5 1 5 4M9 21c3 0 5-1 5-4M19 7v14M19 7c-3 0-5 1-5 4M19 21c-3 0-5-1-5-4" stroke="#f5efe4" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
          </svg>
        </div>
        <div className="tb__brand">
          <div className="tb__brandN">Libria</div>
          <div className="tb__brandV">2.4 · Atelier</div>
        </div>
        <span className="tb__sep" />
        <div className="tb__bookchip">
          <span className="tb__chipBadge">MS</span>
          <span className="tb__chipT">{book.title}</span>
          <span className="tb__chipMeta">{book.author}</span>
          <span className="tb__chipChev">▾</span>
        </div>
      </div>

      <nav className="tb__nav">
        <button className="tb__nav__b tb__nav__b--on">Manuscrito</button>
        <button className="tb__nav__b">Estilos</button>
        <button className="tb__nav__b">Maquetar</button>
        <button className="tb__nav__b">Generar</button>
      </nav>

      <div className="tb__right">
        <button className="tb__icon" title="Buscar">
          <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5"/><path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </button>
        <button className="tb__icon" title="Notas">
          <svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 3h7l3 3v7H3z" fill="none" stroke="currentColor" strokeWidth="1.5"/><path d="M10 3v3h3" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>
        </button>
        <button className="tb__cta">Generar libro</button>
        <div className="tb__avatar">M</div>
      </div>
    </header>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
