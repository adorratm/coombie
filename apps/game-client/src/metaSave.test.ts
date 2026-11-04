import { beforeEach, describe, expect, it } from 'vitest';
import {
  META_SAVE_VERSION,
  commitRunResults,
  createDefaultMetaSave,
  creditsForRun,
  migrateMetaSave,
  purchaseMetaUnlock,
  writeMetaSave,
  loadMetaSave,
} from './metaSave';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  clear(): void {
    this.data.clear();
  }
}

describe('metaSave', () => {
  beforeEach(() => {
    const mem = new MemoryStorage();
    Object.defineProperty(globalThis, 'localStorage', {
      value: mem,
      configurable: true,
    });
  });

  it('migrates empty/invalid payloads to v1 defaults', () => {
    const migrated = migrateMetaSave(null);
    expect(migrated.version).toBe(META_SAVE_VERSION);
    expect(migrated.credits).toBe(0);
    expect(migrated.unlocked).toEqual([]);
  });

  it('creditsForRun scales with wave and kills', () => {
    const low = creditsForRun({ kills: 10, wave: 1, level: 1, runTimeSec: 30 });
    const high = creditsForRun({ kills: 80, wave: 8, level: 10, runTimeSec: 400 });
    expect(high).toBeGreaterThan(low);
    expect(low).toBeGreaterThanOrEqual(5);
  });

  it('commitRunResults persists credits and bests', () => {
    const base = createDefaultMetaSave();
    writeMetaSave(base);
    const result = commitRunResults(
      { kills: 40, wave: 5, level: 6, runTimeSec: 120 },
      loadMetaSave(),
    );
    expect(result.creditsEarned).toBeGreaterThan(0);
    expect(result.meta.totalRuns).toBe(1);
    expect(result.meta.bestWave).toBe(5);
    expect(result.isNewBestWave).toBe(true);
    const reloaded = loadMetaSave();
    expect(reloaded.credits).toBe(result.meta.credits);
  });

  it('purchaseMetaUnlock spends credits once', () => {
    writeMetaSave({ ...createDefaultMetaSave(), credits: 100 });
    const bought = purchaseMetaUnlock('vital_boot', loadMetaSave());
    expect(bought).not.toBeNull();
    expect(bought!.unlocked).toContain('vital_boot');
    expect(bought!.credits).toBeLessThan(100);
    const again = purchaseMetaUnlock('vital_boot', bought!);
    expect(again).toBeNull();
  });
});
