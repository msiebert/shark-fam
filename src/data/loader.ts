import type { SpeciesDetail, TaxonomyIndex } from "./schema";

const BASE = import.meta.env.BASE_URL;

export async function loadIndex(): Promise<TaxonomyIndex> {
  const res = await fetch(`${BASE}data/index.json`);
  if (!res.ok) throw new Error(`Could not load the taxonomy (${res.status})`);
  return (await res.json()) as TaxonomyIndex;
}

/** Species detail is fetched when first needed, and neighbours are warmed ahead of time. */
export class DetailStore {
  private readonly cache = new Map<string, Promise<SpeciesDetail>>();
  private readonly ready = new Map<string, SpeciesDetail>();

  get(id: string): Promise<SpeciesDetail> {
    let p = this.cache.get(id);
    if (!p) {
      p = fetch(`${BASE}data/species/${id}.json`).then(async (res) => {
        if (!res.ok) throw new Error(`Could not load ${id} (${res.status})`);
        const d = (await res.json()) as SpeciesDetail;
        this.ready.set(id, d);
        return d;
      });
      p.catch(() => this.cache.delete(id));
      this.cache.set(id, p);
    }
    return p;
  }

  /** Synchronous peek: the detail if it has already arrived. */
  peek(id: string): SpeciesDetail | undefined {
    return this.ready.get(id);
  }

  prefetch(ids: Iterable<string>): void {
    for (const id of ids) this.get(id).catch(() => {});
  }
}
