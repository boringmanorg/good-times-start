import { applyEntryToLevels, getDb, markDirty } from "./db";
import { validatePurchaseReturn } from "./purchase-logic";
import { newUid } from "./sync-core";
import type { CartLine, Material, StockEntry, Supplier } from "./types";

/** Add a stock movement to the ledger and share it. */
export async function recordStockEntry(entry: Omit<StockEntry, "id" | "at"> & { id?: string; at?: number }): Promise<StockEntry> {
  const db = getDb();
  const saved: StockEntry = { ...entry, id: entry.id ?? newUid(), at: entry.at ?? Date.now(), items: entry.items.filter((i) => i.qty !== 0) };
  await db.transaction("rw", db.stockEntries, db.materialLevels, async () => {
    const existing = await db.stockEntries.get(saved.id);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(saved)) throw new Error("Recorded purchase entries cannot be modified.");
      return;
    }
    if (saved.type === "purchase") {
      if (!saved.items.length || saved.items.some((i) => !Number.isFinite(i.qty) || i.qty <= 0 || !Number.isFinite(i.unitCost) || (i.unitCost ?? -1) < 0)) {
        throw new Error("Each purchase item needs a positive quantity and a valid unit price.");
      }
    } else if (saved.type === "return" && saved.purchaseId) {
      const purchase = await db.stockEntries.get(saved.purchaseId);
      if (!purchase) throw new Error("Original supplier purchase not found.");
      validatePurchaseReturn(purchase, await db.stockEntries.toArray(), saved.items);
      saved.items = saved.items.map((i) => ({ ...i, unitCost: purchase.items.find((p) => p.materialId === i.materialId)?.unitCost ?? 0 }));
    } else {
      throw new Error("Only purchases and linked supplier returns can be recorded.");
    }
    await applyEntryToLevels(db, saved.id, saved);
    await db.stockEntries.add(saved);
  });
  await markDirty(["stock_entry", saved.id]);
  return saved;
}

/** Recipe management is deferred; sales never create ingredient movements. */
export async function recordSaleConsumption(_lines: CartLine[], _ref: { orderUid: string; billNo: string; by?: string | undefined }): Promise<void> {}

/** Voiding restaurant sales must not create supplier returns. */
export async function reverseSaleConsumption(_lines: CartLine[], _ref: { orderUid: string; billNo: string; by?: string | undefined }): Promise<void> {}

export async function saveMaterial(material: Material): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.materials, async () => {
    if (await db.materials.get(material.id)) throw new Error("Purchase items cannot be modified after adding them.");
    if (!material.name.trim() || !Number.isFinite(material.costPerUnit) || (material.costPerUnit ?? -1) < 0) throw new Error("Enter an item name and a valid standard price.");
    await db.materials.add(material);
  });
  await markDirty(["material", material.id]);
}

export async function saveSupplier(supplier: Supplier): Promise<void> {
  await getDb().suppliers.put(supplier);
  await markDirty(["supplier", supplier.id]);
}

export async function deleteSupplier(id: string): Promise<void> {
  await getDb().suppliers.delete(id);
  await markDirty(["supplier", id]);
}
