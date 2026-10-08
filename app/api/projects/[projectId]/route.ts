import { NextResponse } from "next/server";
import { getProject, saveProject } from "../../../../lib/project-store";
import type { FrameUpProject, SavedImageTransform } from "../../../../lib/studio-plan";

export const runtime = "nodejs";

type Context = { params: Promise<{ projectId: string }> };

function text(value: unknown, length: number) {
  return typeof value === "string" ? value.slice(0, length) : "";
}

function image(value: unknown, projectId: string) {
  if (typeof value !== "string") return undefined;
  return value.startsWith(`/api/projects/${projectId}/images/`) ? value : undefined;
}

function transform(value: unknown): SavedImageTransform | undefined {
  if (!value || typeof value !== "object") return;
  const candidate = value as Partial<SavedImageTransform>;
  const scale = Number(candidate.scale);
  const x = Number(candidate.x);
  const y = Number(candidate.y);
  if (![scale, x, y].every(Number.isFinite)) return;
  return { scale: Math.min(4, Math.max(0.5, scale)), x, y };
}

export async function GET(_request: Request, context: Context) {
  try {
    const { projectId } = await context.params;
    return NextResponse.json({ project: await getProject(projectId) });
  } catch {
    return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    const { projectId } = await context.params;
    const existing = await getProject(projectId);
    const body = await request.json() as Partial<FrameUpProject>;
    if (!Array.isArray(body.cards) || body.cards.length < 1 || body.cards.length > 9) {
      return NextResponse.json({ error: "La liste des cartes est invalide." }, { status: 400 });
    }

    const cards = body.cards.map((card) => ({
      id: Number.isSafeInteger(card?.id) ? card.id : Date.now() + Math.floor(Math.random() * 1000),
      title: text(card?.title, 120),
      prompt: text(card?.prompt, 10000),
      style: text(card?.style, 2000),
      image: image(card?.image, projectId),
    }));
    const transforms = Object.fromEntries(
      Object.entries(body.imageTransforms ?? {})
        .map(([key, value]) => [key, transform(value)] as const)
        .filter((entry): entry is [string, SavedImageTransform] => Boolean(entry[1])),
    );
    const background = typeof body.background === "string" && /^#[0-9a-f]{6}$/i.test(body.background)
      ? body.background
      : existing.background;

    const project = await saveProject({
      ...existing,
      background,
      stickmanStyle: typeof body.stickmanStyle === "boolean" ? body.stickmanStyle : existing.stickmanStyle === true,
      title: text(body.title, 180),
      titlePrompt: text(body.titlePrompt, 6000),
      titleImage: image(body.titleImage, projectId),
      sharedPrompt: text(body.sharedPrompt, 3000),
      cards,
      imageTransforms: transforms,
    });
    return NextResponse.json({ project });
  } catch (error) {
    console.error("Project save error", error);
    return NextResponse.json({ error: "Impossible de sauvegarder le projet." }, { status: 500 });
  }
}
