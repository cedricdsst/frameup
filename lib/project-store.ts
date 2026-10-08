import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FrameUpProject, ProjectSummary, StudioPlan } from "./studio-plan";

const DATA_ROOT = path.join(process.cwd(), "data", "projects");
const PROJECT_ID = /^[a-f0-9-]{36}$/;
const IMAGE_NAME = /^(title|card-\d+)-[a-f0-9-]{36}\.png$/;

function assertProjectId(id: string) {
  if (!PROJECT_ID.test(id)) throw new Error("Identifiant de projet invalide.");
}

function projectDirectory(id: string) {
  assertProjectId(id);
  return path.join(DATA_ROOT, id);
}

function projectFile(id: string) {
  return path.join(projectDirectory(id), "project.json");
}

async function writeProjectFile(project: FrameUpProject) {
  const directory = projectDirectory(project.id);
  await mkdir(directory, { recursive: true });
  const target = projectFile(project.id);
  const temporary = path.join(directory, `project.${randomUUID()}.tmp`);
  await writeFile(temporary, `${JSON.stringify(project, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}

export async function createProject(brief: string, plan: StudioPlan, stickmanStyle = false) {
  const now = new Date().toISOString();
  const project: FrameUpProject = {
    version: 1,
    id: randomUUID(),
    brief: brief.trim().slice(0, 8000),
    createdAt: now,
    updatedAt: now,
    background: "#f2ff55",
    stickmanStyle,
    title: plan.title,
    titlePrompt: plan.titlePrompt,
    sharedPrompt: plan.sharedPrompt,
    cards: plan.cards.map((card, index) => ({
      id: Date.now() + index,
      title: card.title,
      prompt: card.prompt,
      style: card.style,
    })),
    imageTransforms: {},
  };
  await writeProjectFile(project);
  return project;
}

export async function getProject(id: string) {
  const raw = await readFile(projectFile(id), "utf8");
  return JSON.parse(raw) as FrameUpProject;
}

export async function saveProject(project: FrameUpProject) {
  assertProjectId(project.id);
  const saved = { ...project, version: 1 as const, updatedAt: new Date().toISOString() };
  await writeProjectFile(saved);
  return saved;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  await mkdir(DATA_ROOT, { recursive: true });
  const entries = await readdir(DATA_ROOT, { withFileTypes: true });
  const candidates = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry): Promise<ProjectSummary | undefined> => {
    try {
      const project = await getProject(entry.name);
      const previewImage = project.titleImage ?? project.cards.find((card) => card.image)?.image;
      return {
        id: project.id,
        title: project.title,
        brief: project.brief,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        background: project.background,
        titleImage: project.titleImage,
        cardCount: project.cards.length,
        generatedCount: [project.titleImage, ...project.cards.map((card) => card.image)].filter(Boolean).length,
        previewImage,
      };
    } catch {
      return undefined;
    }
  }));
  return candidates.filter((project): project is ProjectSummary => project !== undefined)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function storeGeneratedImage(projectId: string, key: string, base64: string) {
  assertProjectId(projectId);
  const safeKey = key === "title" ? "title" : /^card-\d+$/.test(key) ? key : undefined;
  if (!safeKey) throw new Error("Emplacement d’image invalide.");
  const name = `${safeKey}-${randomUUID()}.png`;
  const imageDirectory = path.join(projectDirectory(projectId), "images");
  await mkdir(imageDirectory, { recursive: true });
  await writeFile(path.join(imageDirectory, name), Buffer.from(base64, "base64"));
  return `/api/projects/${projectId}/images/${name}`;
}

export async function readProjectImage(projectId: string, name: string) {
  assertProjectId(projectId);
  if (!IMAGE_NAME.test(name)) throw new Error("Nom d’image invalide.");
  return readFile(path.join(projectDirectory(projectId), "images", name));
}
