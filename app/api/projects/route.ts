import { NextResponse } from "next/server";
import { createProject, listProjects } from "../../../lib/project-store";
import type { StudioPlan } from "../../../lib/studio-plan";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ projects: await listProjects() });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { brief?: unknown; plan?: Partial<StudioPlan>; stickmanStyle?: unknown };
    const brief = typeof body.brief === "string" ? body.brief.trim().slice(0, 8000) : "";
    const plan = body.plan;
    if (
      !brief
      || typeof plan?.title !== "string"
      || typeof plan.titlePrompt !== "string"
      || typeof plan.sharedPrompt !== "string"
      || !Array.isArray(plan.cards)
      || plan.cards.length < 1
      || plan.cards.length > 9
    ) {
      return NextResponse.json({ error: "Le plan du projet est invalide." }, { status: 400 });
    }

    const cards = plan.cards.map((card) => ({
      title: typeof card?.title === "string" ? card.title.trim().slice(0, 120) : "",
      prompt: typeof card?.prompt === "string" ? card.prompt.trim().slice(0, 10000) : "",
      style: typeof card?.style === "string" ? card.style.trim().slice(0, 2000) : "",
    }));
    if (cards.some((card) => !card.title || !card.prompt)) {
      return NextResponse.json({ error: "Une ou plusieurs cartes sont incomplètes." }, { status: 400 });
    }

    const project = await createProject(brief, {
      title: plan.title.trim().slice(0, 180),
      titlePrompt: plan.titlePrompt.trim().slice(0, 6000),
      sharedPrompt: plan.sharedPrompt.trim().slice(0, 3000),
      cards,
    }, body.stickmanStyle === true);
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error("Project creation error", error);
    return NextResponse.json({ error: "Impossible de créer le projet." }, { status: 500 });
  }
}
