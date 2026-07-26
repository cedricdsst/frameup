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
