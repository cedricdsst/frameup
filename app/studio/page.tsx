"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type TextareaHTMLAttributes } from "react";
import { STUDIO_PLAN_STORAGE_KEY, type StudioPlan } from "../../lib/studio-plan";
import {
  CoverArtwork,
  DEFAULT_IMAGE_TRANSFORM,
  type ArtworkImageTransform,
} from "./CoverArtwork";

const COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

type Count = (typeof COUNTS)[number];
type Card = { id: number; title: string; prompt: string; style: string; image?: string; loading?: boolean };
type GenerationJob = {
  run: () => Promise<string>;
  succeed: (image: string) => void;
  fail: () => void;
};

class ImageGenerationError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfterMs: number) {
    super(message);
  }
}

const INITIAL_TITLES = [
  "Le déclic", "La méthode", "L'erreur", "Le résultat", "Le secret",
  "L'astuce", "Le test", "La surprise", "À retenir",
];
const COLORS = ["#f2ff55", "#ff7a59", "#b8a7ff", "#5ee6c3", "#ffb4d1", "#77b9ff", "#f8f4eb", "#191919"];

function retryDelay(response: Response) {
  const milliseconds = Number(response.headers.get("retry-after-ms"));
  if (Number.isFinite(milliseconds) && milliseconds > 0) return milliseconds;

  const retryAfter = response.headers.get("retry-after");
  if (!retryAfter) return 0;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(retryAfter);
  return Number.isNaN(date) ? 0 : Math.max(0, date - Date.now());
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function makeCards(count: Count, previous: Card[] = []): Card[] {
  return Array.from({ length: count }, (_, index) => previous[index] ?? {
    id: Date.now() + index,
    title: INITIAL_TITLES[index],
    prompt: "",
    style: "",
  });
}

function getColumns(count: Count) {
  if (count === 1) return 1;
  if (count <= 6) return 2;
  return 3;
}

function getGridPosition(index: number, count: Count, columns: number) {
  const row = Math.floor(index / columns);
  const rowStart = row * columns;
  const itemsInRow = Math.min(columns, count - rowStart);
  const column = index - rowStart;

  return {
    gridColumn: `${columns - itemsInRow + 1 + column * 2} / span 2`,
    gridRow: row + 1,
  };
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

function resizeTextarea(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return;
  textarea.style.height = "auto";
  const styles = window.getComputedStyle(textarea);
  const borders = parseFloat(styles.borderTopWidth) + parseFloat(styles.borderBottomWidth);
  textarea.style.height = `${textarea.scrollHeight + borders}px`;
}

function AutoTextarea({ value, onInput, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => resizeTextarea(textareaRef.current), [value]);

  return (
    <textarea
      {...props}
      ref={textareaRef}
      value={value}
      onInput={(event) => {
        resizeTextarea(event.currentTarget);
        onInput?.(event);
      }}
    />
  );
}

export default function Home() {
  const artworkRef = useRef<SVGSVGElement>(null);
  const [selectedImageId, setSelectedImageId] = useState<string>();
  const [editingCardTitleId, setEditingCardTitleId] = useState<number>();
  const [imageTransforms, setImageTransforms] = useState<Record<string, ArtworkImageTransform>>({});
  const [count, setCount] = useState<Count>(6);
  const [cards, setCards] = useState<Card[]>(() => makeCards(6));
  const [background, setBackground] = useState("#f2ff55");
  const [title, setTitle] = useState("7 IDÉES QUI CHANGENT TOUT");
  const [titlePrompt, setTitlePrompt] = useState("Typographie éditoriale audacieuse, énergie pop, contraste très fort");
  const [titleImage, setTitleImage] = useState<string>();
  const [titleLoading, setTitleLoading] = useState(false);
  const [sharedPrompt, setSharedPrompt] = useState("Illustration 3D colorée, lumière studio douce, objets sur fond minimaliste");
  const [message, setMessage] = useState<string>();
  const [generatingAll, setGeneratingAll] = useState(false);
  const progress = useMemo(() => [titleImage, ...cards.map((card) => card.image)].filter(Boolean).length, [titleImage, cards]);
  const artworkLoading = titleLoading || cards.some((card) => card.loading);
  const selectedCardIndex = selectedImageId?.startsWith("card-")
    ? cards.findIndex((card) => `card-${card.id}` === selectedImageId)
    : -1;
  const selectedImageLabel = selectedImageId === "title" && titleImage
    ? "Bannière titre"
    : selectedCardIndex >= 0 && cards[selectedCardIndex].image
      ? `Image ${selectedCardIndex + 1} · ${cards[selectedCardIndex].title || `Sujet ${selectedCardIndex + 1}`}`
      : undefined;
  const selectedTransform = selectedImageId ? imageTransforms[selectedImageId] ?? DEFAULT_IMAGE_TRANSFORM : DEFAULT_IMAGE_TRANSFORM;

  useEffect(() => {
    try {
      const storedPlan = sessionStorage.getItem(STUDIO_PLAN_STORAGE_KEY);
      if (!storedPlan) return;

      const plan = JSON.parse(storedPlan) as StudioPlan;
      if (!Array.isArray(plan.cards) || plan.cards.length < 1 || plan.cards.length > 9) return;

      const nextCount = plan.cards.length as Count;
      setCount(nextCount);
      setTitle(plan.title);
      setTitlePrompt(plan.titlePrompt);
      setSharedPrompt(plan.sharedPrompt);
      setCards(plan.cards.map((card, index) => ({
        id: Date.now() + index,
        title: card.title,
        prompt: card.prompt,
        style: card.style,
      })));
    } catch {
      sessionStorage.removeItem(STUDIO_PLAN_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (!selectedImageId) return;
    if (selectedImageId === "title" ? !titleImage : selectedCardIndex < 0 || !cards[selectedCardIndex]?.image) {
      setSelectedImageId(undefined);
    }
  }, [cards, selectedCardIndex, selectedImageId, titleImage]);

  useEffect(() => {
    if (editingCardTitleId && !cards.some((card) => card.id === editingCardTitleId)) setEditingCardTitleId(undefined);
  }, [cards, editingCardTitleId]);

  function chooseCount(next: Count) {
    setCount(next);
    setCards((current) => makeCards(next, current));
  }

  function updateCard(index: number, patch: Partial<Card>) {
    setCards((current) => current.map((card, i) => i === index ? { ...card, ...patch } : card));
  }

  function updateCardById(id: number, patch: Partial<Card>) {
    setCards((current) => current.map((card) => card.id === id ? { ...card, ...patch } : card));
  }

  function selectArtworkImage(imageId: string) {
    setEditingCardTitleId(undefined);
    setSelectedImageId(imageId);
  }

  function editCardTitle(cardId: number) {
    setSelectedImageId(undefined);
    setEditingCardTitleId(cardId);
  }

  function updateImageTransform(imageId: string, transform: ArtworkImageTransform) {
    setImageTransforms((current) => ({ ...current, [imageId]: transform }));
  }

  function resetImageTransform(imageId: string) {
    setImageTransforms((current) => {
      if (!(imageId in current)) return current;
      const next = { ...current };
      delete next[imageId];
      return next;
    });
  }

  async function requestImage(kind: "title" | "card", imageTitle: string, prompt: string, cardStyle = "") {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, title: imageTitle, prompt, style: kind === "card" ? [sharedPrompt, cardStyle].filter(Boolean).join("\n\n") : "", quality: "medium" }),
    });
    const data = await response.json();
    if (!response.ok) throw new ImageGenerationError(data.error ?? "La génération a échoué.", response.status, retryDelay(response));
    return data.image as string;
  }

  async function generateTitle() {
    setMessage(undefined);
    setTitleLoading(true);
    try {
      const image = await requestImage("title", title, titlePrompt);
      resetImageTransform("title");
      setTitleImage(image);
    }
    catch (error) { setMessage(error instanceof Error ? error.message : "Erreur inconnue"); }
    finally { setTitleLoading(false); }
  }

  async function generateCard(index: number) {
    const card = cards[index];
    setMessage(undefined);
    updateCard(index, { loading: true });
    try {
      const image = await requestImage("card", card.title, card.prompt, card.style);
      resetImageTransform(`card-${card.id}`);
      updateCard(index, { image, loading: false });
    }
    catch (error) {
      updateCard(index, { loading: false });
      setMessage(error instanceof Error ? error.message : "Erreur inconnue");
      throw error;
    }
  }

  async function generateAll() {
    setGeneratingAll(true);
    const jobs: GenerationJob[] = [];

    if (!titleImage) {
      setTitleLoading(true);
      jobs.push({
        run: () => requestImage("title", title, titlePrompt),
        succeed: (image) => { resetImageTransform("title"); setTitleImage(image); setTitleLoading(false); },
        fail: () => setTitleLoading(false),
      });
    }

    for (const card of cards) {
      if (card.image) continue;
      updateCardById(card.id, { loading: true });
      jobs.push({
        run: () => requestImage("card", card.title, card.prompt, card.style),
        succeed: (image) => { resetImageTransform(`card-${card.id}`); updateCardById(card.id, { image, loading: false }); },
        fail: () => updateCardById(card.id, { loading: false }),
      });
    }

    if (jobs.length === 0) {
      setMessage("Tous les visuels sont déjà prêts.");
      setGeneratingAll(false);
      return;
    }

    setMessage(`Génération parallèle de ${jobs.length} visuel${jobs.length > 1 ? "s" : ""}…`);
    try {
      let pending = jobs;
      let round = 1;
      const errors: string[] = [];

      while (pending.length > 0) {
        const results = await Promise.all(pending.map(async (job) => {
          try {
            return { job, image: await job.run() };
          } catch (error) {
            return { job, error };
          }
        }));

        const retryable: Array<{ job: GenerationJob; delay: number }> = [];
        for (const result of results) {
          if ("image" in result && result.image) {
            result.job.succeed(result.image);
          } else if (result.error instanceof ImageGenerationError && result.error.status === 429 && round < 3) {
            retryable.push({ job: result.job, delay: result.error.retryAfterMs });
          } else {
            result.job.fail();
            errors.push(result.error instanceof Error ? result.error.message : "Erreur inconnue");
          }
        }

        if (retryable.length === 0) break;
        const apiDelay = Math.max(...retryable.map((item) => item.delay));
        const delay = apiDelay || 60_000;
        setMessage(`Limite OpenAI atteinte pour ${retryable.length} visuel${retryable.length > 1 ? "s" : ""}. Nouvelle tentative groupée dans ${Math.ceil(delay / 1000)} s…`);
        await wait(delay);
        pending = retryable.map((item) => item.job);
        round += 1;
      }

      setMessage(errors.length === 0
        ? "Tous les visuels sont prêts."
        : `${jobs.length - errors.length}/${jobs.length} visuels générés. ${errors[0]}`);
    } catch (error) {
      jobs.forEach((job) => job.fail());
      setMessage(error instanceof Error ? error.message : "La génération parallèle a échoué.");
    }
    finally { setGeneratingAll(false); }
  }

  async function exportPng() {
    const artwork = artworkRef.current;
    if (!artwork) return;
    setMessage("Préparation du PNG…");
    try {
      await document.fonts.ready;
      const exportArtwork = artwork.cloneNode(true) as SVGSVGElement;
      exportArtwork.querySelectorAll('[data-editor-only="true"]').forEach((element) => element.remove());
      const serializedSvg = new XMLSerializer().serializeToString(exportArtwork);
      const svgBlob = new Blob([serializedSvg], { type: "image/svg+xml;charset=utf-8" });
      const svgUrl = URL.createObjectURL(svgBlob);
      const image = await loadImage(svgUrl);
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas indisponible");
      ctx.drawImage(image, 0, 0, 1080, 1920);
      URL.revokeObjectURL(svgUrl);

      const pngBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG indisponible")), "image/png", 1);
      });
      const pngUrl = URL.createObjectURL(pngBlob);
      const link = document.createElement("a");
      link.download = `tiktok-${title.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "cover"}.png`;
      link.href = pngUrl;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(pngUrl), 1_000);
      setMessage("PNG 1080 × 1920 exporté depuis l’aperçu SVG.");
    } catch { setMessage("Impossible d’exporter : vérifiez que toutes les images sont chargées."); }
  }

  return (
    <main className="studio-page">
      <header className="topbar">
        <a className="brand" href="/"><span>F</span> FRAMEUP</a>
        <div className="top-actions">
          <span className="format-pill">9:16 <i /> TikTok</span>
          <button className="button dark" onClick={exportPng} disabled={artworkLoading}><Icon name="download" /> Exporter PNG</button>
        </div>
      </header>

      <div className="workspace">
        <aside className="controls">
          <section className="panel">
            <div className="step"><b>01</b><div><h2>Structure</h2><p>Choisissez le nombre de sujets.</p></div></div>
            <div className="layout-picker">
              {COUNTS.map((value) => {
                const cols = getColumns(value);
                const gridRows = Math.ceil(value / cols);
                return <button key={value} className={count === value ? "active" : ""} aria-pressed={count === value} onClick={() => chooseCount(value)}>
                  <span className="mini-grid" style={{ gridTemplateColumns: `repeat(${cols * 2},1fr)`, gridTemplateRows: `repeat(${gridRows},1fr)` }}>{Array.from({ length: value }, (_, i) => <i key={i} style={getGridPosition(i, value, cols)} />)}</span>
                  <strong>{value} image{value > 1 ? "s" : ""}</strong><small>{cols} × {gridRows}</small>
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
            <AutoTextarea id="title-prompt" value={titlePrompt} onChange={(e) => setTitlePrompt(e.target.value)} rows={3} />
            <button className="button accent full" onClick={generateTitle} disabled={titleLoading}><Icon name="spark" />{titleLoading ? "Création en cours…" : titleImage ? "Regénérer la bannière" : "Générer la bannière"}</button>
            <p className="secure"><Icon name="key" /> Contraintes techniques ajoutées côté serveur</p>
          </section>

          <section className="panel">
            <div className="step"><b>03</b><div><h2>Direction visuelle</h2><p>Commune à toutes les vignettes.</p></div></div>
            <AutoTextarea value={sharedPrompt} onChange={(e) => setSharedPrompt(e.target.value)} rows={4} />
          </section>

          <section className="panel cards-editor">
            <div className="step"><b>04</b><div><h2>{count === 1 ? "Votre sujet" : `Vos ${count} sujets`}</h2><p>Un titre et une idée par image.</p></div></div>
            {cards.map((card, index) => <div className="card-form" key={card.id}>
              <span className="card-number">{String(index + 1).padStart(2, "0")}</span>
              <div><AutoTextarea className="card-title-input" aria-label={`Titre ${index + 1}`} rows={1} value={card.title} onChange={(e) => updateCard(index, { title: e.target.value })} /><AutoTextarea aria-label={`Prompt ${index + 1}`} placeholder="Décrivez le sujet de l’image…" rows={2} value={card.prompt} onChange={(e) => updateCard(index, { prompt: e.target.value })} /><AutoTextarea className="card-style" aria-label={`Style ${index + 1}`} placeholder="Style propre à cette image…" rows={2} value={card.style} onChange={(e) => updateCard(index, { style: e.target.value })} /></div>
              <button aria-label={`Générer l’image ${index + 1}`} onClick={() => generateCard(index)} disabled={card.loading}><Icon name="spark" /></button>
            </div>)}
          </section>
        </aside>

        <section
          className="preview-column"
          onPointerDown={(event) => {
            const target = event.target;
            if (
              target instanceof Element
              && target.closest("button, input, textarea, select, a, [role='button'], .image-editor-toolbar")
            ) return;
            setSelectedImageId(undefined);
            setEditingCardTitleId(undefined);
          }}
        >
          <div className="preview-head"><div><span>APERÇU EN DIRECT</span><strong>1080 × 1920 px</strong></div><span className="progress">{progress}/{count + 1} visuels</span></div>
          {selectedImageId && selectedImageLabel && (
            <div className="image-editor-toolbar">
              <div className="image-editor-title"><strong>{selectedImageLabel}</strong><small>Glissez l’image dans son cadre</small></div>
              <label>
                <span>Zoom</span>
                <input
                  type="range"
                  min="0.5"
                  max="4"
                  step="0.05"
                  value={selectedTransform.scale}
                  onChange={(event) => updateImageTransform(selectedImageId, { ...selectedTransform, scale: Number(event.target.value) })}
                />
                <output>{Math.round(selectedTransform.scale * 100)}%</output>
              </label>
              <button type="button" onClick={() => resetImageTransform(selectedImageId)}>Réinitialiser</button>
              <button type="button" className="close-image-editor" aria-label="Fermer les réglages de l’image" onClick={() => setSelectedImageId(undefined)}>×</button>
            </div>
          )}
          <div className="preview-stage">
            <div className="phone-wrap">
              <CoverArtwork
                ref={artworkRef}
                background={background}
                title={title}
                titleImage={titleImage}
                titleLoading={titleLoading}
                cards={cards}
                imageTransforms={imageTransforms}
                selectedImageId={selectedImageId}
                onSelectImage={selectArtworkImage}
                onDeselect={() => {
                  setSelectedImageId(undefined);
                  setEditingCardTitleId(undefined);
                }}
                onTransformImage={updateImageTransform}
                editingCardTitleId={editingCardTitleId}
                onEditCardTitle={editCardTitle}
                onChangeCardTitle={(cardId, nextTitle) => updateCardById(cardId, { title: nextTitle })}
                onFinishCardTitle={() => setEditingCardTitleId(undefined)}
              />
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
