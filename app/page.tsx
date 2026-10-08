"use client";

import { type FormEvent, type KeyboardEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  STUDIO_PLAN_STORAGE_KEY,
  type StudioPlan,
  type VideoOutline,
} from "../lib/studio-plan";

type Phase = "idle" | "outline" | "details" | "saving";

const EXAMPLES = [
  "5 erreurs qui empêchent de progresser en course à pied",
  "Une vidéo sur les étapes pour lancer sa première newsletter",
  "Les idées essentielles du livre Atomic Habits",
];

function SparkIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 1.4 5.1L18 9l-4.6 1.9L12 16l-1.4-5.1L6 9l4.6-1.9L12 2Zm6 12 .7 2.3L21 17l-2.3.7L18 20l-.7-2.3L15 17l2.3-.7L18 14Z" /></svg>;
}

async function postPlan<T>(payload: object): Promise<T> {
  const response = await fetch("/api/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "La préparation du studio a échoué.");
  return data as T;
}

export default function BriefPage() {
  const router = useRouter();
  const [brief, setBrief] = useState("");
  const [stickmanStyle, setStickmanStyle] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [outline, setOutline] = useState<VideoOutline>();
  const [error, setError] = useState<string>();
  const loading = phase !== "idle";

  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanBrief = brief.trim();
    if (!cleanBrief || loading) return;

    setError(undefined);
    setOutline(undefined);
    setPhase("outline");

    try {
      const firstStep = await postPlan<{ outline: VideoOutline }>({ stage: "outline", brief: cleanBrief, stickmanStyle });
      setOutline(firstStep.outline);
      setPhase("details");

      const secondStep = await postPlan<{ plan: StudioPlan }>({
        stage: "details",
        brief: cleanBrief,
        outline: firstStep.outline,
        stickmanStyle,
      });

      setPhase("saving");
      const created = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: cleanBrief, plan: secondStep.plan, stickmanStyle }),
      });
      const createdData = await created.json();
      if (!created.ok) throw new Error(createdData.error ?? "La création du projet a échoué.");
      sessionStorage.removeItem(STUDIO_PLAN_STORAGE_KEY);
      router.push(`/studio/${createdData.project.id}`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Erreur inconnue.");
      setPhase("idle");
    }
  }

  function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <main className="brief-page">
      <header className="topbar brief-topbar">
        <a className="brand" href="/"><span>F</span> FRAMEUP</a>
        <a className="studio-link" href="/projects">Mes projets <span>→</span></a>
      </header>

      <section className="brief-shell">
        <div className="brief-heading">
          <span className="eyebrow"><SparkIcon /> AI CREATIVE BRIEF</span>
          <h1>Transformez vos idées<br />en <em>scroll-stoppers.</em></h1>
          <p>Décrivez votre vidéo. FrameUp prépare le titre et les images ; vous pourrez tout ajuster dans le studio.</p>
        </div>

        <form className="brief-composer" onSubmit={createPlan}>
          <textarea
            autoFocus
            aria-label="Brief de la vidéo"
            placeholder="Exemple : Je prépare une vidéo sur les 5 erreurs les plus courantes en photographie. Je veux un ton direct, moderne, avec des images très contrastées…"
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            onKeyDown={submitOnEnter}
            rows={6}
            maxLength={8000}
            disabled={loading}
          />
          <label className="style-toggle brief-style-toggle">
            <input type="checkbox" checked={stickmanStyle} onChange={(event) => setStickmanStyle(event.target.checked)} disabled={loading} />
            <span><strong>Style stickman</strong><small>Dessin Paint maladroit, contours tremblants et couleurs plates. Les sujets restent ceux de votre vidéo.</small></span>
          </label>
          <div className="composer-footer">
            <span><kbd>Entrée</kbd> pour créer · <kbd>Maj Entrée</kbd> pour une nouvelle ligne</span>
            <button type="submit" aria-label="Créer le plan de la cover" disabled={!brief.trim() || loading}>
              {loading ? <span className="composer-spinner" /> : <span>↑</span>}
            </button>
          </div>
        </form>

        {loading ? (
          <div className="planning-progress" aria-live="polite">
            <div className={phase === "outline" ? "active" : "done"}>
              <b>{phase === "outline" ? <span className="composer-spinner" /> : "✓"}</b>
              <span><strong>Structure éditoriale</strong><small>{outline ? `${outline.count} parties · ${outline.videoTitle}` : "Choix du titre et du nombre de parties…"}</small></span>
            </div>
            <i />
            <div className={phase === "details" || phase === "saving" ? "active" : "pending"}>
              <b>{phase === "details" || phase === "saving" ? <span className="composer-spinner" /> : "2"}</b>
              <span><strong>{phase === "saving" ? "Enregistrement du projet" : "Direction des images"}</strong><small>{phase === "saving" ? "Création de son espace de travail…" : "Prompts du titre et de chaque partie"}</small></span>
            </div>
          </div>
        ) : (
          <div className="brief-examples">
            <span>Essayez par exemple</span>
            <div>{EXAMPLES.map((example) => <button type="button" key={example} onClick={() => setBrief(example)}>{example}</button>)}</div>
          </div>
        )}

        {error && <div className="brief-error" role="alert">{error}</div>}
      </section>
    </main>
  );
}
