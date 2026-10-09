import * as THREE from "three";
import type { CompanionId } from "../../core/companions";
import { clamp } from "../frame";
import { REGISTRY } from "./registry";
import type { CompanionContext, Creature } from "./types";

export type { CompanionContext, SharkInfo } from "./types";

interface Slot {
  creature: Creature | null;
  opacity: number;
}

/**
 * The life that shares the water with the shark on a species page. The scene says which kinds it wants; each is
 * loaded the first time it is asked for, then kept (hidden) in case the next species wants it too.
 */
export class Companions {
  readonly group = new THREE.Group();
  /** Seconds to keep everything hidden after a change of view. */
  hold = 0;
  private readonly slots = new Map<CompanionId, Slot>();
  private wanted = new Set<CompanionId>();
  private disposed = false;

  /** Which kinds should be showing. An empty list (or leaving the species page) fades them all out. */
  want(ids: readonly CompanionId[]): void {
    this.wanted = new Set(ids);
    for (const id of ids) this.load(id);
  }

  private load(id: CompanionId): void {
    if (this.slots.has(id)) return;
    const slot: Slot = { creature: null, opacity: 0 };
    this.slots.set(id, slot);
    REGISTRY[id]()
      .then((create) => {
        if (this.disposed) return;
        slot.creature = create();
        slot.creature.object.visible = false;
        this.group.add(slot.creature.object);
      })
      .catch((e) => {
        console.warn(`Could not load companion "${id}"`, e);
        this.slots.delete(id);
      });
  }

  update(c: CompanionContext): void {
    this.hold -= c.dt;
    const on = this.hold <= 0;
    for (const [id, slot] of this.slots) {
      const cr = slot.creature;
      if (!cr) continue;
      const show = on && this.wanted.has(id);
      slot.opacity = clamp(slot.opacity + (show ? c.dt / 0.8 : -c.dt / 0.4), 0, 1);
      cr.object.visible = slot.opacity > 0.01;
      if (!cr.object.visible) continue;
      const o = slot.opacity * (cr.tied ? (c.shark?.alpha ?? 0) : 1);
      for (const m of cr.materials) m.opacity = o;
      cr.update(c);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.group.removeFromParent();
    for (const s of this.slots.values()) s.creature?.dispose();
    this.slots.clear();
  }
}
