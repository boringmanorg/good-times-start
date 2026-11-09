import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { toast } from "sonner";
import { Download, EyeOff, Pencil, Plus, Trash2, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getDb } from "@/lib/db";
import { useStaff } from "@/lib/auth-context";
import { formatINR } from "@/lib/billing";
import { newUid } from "@/lib/sync-core";
import { STOCK_UNITS, formatQty, purchaseTotal } from "@/lib/stock-logic";
import { deleteSupplier, recordStockEntry, saveMaterial, saveSupplier, updateMaterial } from "@/lib/stock-actions";
import { canReturnPurchase, remainingPurchaseQty, purchaseItemSummary } from "@/lib/purchase-logic";
import { gstinError } from "@/lib/validation";
import { downloadXlsx } from "@/lib/xlsx";
import { dayKey } from "@/lib/report-logic";
import type { Material, StockEntry, StockUnit, Supplier } from "@/lib/types";
import { Dropdown } from "@/components/Dropdown";
import { Segmented } from "@/components/Segmented";
import { ConfirmButton } from "@/components/ConfirmButton";
import { cn } from "@/lib/utils";
import { can } from "@/lib/permissions";

export const Route = createFileRoute("/stock")({
  head: () => ({
    meta: [
      { title: "Purchase — XTSY POS" },
      { name: "description", content: "Purchase items, supplier invoices, returns and purchase history across your devices." }, { property: "og:title", content: "Purchase — XTSY POS" }, { property: "og:description", content: "Purchase items, supplier invoices, returns and purchase history across your devices." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },],
  }),
  component: StockPage,
});

const inputClass = "mt-1 w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm";
type Tab = "items" | "purchases" | "suppliers" | "history";
function num(raw: string): number | null {
  const value = Number(raw.trim());
  return raw.trim() !== "" && Number.isFinite(value) ? value : null;
}
function MaterialForm({ material, bought = false, onDone }: { material?: Material; bought?: boolean; onDone: () => void }) {
  const [name, setName] = useState(material?.name ?? "");
  const [unit, setUnit] = useState<StockUnit>(material?.unit ?? "kg");
  const [price, setPrice] = useState(material?.costPerUnit !== undefined ? String(material.costPerUnit) : "");
  const [low, setLow] = useState(material?.lowStockLevel ? String(material.lowStockLevel) : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const values = () => {
    const costPerUnit = num(price);
    if (costPerUnit === null || costPerUnit < 0) throw new Error("Enter a standard unit price, 0 or more.");
    const lowStockLevel = low.trim() ? num(low) : 0;
    if (lowStockLevel === null || lowStockLevel < 0) throw new Error("The low-stock level must be 0 or more.");
    return { name: name.trim(), unit, costPerUnit, lowStockLevel };
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      if (material) { await updateMaterial({ ...material, ...values() }); toast.success(`${name.trim()} updated`); }
      else { await saveMaterial({ id: newUid(), ...values() }); toast.success("Item added"); }
      onDone();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save item"); } finally { setBusy(false); }
  };
  const setHidden = async (archived: boolean) => {
    if (!material) return;
    setBusy(true); setError("");
    try { await updateMaterial({ ...material, archived }); toast.success(archived ? `${material.name} hidden from the list` : `${material.name} is back on the list`); onDone(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not update item"); } finally { setBusy(false); }
  };
  return <form className="space-y-4" onSubmit={(e) => void submit(e)}>
    <label className="block text-sm font-medium">Item name<input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className={inputClass}/></label>
    <div className="grid grid-cols-2 gap-3">
      <label className="block text-sm font-medium">Unit<Dropdown ariaLabel="Unit" disabled={bought} value={unit} onChange={setUnit} options={STOCK_UNITS.map((u) => ({ value: u.v, label: u.l }))}/>
        {bought ? <span className="mt-1 block text-xs font-normal text-muted-foreground">Locked: purchases are recorded in {material?.unit}.</span> : null}</label>
      <label className="block text-sm font-medium">Standard price / {unit}<input required aria-label="Standard price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass}/></label>
    </div>
    <label className="block text-sm font-medium">Low-stock level ({unit}, optional)<input aria-label="Low-stock level" inputMode="decimal" value={low} onChange={(e) => setLow(e.target.value)} placeholder="0" className={inputClass}/></label>
    {material ? <p className="text-xs text-muted-foreground">Past purchase bills keep the prices they were recorded at.</p> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={busy}>{material ? "Save changes" : "Add item"}</Button>
      <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
      {material ? (material.archived
        ? <Button type="button" variant="outline" className="ml-auto" disabled={busy} onClick={() => void setHidden(false)}>Show on list again</Button>
        : <ConfirmButton id={`hide-material-${material.id}`} className={cn(buttonVariants({ variant: "ghost" }), "ml-auto text-destructive hover:text-destructive")} armedClassName="!bg-destructive !text-destructive-foreground"
            onConfirm={() => setHidden(true)} confirm={<><EyeOff />Tap again to hide</>}><EyeOff />Hide item</ConfirmButton>) : null}
    </div>
  </form>;
}

function PurchaseForm({ materials, suppliers, onDone }: { materials: Material[]; suppliers: Supplier[]; onDone: () => void }) {
  const { user } = useStaff();
  const [supplierId, setSupplierId] = useState("");
  const [reference, setReference] = useState("");
  const [rows, setRows] = useState([{ key: newUid(), materialId: materials[0]?.id ?? "", qty: "", cost: String(materials[0]?.costPerUnit ?? 0) }]);
  const [error, setError] = useState("");
  const parsed = rows.map((r) => ({ materialId: r.materialId, qty: num(r.qty), unitCost: num(r.cost) }));
  const valid = parsed.filter((p) => p.materialId && p.qty !== null && p.qty > 0);
  const total = purchaseTotal(valid.map((p) => ({ materialId: p.materialId, qty: p.qty ?? 0, unitCost: p.unitCost ?? 0 })));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (valid.length !== rows.length || parsed.some((p) => p.unitCost === null || (p.unitCost ?? -1) < 0)) { setError("Add all items with a quantity. Costs must be numbers."); return; }
    const items = valid.map((p) => ({ materialId: p.materialId, qty: p.qty ?? 0, ...(p.unitCost !== undefined && p.unitCost !== null ? { unitCost: p.unitCost } : {}) }));
    try {
      await recordStockEntry({ type: "purchase", items, ...(supplierId ? { supplierId, supplierName: suppliers.find((s) => s.id === supplierId)?.name ?? "" } : {}), ...(reference.trim() ? { reference: reference.trim() } : {}), ...(user ? { by: user.displayName } : {}) });
    } catch (e) { setError(e instanceof Error ? e.message : "Could not record purchase"); return; }
    toast.success(`Purchase of ${formatINR(total, 0)} recorded`);
    onDone();
  };

  return (
    <form className="space-y-3" onSubmit={(event) => void submit(event)}>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium">Supplier
          <Dropdown ariaLabel="Supplier" className="mt-1" value={supplierId} onChange={setSupplierId}
            options={[{ value: "", label: "Not recorded" }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]} />
        </label>
        <label className="block text-sm font-medium">Invoice number<input maxLength={40} value={reference} onChange={(e) => setReference(e.target.value)} className={inputClass} /></label>
      </div>
      <div className="space-y-2">
        {rows.map((row, index) => {
          const unit = materials.find((m) => m.id === row.materialId)?.unit ?? "";
          const update = (change: Partial<typeof row>) => setRows(rows.map((r, i) => (i === index ? { ...r, ...change } : r)));
          return (
            <div key={row.key} className="flex gap-2">
              <Dropdown ariaLabel="Item" className="min-w-0 flex-1" value={row.materialId} onChange={(materialId) => update({ materialId, cost: String(materials.find((m) => m.id === materialId)?.costPerUnit ?? 0) })} placeholder="Choose item"
                options={materials.map((m) => ({ value: m.id, label: m.name, hint: m.unit }))} />
              <input aria-label="Quantity" inputMode="decimal" value={row.qty} onChange={(e) => update({ qty: e.target.value })} placeholder={unit || "Qty"} className="w-20 rounded-lg border border-input bg-card px-2 py-2 text-right text-sm" />
              <input aria-label="Cost per unit" inputMode="decimal" value={row.cost} onChange={(e) => update({ cost: e.target.value })} placeholder={`₹/${unit}`} className="w-20 rounded-lg border border-input bg-card px-2 py-2 text-right text-sm" />
              {rows.length > 1 ? <Button type="button" size="icon" variant="ghost" aria-label="Remove line" onClick={() => setRows(rows.filter((_, i) => i !== index))}><X /></Button> : null}
            </div>
          );
        })}
      </div>
      <Button type="button" size="sm" variant="ghost" onClick={() => setRows([...rows, { key: newUid(), materialId: materials[0]?.id ?? "", qty: "", cost: String(materials[0]?.costPerUnit ?? 0) }])}><Plus />Add line</Button>
      <p className="text-right text-sm font-semibold">Total {formatINR(total)}</p>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <ConfirmButton id="stock-purchase" submit disabled={!valid.length} className={buttonVariants()} armedClassName="!bg-gold !text-gold-foreground" confirm="Tap again to record">Record purchase</ConfirmButton>
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}

function SupplierForm({ supplier, onDone }: { supplier: Supplier | null; onDone: () => void }) {
  const [name, setName] = useState(supplier?.name ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [gstin, setGstin] = useState(supplier?.gstin ?? "");
  const [note, setNote] = useState(supplier?.note ?? "");
  const gstProblem = gstinError(gstin);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || gstProblem) return;
    await saveSupplier({ id: supplier?.id ?? newUid(), name: name.trim().slice(0, 80), ...(phone.trim() ? { phone: phone.trim() } : {}),
      ...(gstin.trim() ? { gstin: gstin.trim().toUpperCase() } : {}), ...(note.trim() ? { note: note.trim() } : {}) });
    toast.success(supplier ? `${name.trim()} updated` : `${name.trim()} added`);
    onDone();
  };
  const remove = async () => {
    if (!supplier) return;
    await deleteSupplier(supplier.id);
    onDone();
  };
  return (
    <form className="space-y-3" onSubmit={(event) => void submit(event)}>
      <label className="block text-sm font-medium">Name<input autoFocus required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium">Phone<input type="tel" maxLength={20} value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} /></label>
        <label className="block text-sm font-medium">GSTIN<input maxLength={15} value={gstin} onChange={(e) => setGstin(e.target.value)} className={`${inputClass} uppercase`} />
          {gstProblem ? <span className="mt-1 block text-xs font-normal text-destructive">{gstProblem}</span> : null}</label>
      </div>
      <label className="block text-sm font-medium">What they supply<input maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Dairy, vegetables…" className={inputClass} /></label>
      <div className="flex gap-2">
        <Button type="submit" disabled={!name.trim() || !!gstProblem}>{supplier ? "Save supplier" : "Add supplier"}</Button>
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        {supplier ? <ConfirmButton id={`delete-supplier-${supplier.id}`} className={cn(buttonVariants({ variant: "ghost" }), "ml-auto text-destructive hover:text-destructive")} armedClassName="!bg-destructive !text-destructive-foreground"
          onConfirm={remove} confirm={<><Trash2 />Tap again to delete</>}><Trash2 />Delete</ConfirmButton> : null}
      </div>
    </form>
  );
}

function ReturnForm({ purchase, entries, materials, onDone }: { purchase: StockEntry; entries: StockEntry[]; materials: Material[]; onDone: () => void }) {
  const { user } = useStaff();
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (busy) return; setBusy(true);
    try {
      const items = [...new Set(purchase.items.map((i) => i.materialId))].flatMap((id) => {
        const raw = quantities[id] ?? "";
        if (!raw.trim()) return [];
        const qty = num(raw);
        if (qty === null || qty <= 0) throw new Error("Enter a positive return quantity.");
        return [{ materialId: id, qty: -qty }];
      });
      await recordStockEntry({ type: "return", purchaseId: purchase.id, items, ...(purchase.supplierId ? { supplierId: purchase.supplierId } : {}), ...(purchase.reference ? { reference: purchase.reference } : {}), ...(user ? { by: user.displayName } : {}) });
      toast.success("Supplier return recorded"); onDone();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not record return"); } finally { setBusy(false); }
  };
  return <form onSubmit={(e) => void submit(e)} className="space-y-4">
    <p className="text-sm text-muted-foreground">Return deadline: {new Date(purchase.at + 48 * 3600000).toLocaleString("en-IN")}</p>
    {[...new Set(purchase.items.map((i) => i.materialId))].map((id) => {
      const material = materials.find((m) => m.id === id);
      const remaining = remainingPurchaseQty(purchase, entries, id);
      return <label key={id} className="block text-sm font-medium">{material?.name ?? id}<span className="block text-xs text-muted-foreground">Remaining {formatQty(remaining, material?.unit ?? "pcs")}</span>
        <input aria-label={`Return quantity ${material?.name ?? id}`} disabled={remaining <= 0} inputMode="decimal" value={quantities[id] ?? ""} onChange={(e) => setQuantities({ ...quantities, [id]: e.target.value })} className={inputClass}/>
      </label>;
    })}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <Button type="submit" disabled={busy}>Record return</Button>
  </form>;
}

type Sheet = { kind: "item"; material?: Material } | { kind: "purchase" } | { kind: "supplier"; supplier: Supplier | null } | { kind: "return"; purchase: StockEntry };
function StockPage() {
  const { user } = useStaff();
  const admin = can(user, "stock.purchase");
  const materials = useLiveQuery(() => getDb().materials.toArray(), [], []);
  const suppliers = useLiveQuery(() => getDb().suppliers.toArray(), [], []);
  const entries = useLiveQuery(() => getDb().stockEntries.orderBy("at").reverse().toArray(), [], []);
  const purchases = entries.filter((e) => e.type === "purchase");
  const history = entries.filter((e) => e.type === "purchase" || e.purchaseId);
  const active = materials.filter((m) => !m.archived).sort((a, b) => a.name.localeCompare(b.name));
  const [tab, setTab] = useState<Tab>("items");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const close = () => setSheet(null);
  const nameOf = (id: string) => materials.find((m) => m.id === id)?.name ?? "Unknown item";
  const unitOf = (id: string) => materials.find((m) => m.id === id)?.unit ?? "pcs";
  const exportPurchase = () => downloadXlsx(`purchase-${dayKey(Date.now())}`, [
    { name: "Items", title: "Purchase items", columns: [{ header: "Item" }, { header: "Unit" }, { header: "Standard price", format: "inr" }, { header: "Last quantity", format: "qty" }, { header: "Last unit price", format: "inr" }, { header: "Purchases" }, { header: "Average days between" }], rows: active.map((m) => { const p = purchaseItemSummary(m, purchases); return [m.name, m.unit, m.costPerUnit ?? null, p.lastQty ?? null, p.lastPrice ?? null, p.count, p.averageDays ?? null]; }) },
    { name: "History", title: "Purchase and return history", columns: [{ header: "Date", format: "datetime" }, { header: "Type" }, { header: "Supplier" }, { header: "Invoice" }, { header: "Item" }, { header: "Quantity", format: "qty" }, { header: "Unit price", format: "inr" }, { header: "Purchase ID" }], rows: history.flatMap((e) => e.items.map((i) => [e.at, e.purchaseId ? "Supplier return" : "Purchase", e.supplierName ?? suppliers.find((s) => s.id === e.supplierId)?.name ?? "", e.reference ?? "", nameOf(i.materialId), i.qty, i.unitCost ?? null, e.purchaseId ?? e.id])) },
  ], { title: "Purchase" });
  const hidden = materials.filter((m) => m.archived).sort((a, b) => a.name.localeCompare(b.name));
  const [showHidden, setShowHidden] = useState(false);
  const shown = (showHidden ? hidden : active).filter((m) => m.name.toLowerCase().includes(search.toLowerCase()));
  const boughtIds = new Set(entries.flatMap((e) => e.items.map((i) => i.materialId)));
  return <AppShell><div className="mx-auto max-w-6xl p-4 lg:p-6">
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Purchase</h1><p className="text-sm text-muted-foreground">{active.length} items · {purchases.length} purchase bills</p></div>
      {admin ? <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setSheet({ kind: "item" })}><Plus/>Item</Button><Button variant="outline" onClick={exportPurchase}><Download/>Excel</Button><Button disabled={!active.length} onClick={() => setSheet({ kind: "purchase" })}><Plus/>Purchase</Button></div> : null}
    </header>
    <Segmented ariaLabel="Purchase view" stretch value={tab} onChange={setTab} options={[{ value: "items", label: "Items" }, { value: "purchases", label: "Purchases" }, { value: "suppliers", label: "Suppliers" }, { value: "history", label: "History" }]}/>
    {tab === "items" ? <div className="mt-4"><div className="mb-4 flex flex-wrap items-center gap-2"><input aria-label="Find purchase item" placeholder="Find item" value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-48 flex-1 rounded-lg border border-input bg-card px-3 py-2 text-sm"/>
        {hidden.length || showHidden ? <Button variant="ghost" size="sm" onClick={() => setShowHidden(!showHidden)}>{showHidden ? "Back to items" : `Hidden items (${hidden.length})`}</Button> : null}</div>
      <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="border-b border-border text-xs text-muted-foreground"><tr>{["Item", "Standard price / unit", "Last purchased qty", "Last unit price", "Purchase frequency", ...(admin ? [""] : [])].map((h, i) => <th key={h || i} className="p-3">{h}</th>)}</tr></thead><tbody className="divide-y divide-border">{shown.map((m) => { const p = purchaseItemSummary(m, purchases); return <tr key={m.id}><td className="p-3 font-semibold"><Button variant="ghost" onClick={() => setSelected(selected === m.id ? null : m.id)}>{m.name}</Button>{selected === m.id ? <ul className="mt-2 space-y-2 text-xs font-normal text-muted-foreground">{purchases.filter((e) => e.items.some((i) => i.materialId === m.id)).map((e) => <li key={e.id}>{new Date(e.at).toLocaleString("en-IN")} · {e.reference || "No invoice"} · {e.items.filter((i) => i.materialId === m.id).map((i) => `${formatQty(i.qty, m.unit)} at ${formatINR(i.unitCost ?? 0)}`).join(", ")}</li>)}{!p.count ? <li>No purchases yet</li> : null}</ul> : null}</td><td className="p-3">{m.costPerUnit !== undefined ? formatINR(m.costPerUnit) : "—"} / {m.unit}</td><td className="p-3">{p.lastQty !== undefined ? formatQty(p.lastQty, m.unit) : "—"}{p.lastAt ? <span className="block text-xs text-muted-foreground">{new Date(p.lastAt).toLocaleDateString("en-IN")}</span> : null}</td><td className="p-3">{p.lastPrice !== undefined ? formatINR(p.lastPrice) : "—"}</td><td className="p-3">{p.count} purchases{p.averageDays !== undefined ? <span className="block text-xs text-muted-foreground">Every {p.averageDays.toFixed(1)} days on average</span> : null}</td>{admin ? <td className="p-3 text-right"><Button size="sm" variant="outline" aria-label={`Edit ${m.name}`} onClick={() => setSheet({ kind: "item", material: m })}><Pencil />Edit</Button></td> : null}</tr>; })}</tbody></table></div>{!shown.length ? <p className="py-8 text-center text-sm text-muted-foreground">No items found</p> : null}
    </div> : null}
    {tab === "purchases" || tab === "history" ? <ul className="mt-4 divide-y divide-border">{(tab === "purchases" ? purchases : history).map((p) => <li key={p.id} className="py-4 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><div className="font-semibold">{p.purchaseId ? "Supplier return" : "Purchase"} · {p.supplierName ?? suppliers.find((s) => s.id === p.supplierId)?.name ?? "Supplier not recorded"}<span className="ml-2 font-normal text-muted-foreground">{p.reference ? `Invoice ${p.reference}` : ""}</span></div><span className="font-semibold">{formatINR(p.items.reduce((n, i) => n + Math.abs(i.qty) * (i.unitCost ?? 0), 0))}</span></div><p className="mt-1 text-xs text-muted-foreground">{new Date(p.at).toLocaleString("en-IN")}{p.by ? ` · ${p.by}` : ""}</p><ul className="mt-2 space-y-1">{p.items.map((i, index) => <li key={index}>{nameOf(i.materialId)} · {formatQty(Math.abs(i.qty), unitOf(i.materialId))} · {i.unitCost !== undefined ? formatINR(i.unitCost) : "—"} / {unitOf(i.materialId)}</li>)}</ul>{admin && canReturnPurchase(p) && p.items.some((i) => remainingPurchaseQty(p, entries, i.materialId) > 0) ? <Button size="sm" variant="outline" className="mt-3" onClick={() => setSheet({ kind: "return", purchase: p })}>Return items</Button> : null}{p.purchaseId ? <p className="mt-2 text-xs text-muted-foreground">Original purchase: {p.reference || p.purchaseId}</p> : null}</li>)}{!(tab === "purchases" ? purchases : history).length ? <li className="py-8 text-center text-muted-foreground">No purchase history yet</li> : null}</ul> : null}
    {tab === "suppliers" ? <div className="mt-4">{admin ? <Button variant="outline" onClick={() => setSheet({ kind: "supplier", supplier: null })}><Plus/>Add supplier</Button> : null}<ul className="mt-3 divide-y divide-border">{suppliers.map((s) => <li key={s.id} className="flex items-center justify-between gap-3 py-3"><div><p className="text-sm font-semibold">{s.name}</p><p className="text-xs text-muted-foreground">{[s.phone, s.gstin, s.note].filter(Boolean).join(" · ")}</p></div>{admin ? <Button size="icon" variant="ghost" aria-label={`Edit ${s.name}`} onClick={() => setSheet({ kind: "supplier", supplier: s })}><Pencil/></Button> : null}</li>)}</ul></div> : null}
  </div><Dialog open={!!sheet} onOpenChange={(open) => { if (!open) close(); }}><DialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto">
    {sheet?.kind === "item" ? <><DialogTitle>{sheet.material ? "Edit purchase item" : "Add purchase item"}</DialogTitle><MaterialForm key={sheet.material?.id ?? "new"} {...(sheet.material ? { material: sheet.material, bought: boughtIds.has(sheet.material.id) } : {})} onDone={close}/></> : null}
    {sheet?.kind === "purchase" ? <><DialogTitle>Record purchase</DialogTitle><PurchaseForm materials={active} suppliers={suppliers} onDone={close}/></> : null}
    {sheet?.kind === "return" ? <><DialogTitle>Return purchased items</DialogTitle><ReturnForm purchase={sheet.purchase} entries={entries} materials={materials} onDone={close}/></> : null}
    {sheet?.kind === "supplier" ? <><DialogTitle>{sheet.supplier ? "Edit supplier" : "Add supplier"}</DialogTitle><SupplierForm supplier={sheet.supplier} onDone={close}/></> : null}
  </DialogContent></Dialog></AppShell>;
}
