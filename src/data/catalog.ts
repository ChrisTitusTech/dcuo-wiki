import type { Article } from "./articles";
const groups = import.meta.glob("../../content/catalog/*.json", {
  eager: true,
  import: "default",
});
export default Object.values(groups).flat() as (Article & {
  type?: string;
  imported?: boolean;
  releaseIds?: string[];
})[];
