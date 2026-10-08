export const STUDIO_PLAN_STORAGE_KEY = "frameup:studio-plan";

export type OutlinePart = {
  title: string;
  purpose: string;
};

export type VideoOutline = {
  videoTitle: string;
  count: number;
  concept: string;
  titleStyle: string;
  sharedImageStyle: string;
  parts: OutlinePart[];
};

export type PlannedCard = {
  title: string;
  prompt: string;
  style: string;
};

export type StudioPlan = {
  title: string;
  titlePrompt: string;
  sharedPrompt: string;
  cards: PlannedCard[];
};

export type SavedImageTransform = {
  scale: number;
  x: number;
  y: number;
};

export type ProjectCard = PlannedCard & {
  id: number;
  image?: string;
};

export type FrameUpProject = {
  version: 1;
  id: string;
  brief: string;
  createdAt: string;
  updatedAt: string;
  background: string;
  stickmanStyle?: boolean;
  title: string;
  titlePrompt: string;
  titleImage?: string;
  sharedPrompt: string;
  cards: ProjectCard[];
  imageTransforms: Record<string, SavedImageTransform>;
};

export type ProjectSummary = Pick<FrameUpProject, "id" | "title" | "brief" | "createdAt" | "updatedAt" | "background" | "titleImage"> & {
  cardCount: number;
  generatedCount: number;
  previewImage?: string;
};
