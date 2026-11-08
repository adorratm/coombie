import type { ZombieVisual } from './characters';

export type ZombieVrmLod = 'full' | 'reduced' | 'skip' | 'proxy';

const NEAR_R2 = 16 * 16;
const MID_R2 = 28 * 28;
const FAR_R2 = 34 * 34;

/** Soft cap of full bone-pose updates per frame (attackers reserved first). */
let fullBudget = 0;

export function beginZombieLodFrame(maxFullPoses = 12): void {
  fullBudget = maxFullPoses;
}

function takeFull(): boolean {
  if (fullBudget <= 0) return false;
  fullBudget -= 1;
  return true;
}

/**
 * Distance + attack-aware presentation/update tier.
 * - full: VRM visible + full bone damp
 * - reduced: VRM visible + cheap vrm.update only
 * - skip: VRM visible, pose frozen this frame
 * - proxy: hide VRM, animate low-poly proxy (far / over-budget)
 */
export function zombieVrmLod(
  z: ZombieVisual,
  playerX: number,
  playerZ: number,
  frame: number,
): ZombieVrmLod {
  const attacking = z.attackAnim > 0 || (z.activeSkill !== 'none' && z.activeSkill !== undefined);
  const dx = z.root.position.x - playerX;
  const dz = z.root.position.z - playerZ;
  const d2 = dx * dx + dz * dz;
  const phase = z.lodPhase | 0;

  if (attacking) {
    // Prefer readable attack poses even under pressure.
    return takeFull() ? 'full' : 'reduced';
  }

  if (d2 > FAR_R2) return 'proxy';

  if (d2 <= NEAR_R2) {
    if (takeFull()) return 'full';
    return (frame + phase) % 2 === 0 ? 'reduced' : 'skip';
  }

  if (d2 <= MID_R2) {
    if ((frame + phase) % 2 !== 0) return 'skip';
    if (takeFull()) return 'full';
    return 'reduced';
  }

  // Mid-far band: cheap VRM tick every 4th frame, pose frozen otherwise.
  // (Returning 'proxy' here swapped VRM <-> proxy mesh every frame: visible flicker.)
  if ((frame + phase) % 4 === 0) return 'reduced';
  return 'skip';
}
