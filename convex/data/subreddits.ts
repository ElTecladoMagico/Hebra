export type Country = "ES" | "MX" | "AR" | "CO" | "CL" | "PE" | "PAN-HISPANO";
export type Hostility = "low" | "medium" | "high";

export interface SubredditMeta {
  slug: string;
  country: Country;
  hostility: Hostility;
  topics: string[];
}

export const CURATED_SUBREDDITS: SubredditMeta[] = [
  { slug: "españa", country: "ES", hostility: "high", topics: ["general", "trabajo"] },
  { slug: "spain", country: "ES", hostility: "medium", topics: ["expat", "general"] },
  { slug: "mexico", country: "MX", hostility: "medium", topics: ["general"] },
  { slug: "argentina", country: "AR", hostility: "high", topics: ["general"] },
  { slug: "colombia", country: "CO", hostility: "medium", topics: ["general"] },
  { slug: "chile", country: "CL", hostility: "medium", topics: ["general"] },
  { slug: "peru", country: "PE", hostility: "medium", topics: ["general"] },
  { slug: "devsenespanol", country: "PAN-HISPANO", hostility: "medium", topics: ["dev"] },
  { slug: "programacion", country: "PAN-HISPANO", hostility: "medium", topics: ["dev"] },
  { slug: "emprendedores", country: "PAN-HISPANO", hostility: "low", topics: ["business"] },
  { slug: "startups_es", country: "PAN-HISPANO", hostility: "low", topics: ["business"] },
  { slug: "SEO", country: "PAN-HISPANO", hostility: "medium", topics: ["marketing"] },
  { slug: "Marketing", country: "PAN-HISPANO", hostility: "medium", topics: ["marketing"] },
  { slug: "freelance", country: "PAN-HISPANO", hostility: "medium", topics: ["business"] },
];

export function getSubredditMeta(slug: string): SubredditMeta | undefined {
  return CURATED_SUBREDDITS.find((s) => s.slug.toLowerCase() === slug.toLowerCase());
}
