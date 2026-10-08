import { NextResponse } from "next/server";
import { readProjectImage } from "../../../../../../lib/project-store";

export const runtime = "nodejs";

type Context = { params: Promise<{ projectId: string; name: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { projectId, name } = await context.params;
    const image = await readProjectImage(projectId, name);
    return new Response(image, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Image introuvable." }, { status: 404 });
  }
}
