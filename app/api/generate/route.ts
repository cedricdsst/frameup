import { NextResponse } from "next/server";
import { getProject, storeGeneratedImage } from "../../../lib/project-store";
import { STICKMAN_STYLE } from "../../../lib/visual-style";

export const runtime = "nodejs";
export const maxDuration = 180;

const TITLE_RULES = process.env.TITLE_HIDDEN_PROMPT ?? `
Create a polished horizontal title banner for a vertical TikTok cover.
The exact title supplied by the user must be the only readable text in the image.
Keep every letter large, correctly spelled, high-contrast and inside a generous safe area.
Use a strong central composition that remains legible on a small phone screen.
No logos, watermarks, UI elements, borders, mockups or extra captions.
Landscape composition, production-ready editorial graphic.
Use a real transparent alpha background. Do not draw a checkerboard, transparency grid, transparency symbol, or fake transparent background.
`;

const CARD_RULES = process.env.CARD_HIDDEN_PROMPT ?? `
Create one clean editorial illustration for a TikTok cover image tile.
Show one instantly recognizable main subject with strong contrast and a simple composition.
Do not render any words, letters, numbers, captions, logos, watermarks, borders or UI.
The label will be added later by the application underneath the image.
Square composition, important content centered, consistent premium visual quality.
Use a real transparent alpha background. Do not draw a checkerboard, transparency grid, transparency symbol, or fake transparent background.
`;

type Payload = {
  kind?: "title" | "card";
  prompt?: string;
  title?: string;
  style?: string;
  sharedPrompt?: string;
  stickmanStyle?: boolean;
  quality?: "low" | "medium" | "high";
  projectId?: string;
  imageKey?: string;
};

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Clé OpenAI absente. Ajoutez OPENAI_API_KEY dans .env.local puis relancez le serveur." },
        { status: 503 },
      );
    }

    const body = (await request.json()) as Payload;
    if (typeof body.projectId !== "string" || typeof body.imageKey !== "string") {
      return NextResponse.json({ error: "Le projet de destination est manquant." }, { status: 400 });
    }
    let project;
    try {
      project = await getProject(body.projectId);
    } catch {
      return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });
    }
    const kind = body.kind === "title" ? "title" : "card";
    if (kind === "title" ? body.imageKey !== "title" : !project.cards.some((card) => body.imageKey === `card-${card.id}`)) {
      return NextResponse.json({ error: "Emplacement d’image invalide." }, { status: 400 });
    }
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 180) : "";
    const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 10000) : "";
    const style = typeof body.style === "string" ? body.style.trim().slice(0, 5000) : "";
    const sharedPrompt = typeof body.sharedPrompt === "string" ? body.sharedPrompt.trim().slice(0, 3000) : "";
    const stickmanStyle = typeof body.stickmanStyle === "boolean" ? body.stickmanStyle : project.stickmanStyle === true;

    if (!prompt && !title) {
      return NextResponse.json({ error: "Ajoutez au moins un titre ou une description." }, { status: 400 });
    }

    const hiddenRules = kind === "title" ? TITLE_RULES : CARD_RULES;
    const composedPrompt = [
      hiddenRules,
      kind === "title" ? `EXACT TITLE TO DISPLAY: « ${title} »` : `SUBJECT LABEL (context only, do not write it): ${title}`,
      kind === "card" && sharedPrompt && `SHARED ART DIRECTION: ${sharedPrompt}`,
      style && `ADDITIONAL ART DIRECTION: ${style}`,
      prompt && `USER REQUEST: ${prompt}`,
      stickmanStyle && `MANDATORY STYLE OVERRIDE: The following preset replaces any conflicting polished, premium, 3D or lighting instructions above. Preserve the requested subject and exact title.\n${STICKMAN_STYLE}`,
      stickmanStyle && kind === "title" && "Draw the exact title with large simple wobbly hand-drawn lettering and flat colors. Keep every letter readable and correctly spelled.",
      "FINAL TECHNICAL CONSTRAINT: Return a real transparent alpha background. Never represent transparency with a checkerboard or grid.",
    ].filter(Boolean).join("\n\n");

    const openAIResponse = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-1.5",
        prompt: composedPrompt,
        size: kind === "title" ? "1536x1024" : "1024x1024",
        quality: body.quality ?? "medium",
        output_format: "png",
        background: "transparent",
        n: 1,
      }),
    });

    const result = await openAIResponse.json();
    if (!openAIResponse.ok) {
      const message = result?.error?.code === "moderation_blocked"
        ? "Cette demande a été bloquée par les règles de sécurité. Reformulez le prompt."
        : result?.error?.message ?? "La génération OpenAI a échoué.";
      console.error("OpenAI image error", openAIResponse.status, result?.error?.code, result?.error?.request_id);
      const headers = new Headers();
      const retryAfter = openAIResponse.headers.get("retry-after");
      const retryAfterMs = openAIResponse.headers.get("retry-after-ms");
      if (retryAfter) headers.set("retry-after", retryAfter);
      if (retryAfterMs) headers.set("retry-after-ms", retryAfterMs);
      return NextResponse.json({ error: message }, { status: openAIResponse.status, headers });
    }

    const base64 = result?.data?.[0]?.b64_json;
    if (!base64) return NextResponse.json({ error: "Aucune image reçue." }, { status: 502 });
    const image = await storeGeneratedImage(body.projectId, body.imageKey, base64);
    return NextResponse.json({ image });
  } catch (error) {
    console.error("Image generation route error", error);
    return NextResponse.json({ error: "Erreur interne pendant la génération." }, { status: 500 });
  }
}
