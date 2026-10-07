import { useEffect, useId, useState } from "preact/hooks";
import type { Distribution } from "../data/schema";

interface Land {
  viewBox: [number, number];
  path: string;
}

let landPromise: Promise<Land> | null = null;
const loadLand = () => (landPromise ??= import("../assets/world-land.json").then((m) => m.default as unknown as Land));

/** Equirectangular, 2 units per degree, latitude 80 to -58. */
const P = (lon: number, lat: number) => `${(lon + 180) * 2} ${(80 - lat) * 2}`;
const polyPath = (d: Distribution) => d.polygons.map((poly) => "M" + poly.map(([lo, la]) => P(lo, la)).join("L") + "Z").join("");

/** A shaded range map with no label. "coast" shades the coastlines inside the polygons, "open" shades the water. */
export function DistributionMap({ distribution }: { distribution: Distribution }) {
  const [land, setLand] = useState<Land | null>(null);
  useEffect(() => {
    let live = true;
    loadLand().then((l) => live && setLand(l));
    return () => {
      live = false;
    };
  }, []);
  const uid = useId().replace(/:/g, "");
  const coast = distribution.mode === "coast";
  const [w, h] = land?.viewBox ?? [720, 276];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Map of where this shark lives" preserveAspectRatio="xMidYMid meet">
      <defs>
        <filter id={`${uid}a`} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation={coast ? 3 : 7} />
        </filter>
        <filter id={`${uid}b`} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <mask id={`${uid}m`}>
          <rect width={w} height={h} fill="#000" />
          <path d={polyPath(distribution)} fill="#fff" filter={`url(#${uid}b)`} />
        </mask>
      </defs>
      <rect class="rg-sea" width={w} height={h} />
      <path class="rg-grid" d={`M0 160H${w}M0 ${(80 - 23.4) * 2}H${w}M0 ${(80 + 23.4) * 2}H${w}`} />
      {land && (
        <>
          <g mask={`url(#${uid}m)`}>
            <g filter={`url(#${uid}a)`} opacity="0.9">
              {coast ? <path class="rg-ss" d={land.path} stroke-width="10" stroke-linejoin="round" /> : <rect class="rg-fs" width={w} height={h} />}
            </g>
          </g>
          <path class="rg-land" d={land.path} />
        </>
      )}
    </svg>
  );
}
