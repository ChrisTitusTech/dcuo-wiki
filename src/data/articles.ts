import data from "./articles.json";
export interface Article {
  slug: string;
  title: string;
  category: string;
  summary: string;
  sections: {
    title: string;
    items: string[];
    images?: { label: string; url: string }[];
    references?: { label: string; url: string }[];
    table?: { caption: string; columns: string[]; rows: string[][] };
  }[];
  related?: string[];
  source: string;
  history: string;
  retrieved: string;
  reviewed: boolean;
  license: string;
  location?: {
    label: string;
    precision: string;
    source: string;
    maps: { label: string; url: string }[];
  };
  locationLimitation?: string;
  videoReview?: {
    status: string;
    query: string;
    checked: string;
    note: string;
  };
  videos?: {
    title: string;
    url: string;
    evidence: string;
    startSeconds?: number;
  }[];
}
export default data as Article[];
