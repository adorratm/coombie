/**
 * Zombie locomotion samples.
 * Proxy mesh and VRM T-pose bones use DIFFERENT absolute Euler maps —
 * only timing (swing/limp) is shared.
 *
 * VRM rule (normalized, XYZ): Z ≈ ±1.25 drops arms from T-pose;
 * Y brings hands forward/in; keep |X| modest. Large |X| + small |Z| pins arms behind.
 */

export interface ZombieGaitSample {
  limp: number;
  swing: number;
  swingCos: number;
  bobY: number;
  leftUpperLegX: number;
  rightUpperLegX: number;
  leftLowerLegX: number;
  rightLowerLegX: number;
  leftFootX: number;
  rightFootX: number;
  leftUpperArmX: number;
  rightUpperArmX: number;
  leftLowerArmX: number;
  rightLowerArmX: number;
  leftArmZ: number;
  rightArmZ: number;
  torsoX: number;
  torsoY: number;
  torsoZ: number;
  headX: number;
  headY: number;
  vrmLeftUpper: [number, number, number];
  vrmRightUpper: [number, number, number];
  vrmLeftLower: [number, number, number];
  vrmRightLower: [number, number, number];
  vrmLeftHand: [number, number, number];
  vrmRightHand: [number, number, number];
  vrmSpine: [number, number, number];
  vrmChest: [number, number, number];
  vrmHead: [number, number, number];
  vrmLeftShoulder: [number, number, number];
  vrmRightShoulder: [number, number, number];
}

export function sampleZombieGait(opts: {
  animPhase: number;
  moving: boolean;
  attackAnim?: number;
  skill?: string;
}): ZombieGaitSample {
  const moving = opts.moving;
  const inten = moving ? 1 : 0.22;
  const stride = 0.72;
  const swing = Math.sin(opts.animPhase) * stride * inten;
  const swingCos = Math.cos(opts.animPhase) * stride * inten;
  const limp = Math.sin(opts.animPhase * 0.47) * 0.14;
  const drag = Math.sin(opts.animPhase * 0.23) * 0.06;
  const atk = opts.attackAnim ?? 0;
  const attacking = atk > 0.01;

  const leftUpperLegX = swing * 1.0;
  const rightUpperLegX = -swing * 0.92 + limp * 0.1;
  const leftLowerLegX = Math.max(0.05 * inten, -swingCos) * 0.9 + 0.08 * inten;
  const rightLowerLegX = Math.max(0.05 * inten, swingCos) * 0.85 + 0.07 * inten + limp * 0.12;
  const leftFootX = Math.min(0.2, Math.max(-0.16, -swing * 0.35));
  const rightFootX = Math.min(0.2, Math.max(-0.16, swing * 0.34 + limp * 0.06));
  const bobY =
    Math.abs(Math.sin(opts.animPhase * 0.5)) * 0.05 * inten + Math.max(0, -swingCos) * 0.018 * inten;

  // Proxy: upper ~-1.45 points limb forward (+Z); positive lower bends elbow without folding behind.
  let leftUpperArmX = -1.42 + swing * 0.2 + limp * 0.08;
  let rightUpperArmX = -1.38 - swing * 0.18 - limp * 0.06;
  let leftLowerArmX = 0.55 + Math.abs(swing) * 0.15;
  let rightLowerArmX = 0.5 + Math.abs(swing) * 0.12;
  let leftArmZ = 0.12 + limp * 0.1;
  let rightArmZ = -0.14 - limp * 0.08;
  let torsoX = 0.12 + limp * 0.08;
  let torsoY = limp * 0.1;
  let torsoZ = limp * 0.16 + drag * 0.3;
  let headX = 0.16 + limp * 0.2;
  let headY = limp * 0.3 + Math.sin(opts.animPhase * 0.7) * 0.06 * inten;

  // VRM shambler: hang (Z≈±1.3) + strong forward Y + light pitch
  let vrmLeftUpper: [number, number, number] = [
    0.18 + limp * 0.04,
    0.62 + limp * 0.1 + swing * 0.06,
    1.22,
  ];
  let vrmRightUpper: [number, number, number] = [
    0.16 + limp * 0.03,
    -0.58 - limp * 0.08 - swing * 0.06,
    -1.24,
  ];
  let vrmLeftLower: [number, number, number] = [-1.05 - Math.abs(swing) * 0.1, 0.04, 0.03];
  let vrmRightLower: [number, number, number] = [-1.0 - Math.abs(swing) * 0.08, -0.03, -0.02];
  let vrmLeftHand: [number, number, number] = [0.08, 0.04, 0.06];
  let vrmRightHand: [number, number, number] = [0.06, -0.03, -0.05];
  let vrmSpine: [number, number, number] = [0.12 + limp * 0.06, limp * 0.08, 0.04];
  let vrmChest: [number, number, number] = [0.06 + limp * 0.04, limp * 0.04, 0];
  let vrmHead: [number, number, number] = [0.14 + limp * 0.12, limp * 0.2, -swing * 0.04];
  let vrmLeftShoulder: [number, number, number] = [0.04, 0.06, -0.06];
  let vrmRightShoulder: [number, number, number] = [0.04, -0.06, 0.06];

  if (!moving && !attacking) {
    leftUpperArmX = -1.4 + limp * 0.1;
    rightUpperArmX = -1.36 - limp * 0.08;
    leftLowerArmX = 0.48;
    rightLowerArmX = 0.44;
    leftArmZ = 0.1 + limp * 0.08;
    rightArmZ = -0.12 - limp * 0.06;
    vrmLeftUpper = [0.16, 0.58 + limp * 0.08, 1.24];
    vrmRightUpper = [0.14, -0.55 - limp * 0.06, -1.26];
    vrmLeftLower = [-0.95, 0.03, 0.02];
    vrmRightLower = [-0.9, -0.02, -0.02];
  }

  if (attacking) {
    const wind = Math.min(1, atk / 0.45);
    const strike = atk > 0.45 ? Math.min(1, (atk - 0.45) / 0.25) : 0;
    const skill = opts.skill ?? 'claw';

    if (skill === 'slam' || skill === 'spit') {
      leftUpperArmX = -1.55 - wind * 0.35;
      rightUpperArmX = -1.55 - wind * 0.35;
      leftLowerArmX = 0.35 + strike * 0.4;
      rightLowerArmX = 0.35 + strike * 0.4;
      leftArmZ = 0.15;
      rightArmZ = -0.15;
      torsoX = wind * 0.3 - strike * 0.45;
      headX = wind * 0.2 - strike * 0.3;
      vrmLeftUpper = [0.25 + wind * 0.85, 0.4, 1.12];
      vrmRightUpper = [0.25 + wind * 0.85, -0.4, -1.12];
      vrmLeftLower = [-0.5 - strike * 0.45, 0.03, 0.02];
      vrmRightLower = [-0.5 - strike * 0.45, -0.03, -0.02];
      vrmSpine = [0.1 + wind * 0.25 - strike * 0.45, 0, 0];
      vrmHead = [wind * 0.2 - strike * 0.3, 0, 0];
    } else if (skill === 'roar' || skill === 'shriek') {
      leftUpperArmX = -1.2 - wind * 0.15;
      rightUpperArmX = -1.2 - wind * 0.15;
      leftArmZ = 0.35 + wind * 0.25;
      rightArmZ = -0.35 - wind * 0.25;
      leftLowerArmX = 0.4;
      rightLowerArmX = 0.4;
      torsoX = -0.08 + wind * 0.35;
      headX = -0.4 * wind;
      vrmLeftUpper = [0.15, 0.7 + wind * 0.25, 1.18];
      vrmRightUpper = [0.15, -0.7 - wind * 0.25, -1.18];
      vrmLeftLower = [-0.7, 0.04, 0.02];
      vrmRightLower = [-0.7, -0.04, -0.02];
      vrmSpine = [-0.06 + wind * 0.32, 0, 0];
      vrmChest = [wind * 0.25, 0, 0];
      vrmHead = [-0.4 * wind + strike * 0.12, limp * 0.15, 0];
    } else if (skill === 'lunge') {
      leftUpperArmX = -1.5 - wind * 0.15;
      rightUpperArmX = -1.48 - wind * 0.12;
      leftLowerArmX = 0.45;
      rightLowerArmX = 0.42;
      torsoX = 0.25 * wind;
      vrmLeftUpper = [0.22 + wind * 0.2, 0.65, 1.18];
      vrmRightUpper = [0.2 + wind * 0.18, -0.62, -1.2];
      vrmLeftLower = [-1.1, 0.03, 0.02];
      vrmRightLower = [-1.05, -0.02, -0.02];
      vrmSpine = [0.25 * wind, 0, 0];
    } else {
      rightUpperArmX = -1.5 - wind * 0.2;
      rightArmZ = -0.15 - strike * 0.35;
      rightLowerArmX = 0.45 + wind * 0.2;
      leftUpperArmX = -1.38 + limp * 0.08;
      leftArmZ = 0.12;
      leftLowerArmX = 0.48;
      torsoY = strike * -0.18;
      headY = strike * 0.14;
      vrmRightUpper = [0.2 + wind * 0.3, -0.5 - strike * 0.3, -1.18];
      vrmRightLower = [-1.15 - wind * 0.2, -0.04, -0.02];
      vrmLeftUpper = [0.14, 0.58, 1.24];
      vrmLeftLower = [-0.95, 0.03, 0.02];
      vrmSpine = [strike * 0.1, strike * -0.08, 0];
      vrmHead = [0.1, strike * 0.12, 0];
    }
  }

  return {
    limp,
    swing,
    swingCos,
    bobY,
    leftUpperLegX,
    rightUpperLegX,
    leftLowerLegX,
    rightLowerLegX,
    leftFootX,
    rightFootX,
    leftUpperArmX,
    rightUpperArmX,
    leftLowerArmX,
    rightLowerArmX,
    leftArmZ,
    rightArmZ,
    torsoX,
    torsoY,
    torsoZ,
    headX,
    headY,
    vrmLeftUpper,
    vrmRightUpper,
    vrmLeftLower,
    vrmRightLower,
    vrmLeftHand,
    vrmRightHand,
    vrmSpine,
    vrmChest,
    vrmHead,
    vrmLeftShoulder,
    vrmRightShoulder,
  };
}
