// Center pane: the editor itself
function Editor({ chapter, onChange }) {
  if (!chapter) return null;
  const status = chapter.status || (chapter.kind === "chapter" ? "ok" : "front");
  const statusLabel = { ok: "Revisado", draft: "Borrador", outline: "Esbozo", front: "Preliminar", back: "Posliminar" }[status];

  return (
    <main className="ed">
      <div className="ed__bar">
        <div className="ed__crumbs">
          <span className="ed__chip">{chapter.label}</span>
          <span className="ed__sep">›</span>
          <span className="ed__current">{chapter.title}</span>
        </div>
        <div className="ed__tools">
          <button className="ed__t" title="Cursiva">𝐼</button>
          <button className="ed__t" title="Negrita"><b>B</b></button>
          <button className="ed__t" title="Versalitas">SC</button>
          <span className="ed__tsep" />
          <button className="ed__t" title="Salto de escena">✦ ✦ ✦</button>
          <button className="ed__t" title="Letra capital">A̲</button>
          <button className="ed__t" title="Cita en bloque">❝</button>
          <span className="ed__tsep" />
          <button className="ed__t ed__t--text" title="Marcar como revisado">
            <i className={`ed__statusDot ed__statusDot--${status}`} /> {statusLabel}
          </button>
        </div>
      </div>

      <div className="ed__paper">
        <div className="ed__sheet">
          <div className="ed__marg ed__marg--l">
            <ChapterMargin chapter={chapter} />
          </div>

          <article className="ed__doc">
            {chapter.body.map((b, i) => <Block key={i} block={b} />)}
            <div className="ed__end">— fin del fragmento —</div>
          </article>

          <div className="ed__marg ed__marg--r">
            <Notes chapter={chapter} />
          </div>
        </div>
      </div>

      <div className="ed__statbar">
        <span>{(chapter.words || 0).toLocaleString("es-ES")} palabras en este elemento</span>
        <span className="ed__dot2" />
        <span>guardado hace 2 minutos</span>
        <span className="ed__dot2" />
        <span>autoguardado activo</span>
        <span style={{ flex: 1 }} />
        <span>Maquetación · Libria 2.4</span>
      </div>
    </main>
  );
}

function Block({ block }) {
  const b = block;
  switch (b.type) {
    case "halftitle":
      return <h1 className="bk-halftitle">{b.text}</h1>;
    case "title":
      return <h1 className="bk-title">{b.text}</h1>;
    case "subtitle":
      return <div className="bk-subtitle">{b.text}</div>;
    case "author":
      return <div className="bk-author">{b.text}</div>;
    case "publisher":
      return <div className="bk-publisher">{b.text}</div>;
    case "dedication":
      return <div className="bk-dedication">{b.text.split("\n").map((l, i) => <div key={i}>{l}</div>)}</div>;
    case "chapter-num":
      return <div className="bk-chnum">{b.text}</div>;
    case "chapter-title":
      return <h2 className="bk-chtitle">{b.text}</h2>;
    case "h1":
      return <h2 className="bk-h1">{b.text}</h2>;
    case "first-p":
      return (
        <p className="bk-first">
          <span className="bk-drop">{b.drop}</span>
          {b.text}
        </p>
      );
    case "p":
      return <p className="bk-p">{b.text}</p>;
    case "scene-break":
      return <div className="bk-break">✦  ✦  ✦</div>;
    default:
      return null;
  }
}

function ChapterMargin({ chapter }) {
  if (chapter.kind !== "chapter") {
    return (
      <div className="mg">
        <div className="mg__kind">{chapter.kind === "front" ? "Preliminar" : "Posliminar"}</div>
        <div className="mg__hint">No incluido en la numeración del cuerpo</div>
      </div>
    );
  }
  return (
    <div className="mg">
      <div className="mg__kind">Capítulo</div>
      <div className="mg__big">{String(chapter.number).padStart(2, "0")}</div>
      <div className="mg__row"><span>Palabras</span><b>{chapter.words.toLocaleString("es-ES")}</b></div>
      <div className="mg__row"><span>Lectura</span><b>{chapter.readMin} min</b></div>
      <div className="mg__row"><span>Estado</span><b>{(chapter.status || "ok") === "ok" ? "Revisado" : chapter.status === "draft" ? "Borrador" : "Esbozo"}</b></div>
      <div className="mg__sep" />
      <div className="mg__kind">Estilo</div>
      <div className="mg__pill">Encabezado · Cifra romana</div>
      <div className="mg__pill">Ornamento · Asterisco triple</div>
      <div className="mg__pill">Capitular · Tres líneas</div>
    </div>
  );
}

function Notes({ chapter }) {
  const notes = NOTES_BY_ID[chapter.id] || [];
  if (!notes.length) {
    return (
      <div className="mg mg--right">
        <div className="mg__kind">Marginalia</div>
        <div className="mg__hint">Pulsa una línea del texto para añadir una nota.</div>
      </div>
    );
  }
  return (
    <div className="mg mg--right">
      <div className="mg__kind">Marginalia</div>
      {notes.map((n, i) => (
        <div className="note" key={i}>
          <div className="note__t">{n.t}</div>
          <div className="note__b">{n.b}</div>
          <div className="note__by">— {n.by}</div>
        </div>
      ))}
    </div>
  );
}

const NOTES_BY_ID = {
  "ch-1": [
    { t: "Apertura", b: "Considerar abrir con la frase corta. Probar: «La casa me esperaba.»", by: "Marina · 14 mar" },
    { t: "Ritmo", b: "Reducir los adjetivos del segundo párrafo. Tres es suficiente.", by: "Lucía Ferré · editora" },
  ],
  "ch-2": [
    { t: "Continuidad", b: "El reloj del salón debe seguir parado al final del capítulo. Comprobar.", by: "Marina · 02 abr" },
  ],
  "ch-6": [
    { t: "Pendiente", b: "Falta describir el muelle. Añadir 200–300 palabras.", by: "Marina" },
  ],
};

window.Editor = Editor;
