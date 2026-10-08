import type { Navigator } from "../core/nav";
import type { Tree, TreeNode } from "../core/tree";

const idFromHash = () => decodeURIComponent(location.hash.replace(/^#\/?/, "")).toLowerCase();

export function nodeFromHash(tree: Tree): TreeNode | undefined {
  const id = idFromHash();
  return id ? tree.get(id) : undefined;
}

/** Keep the URL hash and the current node in step, both ways. */
export function syncHash(nav: Navigator): () => void {
  const write = () => {
    const want = `#${nav.current.id}`;
    if (location.hash !== want) {
      try {
        history.replaceState(null, "", nav.current === nav.tree.roots[0] ? location.pathname + location.search : want);
      } catch {
        /* sandboxed frames may forbid it */
      }
    }
  };
  const off = nav.subscribe(write);
  const onHash = () => {
    const n = nodeFromHash(nav.tree);
    if (n) nav.go(n);
    else if (!idFromHash()) nav.go(nav.tree.roots[0]!);
  };
  window.addEventListener("hashchange", onHash);
  return () => {
    off();
    window.removeEventListener("hashchange", onHash);
  };
}
