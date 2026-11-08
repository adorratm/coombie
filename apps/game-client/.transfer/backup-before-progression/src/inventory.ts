import { ITEM_DEFS, type ItemId } from './items';

export interface InventorySlot {
  itemId: ItemId;
  count: number;
}

export interface InventoryState {
  slots: InventorySlot[];
  capacity: number;
  scrap: number;
}

export function createInventory(capacity = 12): InventoryState {
  return { slots: [], capacity, scrap: 0 };
}

export function addItem(inv: InventoryState, itemId: ItemId, amount = 1): boolean {
  if (itemId === 'scrap') {
    inv.scrap += amount;
    return true;
  }
  const def = ITEM_DEFS[itemId];
  let left = amount;
  for (const slot of inv.slots) {
    if (slot.itemId !== itemId) continue;
    const room = def.stackMax - slot.count;
    if (room <= 0) continue;
    const take = Math.min(room, left);
    slot.count += take;
    left -= take;
    if (left <= 0) return true;
  }
  while (left > 0) {
    if (inv.slots.length >= inv.capacity) return left < amount;
    const take = Math.min(def.stackMax, left);
    inv.slots.push({ itemId, count: take });
    left -= take;
  }
  return true;
}

export function consumeItem(inv: InventoryState, itemId: ItemId, amount = 1): boolean {
  let need = amount;
  for (let i = inv.slots.length - 1; i >= 0; i--) {
    const slot = inv.slots[i]!;
    if (slot.itemId !== itemId) continue;
    const take = Math.min(slot.count, need);
    slot.count -= take;
    need -= take;
    if (slot.count <= 0) inv.slots.splice(i, 1);
    if (need <= 0) return true;
  }
  return need <= 0;
}

export function countItem(inv: InventoryState, itemId: ItemId): number {
  if (itemId === 'scrap') return inv.scrap;
  return inv.slots.filter((s) => s.itemId === itemId).reduce((a, s) => a + s.count, 0);
}
