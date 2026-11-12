import { applyEntryToLevels, getDb, markDirty } from "./db";
import { validatePurchaseReturn } from "./purchase-logic";
import { newUid } from "./sync-core";
import type { CartLine, Material, StockEntry, Supplier } from "./types";

/** Add a stock movement to the ledger and share it. */
export async function recordStockEntry(entry: Omit<StockEntry, "id" | "at"> & { id?: string; at?: number }, request?: { by: string; login?: string }): Promise<StockEntry> {
  const db = getDb();
  const now = Date.now();
  const saved: StockEntry = { ...entry, id: entry.id ?? newUid(), at: entry.at ?? now, items: entry.items.filter((i) => i.qty !== 0),
    // The bill desk records it; it waits for the admin's approval before it counts.
    ...(request ? { approval: { status: "pending" as const, requestedBy: request.by, ...(request.login ? { requestedLogin: request.login } : {}), requestedAt: now } } : {}) };
  await db.transaction("rw", db.stockEntries, db.materialLevels, db.materials, async () => {
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
      saved.items = saved.items.map((i) => {
        const bought = purchase.items.find((p) => p.materialId === i.materialId);
        return { ...i, unitCost: bought?.unitCost ?? 0, ...(bought?.name ? { name: bought.name } : {}), ...(bought?.unit ? { unit: bought.unit } : {}) };
      });
      if (!saved.supplierName && purchase.supplierName) saved.supplierName = purchase.supplierName;
    } else {
      throw new Error("Only purchases and linked supplier returns can be recorded.");
    }
    if (saved.type === "purchase") {
      const materials = new Map((await db.materials.toArray()).map((m) => [m.id, m]));
      saved.items = saved.items.map((i) => {
        const m = materials.get(i.materialId);
        return m ? { ...i, name: i.name ?? m.name, unit: i.unit ?? m.unit } : i;
      });
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

/**
 * Edit a purchase item's name and standard price. The unit is set when the item is added and never changes.
 * Purchase bills themselves never change; they keep the name, unit and price they were recorded with.
 */
export async function updateMaterial(material: Material): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.materials, async () => {
    const prior = await db.materials.get(material.id);
    if (!prior) throw new Error("This purchase item no longer exists.");
    if (!material.name.trim() || !Number.isFinite(material.costPerUnit) || (material.costPerUnit ?? -1) < 0) throw new Error("Enter an item name and a valid standard price.");
    if (material.unit !== prior.unit) throw new Error("The unit is fixed when an item is added. Add a new item for a different unit.");
    await db.materials.put({ ...prior, name: material.name.trim().slice(0, 60), costPerUnit: material.costPerUnit ?? 0 });
  });
  await markDirty(["material", material.id]);
}

/** Delete a purchase item from the list. Recorded purchases and returns keep their own copy of its name and unit. */
export async function deleteMaterial(id: string): Promise<void> {
  await getDb().materials.delete(id);
  await markDirty(["material", id]);
}

export async function saveSupplier(supplier: Supplier): Promise<void> {
  await getDb().suppliers.put(supplier);
  await markDirty(["supplier", supplier.id]);
}

export async function deleteSupplier(id: string): Promise<void> {
  await getDb().suppliers.delete(id);
  await markDirty(["supplier", id]);
}

async function assertEditablePurchase(id: string): Promise<StockEntry> {
  const db = getDb();
  const prior = await db.stockEntries.get(id);
  if (!prior || prior.type !== "purchase") throw new Error("This purchase bill no longer exists.");
  if ((await db.stockEntries.toArray()).some((e) => e.purchaseId === id)) throw new Error("This purchase has supplier returns, so it cannot be edited or deleted.");
  return prior;
}

/** Owners/managers correct a saved purchase bill (supplier, invoice, lines). Bills with returns stay locked. */
export async function updatePurchase(id: string, change: Pick<StockEntry, "items"> & { supplierId?: string; supplierName?: string; reference?: string }): Promise<StockEntry> {
  const db = getDb();
  let saved!: StockEntry;
  await db.transaction("rw", db.stockEntries, db.materialLevels, db.materials, async () => {
    const prior = await assertEditablePurchase(id);
    const items = change.items.filter((i) => i.qty !== 0);
    if (!items.length || items.some((i) => !Number.isFinite(i.qty) || i.qty <= 0 || !Number.isFinite(i.unitCost) || (i.unitCost ?? -1) < 0)) throw new Error("Each purchase item needs a positive quantity and a valid unit price.");
    const materials = new Map((await db.materials.toArray()).map((m) => [m.id, m]));
    const { supplierId: _s, supplierName: _n, reference: _r, ...base } = prior;
    saved = { ...base, ...(change.supplierId ? { supplierId: change.supplierId } : {}), ...(change.supplierName ? { supplierName: change.supplierName } : {}), ...(change.reference ? { reference: change.reference } : {}),
      items: items.map((i) => { const m = materials.get(i.materialId); const old = prior.items.find((p) => p.materialId === i.materialId);
        return { ...i, ...(m ? { name: m.name, unit: m.unit } : old?.name ? { name: old.name, unit: old.unit } : {}) } as StockEntry["items"][number]; }) };
    await applyEntryToLevels(db, id, saved);
    await db.stockEntries.put(saved);
  });
  await markDirty(["stock_entry", id]);
  return saved;
}

export async function deletePurchase(id: string): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.stockEntries, db.materialLevels, async () => {
    await assertEditablePurchase(id);
    await applyEntryToLevels(db, id, null);
    await db.stockEntries.delete(id);
  });
  await markDirty(["stock_entry", id]);
}

/** Admin: approve (after checking the supplier bill) or reject a purchase or return the bill desk recorded. */
export async function decidePurchase(id: string, decision: "approved" | "rejected", admin: { name: string }, details: { billChecked?: boolean; note?: string } = {}): Promise<StockEntry> {
  const db = getDb();
  let saved!: StockEntry;
  await db.transaction("rw", db.stockEntries, async () => {
    const prior = await db.stockEntries.get(id);
    if (!prior?.approval) throw new Error("This entry doesn't need approval.");
    if (prior.approval.status !== "pending") throw new Error(prior.approval.status === "approved" ? "Already approved." : "Already rejected.");
    if (decision === "approved" && !details.billChecked) throw new Error("Check the supplier bill first, then tick \"Supplier bill checked\".");
    if (decision === "rejected" && !details.note?.trim()) throw new Error("Give a reason for rejecting.");
    saved = { ...prior, approval: { ...prior.approval, status: decision, decidedBy: admin.name, decidedAt: Date.now(),
      ...(decision === "approved" ? { billChecked: true } : {}), ...(details.note?.trim() ? { note: details.note.trim().slice(0, 200) } : {}) } };
    await db.stockEntries.put(saved);
  });
  await markDirty(["stock_entry", id]);
  return saved;
}
