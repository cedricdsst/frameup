"use client";

import { useMemo, useState } from "react";

type Count = 4 | 6 | 9;
type Quality = "low" | "medium" | "high";
type Card = { id: number; title: string; prompt: string; image?: string; loading?: boolean };

const INITIAL_TITLES = [
  "Le déclic", "La méthode", "L'erreur", "Le résultat", "Le secret",
  "L'astuce", "Le test", "La surprise", "À retenir",
];
const COLORS = ["#f2ff55", "#ff7a59", "#b8a7ff", "#5ee6c3", "#ffb4d1", "#77b9ff", "#f8f4eb", "#191919"];

function makeCards(count: Count, previous: Card[] = []): Card[] {
  return Array.from({ length: count }, (_, index) => previous[index] ?? {
    id: Date.now() + index,
    title: INITIAL_TITLES[index],
    prompt: "",
  });
}

function Icon({ name }: { name: "spark" | "download" | "image" | "key" }) {
  const paths = {
    spark: <path d="m12 2 1.4 5.1L18 9l-4.6 1.9L12 16l-1.4-5.1L6 9l4.6-1.9L12 2Zm6 12 .7 2.3L21 17l-2.3.7L18 20l-.7-2.3L15 17l2.3-.7L18 14Z" />,
    download: <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 18v2h14v-2" />,
    image: <><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m5 18 5-5 3 3 2-2 4 4"/></>,
    key: <><circle cx="8" cy="12" r="3"/><path d="M11 12h10m-3 0v3m-3-3v2"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

export default function Home() {
  const [count, setCount] = useState<Count>(6);
  const [cards, setCards] = useState<Card[]>(() => makeCards(6));
  const [background, setBackground] = useState("#f2ff55");
  const [title, setTitle] = useState("7 IDÉES QUI CHANGENT TOUT");
  const [titlePrompt, setTitlePrompt] = useState("Typographie éditoriale audacieuse, énergie pop, contraste très fort");
  const [titleImage, setTitleImage] = useState<string>();
  const [titleLoading, setTitleLoading] = useState(false);
  const [sharedPrompt, setSharedPrompt] = useState("Illustration 3D colorée, lumière studio douce, objets sur fond minimaliste");
  const [quality, setQuality] = useState<Quality>("medium");
  const [message, setMessage] = useState<string>();
  const [generatingAll, setGeneratingAll] = useState(false);
  const columns = count === 9 ? 3 : 2;
  const rows = count / columns;
  const progress = useMemo(() => [titleImage, ...cards.map((card) => card.image)].filter(Boolean).length, [titleImage, cards]);

  function chooseCount(next: Count) {
    setCount(next);
    setCards((current) => makeCards(next, current));
  }

  function updateCard(index: number, patch: Partial<Card>) {
    setCards((current) => current.map((card, i) => i === index ? { ...card, ...patch } : card));
  }

  async function requestImage(kind: "title" | "card", imageTitle: string, prompt: string) {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, title: imageTitle, prompt, style: kind === "card" ? sharedPrompt : "", quality }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "La génération a échoué.");
    return data.image as string;
  }

  async function generateTitle() {
    setMessage(undefined);
    setTitleLoading(true);
    try { setTitleImage(await requestImage("title", title, titlePrompt)); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Erreur inconnue"); }
    finally { setTitleLoading(false); }
  }

  async function generateCard(index: number) {
    const card = cards[index];
    setMessage(undefined);
    updateCard(index, { loading: true });
    try { updateCard(index, { image: await requestImage("card", card.title, card.prompt), loading: false }); }
    catch (error) {
      updateCard(index, { loading: false });
      setMessage(error instanceof Error ? error.message : "Erreur inconnue");
      throw error;
    }
  }

  async function generateAll() {
    setGeneratingAll(true);
    setMessage(undefined);
    try {
      if (!titleImage) await generateTitle();
      for (let index = 0; index < cards.length; index++) {
        if (!cards[index].image) await generateCard(index);
      }
      setMessage("Tous les visuels sont prêts.");
    } catch { /* Le détail est affiché par la génération concernée. */ }
    finally { setGeneratingAll(false); }
  }

  async function exportPng() {
    setMessage("Préparation du PNG…");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1080; canvas.height = 1920;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = background; ctx.fillRect(0, 0, 1080, 1920);
      const margin = 64, gap = 28, bannerY = 82, bannerH = 340;
      await drawTile(ctx, titleImage, margin, bannerY, 1080 - margin * 2, bannerH, "TITRE", 36);
      if (!titleImage) drawWrappedText(ctx, title, 540, bannerY + bannerH / 2, 850, 64, 3, "center", "800");

      const gridTop = 482, gridBottom = 1810;
      const cellW = (1080 - margin * 2 - gap * (columns - 1)) / columns;
      const cellH = (gridBottom - gridTop - gap * (rows - 1)) / rows;
      const labelH = count === 9 ? 76 : 92;
      for (let i = 0; i < cards.length; i++) {
        const col = i % columns, row = Math.floor(i / columns);
        const x = margin + col * (cellW + gap), y = gridTop + row * (cellH + gap);
        await drawTile(ctx, cards[i].image, x, y, cellW, cellH - labelH, String(i + 1).padStart(2, "0"), 28);
        ctx.fillStyle = background === "#191919" ? "#fff" : "#111";
        drawWrappedText(ctx, cards[i].title, x + cellW / 2, y + cellH - labelH / 2 + 6, cellW - 14, count === 9 ? 29 : 36, 2, "center", "800");
      }
      ctx.fillStyle = background === "#191919" ? "rgba(255,255,255,.65)" : "rgba(0,0,0,.48)";
      ctx.font = "600 23px Arial"; ctx.textAlign = "center"; ctx.fillText("FRAMEUP • 9:16", 540, 1870);
      const link = document.createElement("a");
      link.download = `tiktok-${title.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "cover"}.png`;
      link.href = canvas.toDataURL("image/png", 1); link.click();
      setMessage("PNG 1080 × 1920 exporté.");
    } catch { setMessage("Impossible d’exporter : vérifiez que toutes les images sont chargées."); }
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#"><span>F</span> FRAMEUP</a>
        <div className="top-actions">
          <span className="format-pill">9:16 <i /> TikTok</span>
          <button className="button dark" onClick={exportPng}><Icon name="download" /> Exporter PNG</button>
        </div>
      </header>

      <section className="hero">
        <div><span className="eyebrow"><Icon name="spark" /> AI COVER STUDIO</span><h1>Transformez vos idées<br />en <em>scroll-stoppers.</em></h1></div>
        <p>Composez une couverture TikTok qui attire l’œil.<br />Choisissez votre grille, dirigez l’IA, exportez.</p>
      </section>

      <div className="workspace">
        <aside className="controls">
          <section className="panel">
            <div className="step"><b>01</b><div><h2>Structure</h2><p>Choisissez le nombre de sujets.</p></div></div>
            <div className="layout-picker">
              {([4, 6, 9] as Count[]).map((value) => {
                const cols = value === 9 ? 3 : 2;
                return <button key={value} className={count === value ? "active" : ""} onClick={() => chooseCount(value)}>
                  <span className="mini-grid" style={{ gridTemplateColumns: `repeat(${cols},1fr)` }}>{Array.from({ length: value }, (_, i) => <i key={i} />)}</span>
                  <strong>{value} images</strong><small>{cols} × {value / cols}</small>
                </button>;
              })}
            </div>
            <label className="field-label">Couleur du fond</label>
            <div className="colors">{COLORS.map((color) => <button key={color} aria-label={color} className={background === color ? "selected" : ""} style={{ background: color }} onClick={() => setBackground(color)} />)}<label className="custom-color">+<input type="color" value={background} onChange={(e) => setBackground(e.target.value)} /></label></div>
          </section>

          <section className="panel">
            <div className="step"><b>02</b><div><h2>Bannière titre</h2><p>Le premier impact de votre vidéo.</p></div></div>
            <label className="field-label" htmlFor="main-title">Texte exact du titre</label>
            <input id="main-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <label className="field-label" htmlFor="title-prompt">Direction artistique</label>
            <textarea id="title-prompt" value={titlePrompt} onChange={(e) => setTitlePrompt(e.target.value)} rows={3} />
            <button className="button accent full" onClick={generateTitle} disabled={titleLoading}><Icon name="spark" />{titleLoading ? "Création en cours…" : titleImage ? "Regénérer la bannière" : "Générer la bannière"}</button>
            <p className="secure"><Icon name="key" /> Contraintes techniques ajoutées côté serveur</p>
          </section>

          <section className="panel">
            <div className="step"><b>03</b><div><h2>Direction visuelle</h2><p>Commune à toutes les vignettes.</p></div></div>
            <textarea value={sharedPrompt} onChange={(e) => setSharedPrompt(e.target.value)} rows={4} />
            <div className="quality"><span>Qualité</span>{(["low", "medium", "high"] as Quality[]).map((q) => <button key={q} className={quality === q ? "active" : ""} onClick={() => setQuality(q)}>{q === "low" ? "Brouillon" : q === "medium" ? "Standard" : "Haute"}</button>)}</div>
          </section>

          <section className="panel cards-editor">
            <div className="step"><b>04</b><div><h2>Vos {count} sujets</h2><p>Un titre et une idée par image.</p></div></div>
            {cards.map((card, index) => <div className="card-form" key={card.id}>
              <span className="card-number">{String(index + 1).padStart(2, "0")}</span>
              <div><input aria-label={`Titre ${index + 1}`} value={card.title} onChange={(e) => updateCard(index, { title: e.target.value })} /><textarea aria-label={`Prompt ${index + 1}`} placeholder="Décrivez le sujet de l’image…" rows={2} value={card.prompt} onChange={(e) => updateCard(index, { prompt: e.target.value })} /></div>
              <button aria-label={`Générer l’image ${index + 1}`} onClick={() => generateCard(index)} disabled={card.loading}><Icon name="spark" /></button>
            </div>)}
          </section>
        </aside>

        <section className="preview-column">
          <div className="preview-head"><div><span>APERÇU EN DIRECT</span><strong>1080 × 1920 px</strong></div><span className="progress">{progress}/{count + 1} visuels</span></div>
          <div className="phone-wrap">
            <div className="phone" style={{ background }}>
              <div className={`banner ${titleLoading ? "loading" : ""}`} style={titleImage ? { background } : undefined}>
                {titleImage ? <img src={titleImage} alt="Bannière générée" /> : <div className="banner-placeholder"><small>VOTRE TITRE ICI</small><strong>{title}</strong></div>}
                {titleLoading && <span className="loader"><Icon name="spark" /></span>}
              </div>
              <div className="cover-grid" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
                {cards.map((card, index) => <div className="cover-card" key={card.id}>
                  <div className={`cover-image theme-${index % 6} ${card.loading ? "loading" : ""}`} style={card.image ? { background } : undefined}>
                    {card.image ? <img src={card.image} alt={card.title} /> : <><Icon name="image" /><span>{String(index + 1).padStart(2, "0")}</span></>}
                    {card.loading && <span className="loader"><Icon name="spark" /></span>}
                  </div>
                  <strong style={{ color: background === "#191919" ? "white" : "#111" }}>{card.title || `Sujet ${index + 1}`}</strong>
                </div>)}
              </div>
              <span className="watermark" style={{ color: background === "#191919" ? "white" : "#111" }}>FRAMEUP • 9:16</span>
            </div>
          </div>
          {message && <div className={message.includes("absente") || message.includes("échoué") || message.includes("Impossible") ? "notice error" : "notice"}>{message}</div>}
          <div className="generate-bar"><div><strong>{progress === count + 1 ? "Votre cover est prête" : "Prêt à créer ?"}</strong><span>{progress}/{count + 1} images générées</span></div><button className="button dark" onClick={generateAll} disabled={generatingAll}><Icon name="spark" />{generatingAll ? "Génération…" : "Tout générer"}</button></div>
        </section>
      </div>
    </main>
  );
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = source; });
}

async function drawTile(ctx: CanvasRenderingContext2D, source: string | undefined, x: number, y: number, width: number, height: number, label: string, radius: number) {
  ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.clip();
  if (source) {
    const image = await loadImage(source); const scale = Math.min(width / image.width, height / image.height);
    ctx.drawImage(image, x + (width - image.width * scale) / 2, y + (height - image.height * scale) / 2, image.width * scale, image.height * scale);
  } else {
    const gradient = ctx.createLinearGradient(x, y, x + width, y + height); gradient.addColorStop(0, "#372b45"); gradient.addColorStop(1, "#ff7a59"); ctx.fillStyle = gradient; ctx.fillRect(x, y, width, height);
    ctx.fillStyle = "rgba(255,255,255,.8)"; ctx.font = `800 ${Math.min(width, height) * .18}px Arial`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(label, x + width / 2, y + height / 2);
  }
  ctx.restore();
}

function drawWrappedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, fontSize: number, maxLines: number, align: CanvasTextAlign, weight: string) {
  ctx.font = `${weight} ${fontSize}px Arial`; ctx.textAlign = align; ctx.textBaseline = "middle";
  const words = text.split(/\s+/); const lines: string[] = []; let line = "";
  for (const word of words) { const test = line ? `${line} ${word}` : word; if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; } else line = test; }
  if (line) lines.push(line); const shown = lines.slice(0, maxLines); const lineH = fontSize * 1.08; shown.forEach((value, i) => ctx.fillText(value, x, y - ((shown.length - 1) * lineH) / 2 + i * lineH));
}
