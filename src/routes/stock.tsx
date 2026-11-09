import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { toast } from "sonner";
import { ChevronRight, Download, Pencil, Plus, Trash2, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getDb } from "@/lib/db";
import { useStaff } from "@/lib/auth-context";
import { formatINR } from "@/lib/billing";
import { newUid } from "@/lib/sync-core";
import { STOCK_UNITS, formatQty, purchaseTotal } from "@/lib/stock-logic";
import { deleteMaterial, deleteSupplier, recordStockEntry, saveMaterial, saveSupplier, updateMaterial } from "@/lib/stock-actions";
import { canReturnPurchase, entryAmount, itemPurchaseLines, itemTotals, remainingPurchaseQty, supplierHistories } from "@/lib/purchase-logic";
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
function MaterialForm({ material, onDone }: { material?: Material; onDone: () => void }) {
  const [name, setName] = useState(material?.name ?? "");
  const [unit, setUnit] = useState<StockUnit>(material?.unit ?? "kg");
  const [price, setPrice] = useState(material?.costPerUnit !== undefined ? String(material.costPerUnit) : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const costPerUnit = num(price);
      if (costPerUnit === null || costPerUnit < 0) throw new Error("Enter a standard unit price, 0 or more.");
      if (material) { await updateMaterial({ ...material, name: name.trim(), costPerUnit }); toast.success(`${name.trim()} updated`); }
      else { await saveMaterial({ id: newUid(), name: name.trim(), unit, costPerUnit, lowStockLevel: 0 }); toast.success("Item added"); }
      onDone();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save item"); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!material) return;
    try { await deleteMaterial(material.id); toast.success(`${material.name} deleted`); onDone(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not delete item"); }
  };
  return <form className="space-y-4" onSubmit={(e) => void submit(e)}>
    <label className="block text-sm font-medium">Item name<input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className={inputClass}/></label>
    <div className="grid grid-cols-2 gap-3">
      {material ? <div className="text-sm font-medium">Unit<p className="mt-1 rounded-lg border border-border bg-secondary px-3 py-2.5 text-sm">{STOCK_UNITS.find((u) => u.v === material.unit)?.l ?? material.unit}</p>
        <span className="mt-1 block text-xs font-normal text-muted-foreground">Set when the item was added.</span></div>
        : <label className="block text-sm font-medium">Unit<Dropdown ariaLabel="Unit" className="mt-1" value={unit} onChange={setUnit} options={STOCK_UNITS.map((u) => ({ value: u.v, label: u.l }))}/>
          <span className="mt-1 block text-xs font-normal text-muted-foreground">Can't be changed later.</span></label>}
      <label className="block text-sm font-medium">Standard price / {material?.unit ?? unit}<input required aria-label="Standard price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass}/></label>
    </div>
    {material ? <p className="text-xs text-muted-foreground">Saved purchase bills keep the name, quantity and price they were recorded with.</p> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={busy}>{material ? "Save changes" : "Add item"}</Button>
      <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
      {material ? <ConfirmButton id={`delete-material-${material.id}`} className={cn(buttonVariants({ variant: "ghost" }), "ml-auto text-destructive hover:text-destructive")} armedClassName="!bg-destructive !text-destructive-foreground"
        onConfirm={remove} confirm={<><Trash2 />Tap again to delete</>}><Trash2 />Delete item</ConfirmButton> : null}
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
const dateText = (at: number) => new Date(at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const timeText = (at: number) => new Date(at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

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
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [openVendor, setOpenVendor] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const close = () => setSheet(null);
  const material = (id: string) => materials.find((m) => m.id === id);
  const lineName = (i: StockEntry["items"][number]) => i.name ?? material(i.materialId)?.name ?? "Deleted item";
  const lineUnit = (i: StockEntry["items"][number]): StockUnit => i.unit ?? material(i.materialId)?.unit ?? "pcs";
  const vendors = supplierHistories(entries, suppliers);
  const shown = active.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()));
  const exportPurchase = () => downloadXlsx(`purchase-${dayKey(Date.now())}`, [
    { name: "Items", title: "Purchase items", columns: [{ header: "Item" }, { header: "Unit" }, { header: "Standard price", format: "inr" }, { header: "Bought (net)", format: "qty" }, { header: "Amount", format: "inr" }, { header: "Bills" }], rows: active.map((m) => { const t = itemTotals(itemPurchaseLines(m.id, entries, suppliers)); return [m.name, m.unit, m.costPerUnit ?? null, t.qty, t.amount, t.bills]; }) },
    { name: "Vendors", title: "Purchases by vendor and day", columns: [{ header: "Vendor" }, { header: "Day" }, { header: "Amount", format: "inr" }, { header: "Bills" }], rows: vendors.flatMap((v) => v.days.map((d) => [v.name, d.day, d.amount, d.entries.filter((e) => e.type === "purchase").length])) },
    { name: "History", title: "Purchase and return history", columns: [{ header: "Date", format: "datetime" }, { header: "Type" }, { header: "Vendor" }, { header: "Invoice" }, { header: "Item" }, { header: "Quantity", format: "qty" }, { header: "Unit" }, { header: "Unit price", format: "inr" }, { header: "Amount", format: "inr" }], rows: history.flatMap((e) => e.items.map((i) => [e.at, e.purchaseId ? "Supplier return" : "Purchase", e.supplierName ?? suppliers.find((s) => s.id === e.supplierId)?.name ?? "", e.reference ?? "", lineName(i), Math.abs(i.qty), lineUnit(i), i.unitCost ?? null, (e.purchaseId ? -1 : 1) * Math.abs(i.qty) * (i.unitCost ?? 0)])) },
  ], { title: "Purchase" });

  const billCard = (p: StockEntry) => <li key={p.id} className="py-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><div className="font-semibold">{p.purchaseId ? "Supplier return" : "Purchase"} · {p.supplierName ?? suppliers.find((s) => s.id === p.supplierId)?.name ?? "Supplier not recorded"}<span className="ml-2 font-normal text-muted-foreground">{p.reference ? `Invoice ${p.reference}` : ""}</span></div>
      <span className={cn("font-semibold tabular-nums", p.purchaseId && "text-destructive")}>{formatINR(entryAmount(p))}</span></div>
    <p className="mt-0.5 text-xs text-muted-foreground">{dateText(p.at)}, {timeText(p.at)}{p.by ? ` · ${p.by}` : ""}</p>
    <table className="mt-2 w-full text-xs"><tbody>{p.items.map((i, index) => <tr key={index} className="border-t border-border/60"><td className="py-1 pr-2">{lineName(i)}</td><td className="py-1 pr-2 text-right tabular-nums">{formatQty(Math.abs(i.qty), lineUnit(i))}</td><td className="py-1 pr-2 text-right tabular-nums">{i.unitCost !== undefined ? `${formatINR(i.unitCost)} / ${lineUnit(i)}` : "—"}</td><td className="py-1 text-right font-semibold tabular-nums">{formatINR(Math.abs(i.qty) * (i.unitCost ?? 0))}</td></tr>)}</tbody></table>
    {admin && canReturnPurchase(p) && p.items.some((i) => remainingPurchaseQty(p, entries, i.materialId) > 0) ? <Button size="sm" variant="outline" className="mt-2" onClick={() => setSheet({ kind: "return", purchase: p })}>Return items</Button> : null}
    {p.purchaseId ? <p className="mt-1 text-xs text-muted-foreground">Against purchase {entries.find((e) => e.id === p.purchaseId)?.reference || "without invoice no."}</p> : null}
  </li>;

  return <AppShell><div className="mx-auto max-w-6xl p-4 lg:p-6">
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Purchase</h1><p className="text-sm text-muted-foreground">{active.length} items · {purchases.length} purchase bills · {formatINR(vendors.reduce((n, v) => n + v.amount, 0), 0)} purchased</p></div>
      {admin ? <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setSheet({ kind: "item" })}><Plus/>Item</Button><Button variant="outline" onClick={exportPurchase}><Download/>Excel</Button><Button disabled={!active.length} onClick={() => setSheet({ kind: "purchase" })}><Plus/>Purchase</Button></div> : null}
    </header>
    <Segmented ariaLabel="Purchase view" stretch value={tab} onChange={setTab} options={[{ value: "items", label: "Items" }, { value: "purchases", label: "Purchases" }, { value: "suppliers", label: "Vendors" }, { value: "history", label: "History" }]}/>

    {tab === "items" ? <div className="mt-4"><input aria-label="Find purchase item" placeholder="Find item" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-4 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"/>
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-border text-xs text-muted-foreground"><tr>
        <th className="p-3">Item</th><th className="p-3">Standard price</th><th className="p-3">Last purchase</th><th className="p-3 text-right">Bought (net)</th><th className="p-3 text-right">Amount</th>{admin ? <th className="p-3"><span className="sr-only">Edit</span></th> : null}</tr></thead>
        <tbody className="divide-y divide-border">{shown.map((m) => {
          const lines = itemPurchaseLines(m.id, entries, suppliers);
          const totals = itemTotals(lines);
          const last = lines.find((l) => l.kind === "purchase");
          const open = openItem === m.id;
          return <Fragment key={m.id}><tr className={open ? "bg-secondary/50" : undefined}>
            <td className="p-3"><button type="button" aria-expanded={open} onClick={() => setOpenItem(open ? null : m.id)} className="flex items-center gap-2 text-left font-semibold">
              <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />{m.name}</button></td>
            <td className="p-3 tabular-nums">{m.costPerUnit !== undefined ? formatINR(m.costPerUnit) : "—"} / {m.unit}</td>
            <td className="p-3">{last ? <><span className="tabular-nums">{formatQty(last.qty, m.unit)} at {formatINR(last.unitCost)}</span><span className="block text-xs text-muted-foreground">{last.supplier} · {dateText(last.at)}</span></> : <span className="text-muted-foreground">Not bought yet</span>}</td>
            <td className="p-3 text-right tabular-nums">{totals.bills ? formatQty(totals.qty, m.unit) : "—"}<span className="block text-xs text-muted-foreground">{totals.bills} {totals.bills === 1 ? "bill" : "bills"}</span></td>
            <td className="p-3 text-right font-semibold tabular-nums">{totals.bills ? formatINR(totals.amount) : "—"}</td>
            {admin ? <td className="p-3 text-right"><Button size="sm" variant="outline" aria-label={`Edit ${m.name}`} onClick={() => setSheet({ kind: "item", material: m })}><Pencil />Edit</Button></td> : null}
          </tr>
          {open ? <tr className="bg-secondary/30"><td colSpan={admin ? 6 : 5} className="px-3 pb-4 pt-1">
            {lines.length ? <table className="w-full text-xs"><thead className="text-muted-foreground"><tr><th className="py-1.5 text-left font-medium">Date</th><th className="py-1.5 text-left font-medium">Vendor</th><th className="py-1.5 text-left font-medium">Invoice</th><th className="py-1.5 text-right font-medium">Qty</th><th className="py-1.5 text-right font-medium">Price / {m.unit}</th><th className="py-1.5 text-right font-medium">Amount</th></tr></thead>
              <tbody>{lines.map((l, i) => <tr key={`${l.entryId}-${i}`} className="border-t border-border/60"><td className="py-1.5">{dateText(l.at)}{l.kind === "return" ? <span className="ml-1.5 rounded bg-destructive/10 px-1.5 py-0.5 font-semibold text-destructive">Return</span> : null}</td><td className="py-1.5">{l.supplier}</td><td className="py-1.5">{l.invoice || "—"}</td>
                <td className="py-1.5 text-right tabular-nums">{formatQty(l.qty, m.unit)}</td><td className="py-1.5 text-right tabular-nums">{formatINR(l.unitCost)}</td><td className={cn("py-1.5 text-right font-semibold tabular-nums", l.kind === "return" && "text-destructive")}>{formatINR(l.amount)}</td></tr>)}</tbody></table>
              : <p className="py-2 text-xs text-muted-foreground">No purchases of {m.name} yet.</p>}
          </td></tr> : null}</Fragment>;
        })}</tbody></table></div>{!shown.length ? <p className="py-8 text-center text-sm text-muted-foreground">No items found</p> : null}
    </div> : null}

    {tab === "purchases" || tab === "history" ? <ul className="mt-4 divide-y divide-border">{(tab === "purchases" ? purchases : history).map(billCard)}{!(tab === "purchases" ? purchases : history).length ? <li className="py-8 text-center text-muted-foreground">No purchase history yet</li> : null}</ul> : null}

    {tab === "suppliers" ? <div className="mt-4 space-y-3">
      {admin ? <Button variant="outline" onClick={() => setSheet({ kind: "supplier", supplier: null })}><Plus/>Add vendor</Button> : null}
      {[...vendors, ...suppliers.filter((s) => !vendors.some((v) => v.key === s.id)).map((s) => ({ key: s.id, name: s.name, amount: 0, bills: 0, returns: 0, lastAt: 0, days: [] }))].map((v) => {
        const supplier = suppliers.find((s) => s.id === v.key);
        const open = openVendor === v.key;
        return <section key={v.key} className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-3 p-4">
            <button type="button" aria-expanded={open} disabled={!v.days.length} onClick={() => setOpenVendor(open ? null : v.key)} className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default">
              <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90", !v.days.length && "opacity-0")} />
              <span className="min-w-0"><span className="block font-semibold">{v.name}</span>
                <span className="block text-xs text-muted-foreground">{v.bills} {v.bills === 1 ? "bill" : "bills"}{v.returns ? ` · ${v.returns} ${v.returns === 1 ? "return" : "returns"}` : ""}{v.lastAt ? ` · last ${dateText(v.lastAt)}` : ""}{supplier ? [supplier.phone, supplier.gstin, supplier.note].filter(Boolean).map((x) => ` · ${x}`).join("") : ""}</span></span>
            </button>
            <span className="text-right text-lg font-bold tabular-nums">{formatINR(v.amount)}</span>
            {admin && supplier ? <Button size="icon" variant="ghost" aria-label={`Edit ${supplier.name}`} onClick={() => setSheet({ kind: "supplier", supplier })}><Pencil/></Button> : null}
          </div>
          {open ? <div className="border-t border-border bg-secondary/30">{v.days.map((d) => {
            const dayKeyId = `${v.key}|${d.day}`;
            const dayOpen = openDay === dayKeyId;
            return <div key={d.day} className="border-b border-border/60 last:border-b-0">
              <button type="button" aria-expanded={dayOpen} onClick={() => setOpenDay(dayOpen ? null : dayKeyId)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm">
                <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", dayOpen && "rotate-90")} />
                <span className="flex-1 font-medium">{dateText(d.at)}<span className="ml-2 text-xs font-normal text-muted-foreground">{d.entries.length} {d.entries.length === 1 ? "entry" : "entries"}</span></span>
                <span className="font-semibold tabular-nums">{formatINR(d.amount)}</span>
              </button>
              {dayOpen ? <ul className="divide-y divide-border bg-card px-4">{d.entries.map(billCard)}</ul> : null}
            </div>;
          })}</div> : null}
        </section>;
      })}
      {!vendors.length && !suppliers.length ? <p className="py-8 text-center text-sm text-muted-foreground">No vendors yet</p> : null}
    </div> : null}
  </div><Dialog open={!!sheet} onOpenChange={(open) => { if (!open) close(); }}><DialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto">
    {sheet?.kind === "item" ? <><DialogTitle>{sheet.material ? "Edit purchase item" : "Add purchase item"}</DialogTitle><MaterialForm key={sheet.material?.id ?? "new"} {...(sheet.material ? { material: sheet.material } : {})} onDone={close}/></> : null}
    {sheet?.kind === "purchase" ? <><DialogTitle>Record purchase</DialogTitle><PurchaseForm materials={active} suppliers={suppliers} onDone={close}/></> : null}
    {sheet?.kind === "return" ? <><DialogTitle>Return purchased items</DialogTitle><ReturnForm purchase={sheet.purchase} entries={entries} materials={materials} onDone={close}/></> : null}
    {sheet?.kind === "supplier" ? <><DialogTitle>{sheet.supplier ? "Edit vendor" : "Add vendor"}</DialogTitle><SupplierForm supplier={sheet.supplier} onDone={close}/></> : null}
  </DialogContent></Dialog></AppShell>;
}
