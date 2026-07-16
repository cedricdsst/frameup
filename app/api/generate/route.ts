import { NextResponse } from "next/server";

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
  quality?: "low" | "medium" | "high";
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
    const kind = body.kind === "title" ? "title" : "card";
    const title = body.title?.trim().slice(0, 180) ?? "";
    const prompt = body.prompt?.trim().slice(0, 6000) ?? "";
    const style = body.style?.trim().slice(0, 1000) ?? "";

    if (!prompt && !title) {
      return NextResponse.json({ error: "Ajoutez au moins un titre ou une description." }, { status: 400 });
    }

    const hiddenRules = kind === "title" ? TITLE_RULES : CARD_RULES;
    const composedPrompt = [
      hiddenRules,
      kind === "title" ? `EXACT TITLE TO DISPLAY: « ${title} »` : `SUBJECT LABEL (context only, do not write it): ${title}`,
      style && `SHARED ART DIRECTION: ${style}`,
      prompt && `USER REQUEST: ${prompt}`,
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
      return NextResponse.json({ error: message }, { status: openAIResponse.status });
    }

    const base64 = result?.data?.[0]?.b64_json;
    if (!base64) return NextResponse.json({ error: "Aucune image reçue." }, { status: 502 });
    return NextResponse.json({ image: `data:image/png;base64,${base64}` });
  } catch (error) {
    console.error("Image generation route error", error);
    return NextResponse.json({ error: "Erreur interne pendant la génération." }, { status: 500 });
  }
}
