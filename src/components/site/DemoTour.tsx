import { useEffect, useState, type ReactNode } from "react";
import {
  BellRing, CalendarCheck, Check, ChefHat, ChevronLeft, ChevronRight, FileSpreadsheet, IndianRupee, KeyRound, MessageCircle,
  Pause, Play, Printer, QrCode, Receipt, ShieldCheck, ShoppingBasket, Smartphone, Users, WifiOff, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * The website's Demo: an animated walk-through of XTSY POS drawn in HTML/CSS (no real data,
 * no sign-in, nothing loaded from the cloud). Scenes play on their own, can be paused or stepped,
 * and stay still for people who prefer reduced motion.
 */

const SCENE_MS = 7000;

interface Scene { key: string; app: string; title: string; text: string; device: "desktop" | "phone" | "tablet"; features: string[]; body: () => ReactNode }

const Tile = ({ label, state, delay = 0 }: { label: string; state: "free" | "busy" | "bill"; delay?: number }) => (
  <div className={cn("demo-pop rounded-lg border p-2 text-left", state === "busy" ? "border-primary bg-primary/15" : state === "bill" ? "border-gold bg-gold/15" : "border-border bg-secondary")} style={{ animationDelay: `${delay}ms` }}>
    <p className="text-sm font-bold">{label}</p>
    <p className="text-[10px] text-muted-foreground">{state === "busy" ? "₹1,240 · 45 min" : state === "bill" ? "Bill ready" : "Free"}</p>
  </div>
);

const Line = ({ qty, name, price, delay }: { qty: number; name: string; price: string; delay: number }) => (
  <div className="demo-slide flex items-center justify-between rounded-md bg-secondary px-2 py-1.5 text-xs" style={{ animationDelay: `${delay}ms` }}>
    <span><span className="font-bold text-primary">{qty} x</span> {name}</span><span className="tabular-nums">{price}</span>
  </div>
);

const Toast = ({ children, delay }: { children: ReactNode; delay: number }) => (
  <div className="demo-toast absolute bottom-2 left-1/2 flex w-max max-w-[92%] -translate-x-1/2 items-center justify-center gap-1.5 rounded-full bg-success px-3 py-1.5 text-center text-[11px] font-bold leading-tight text-black shadow-lg" style={{ animationDelay: `${delay}ms` }}>{children}</div>
);

const Row = ({ children, delay, tone }: { children: ReactNode; delay: number; tone?: "ok" | "warn" }) => (
  <div className={cn("demo-slide flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-[11px]",
    tone === "ok" ? "bg-success/15 text-success" : tone === "warn" ? "bg-gold/15 text-warning" : "bg-secondary")} style={{ animationDelay: `${delay}ms` }}>{children}</div>
);

const Stat = ({ label, value, delay }: { label: string; value: string; delay: number }) => (
  <div className="demo-pop rounded-lg bg-secondary p-2" style={{ animationDelay: `${delay}ms` }}>
    <p className="text-[10px] text-muted-foreground">{label}</p><p className="text-sm font-extrabold tabular-nums">{value}</p>
  </div>
);

const SCENES: Scene[] = [
  {
    key: "billdesk", app: "POS Billdesk", device: "desktop", title: "Bill a table in seconds",
    text: "Tap a table, add dishes by name or code, send the KOT. Each kitchen station gets its own ticket.",
    features: ["Floor map with live table status", "Search dishes by name or short code", "One KOT per kitchen station", "Prints on 58 mm and 80 mm", "Room and hut tables"],
    body: () => (
      <div className="grid h-full grid-cols-[1fr_1.1fr] gap-3 p-3">
        <div className="grid content-start grid-cols-3 gap-2">
          {(["D1", "D2", "D3", "Hut 1", "Room 7A", "Family"] as const).map((t, i) => <Tile key={t} label={t} state={i === 0 ? "busy" : i === 1 ? "bill" : "free"} delay={i * 90} />)}
        </div>
        <div className="relative rounded-xl border border-border bg-card p-2.5 pb-11">
          <p className="text-xs font-bold">Dine-in · D1 <span className="font-normal text-muted-foreground">· 4 guests</span></p>
          <div className="mt-2 space-y-1.5">
            <Line qty={2} name="Butter Naan" price="₹120" delay={700} />
            <Line qty={1} name="Paneer Tikka" price="₹280" delay={1300} />
            <Line qty={4} name="Masala Chai" price="₹120" delay={1900} />
          </div>
          <div className="demo-fade mt-3 flex items-center justify-between border-t border-border pt-2 text-sm font-extrabold" style={{ animationDelay: "2500ms" }}><span>Total</span><span className="tabular-nums">₹520</span></div>
          <div className="demo-press mt-2 rounded-lg bg-primary py-1.5 text-center text-xs font-bold text-primary-foreground" style={{ animationDelay: "3300ms" }}><ChefHat className="mr-1 inline size-3.5" />Send KOT</div>
          <Toast delay={4000}><Printer className="size-3.5" />KOT/0073 printed · Kitchen</Toast>
        </div>
      </div>
    ),
  },
  {
    key: "waiter", app: "Waiter Pro", device: "phone", title: "Orders from the table",
    text: "Waiters take the order at the table on a phone or tablet. The KOT prints at the counter, no walking back.",
    features: ["Tableside ordering", "Send KOTs from the floor", "See which tables wait for a bill", "Works on any Android phone or tablet"],
    body: () => (
      <div className="relative h-full space-y-2 p-3">
        <p className="text-xs font-bold">Table D3 · 2 guests</p>
        {["Masala Dosa", "Filter Coffee", "Chicken 65"].map((d, i) => (
          <div key={d} className="demo-slide flex items-center justify-between rounded-lg bg-secondary px-2.5 py-2 text-xs" style={{ animationDelay: `${400 + i * 600}ms` }}>
            <span>{d}</span><span className="rounded-full bg-primary px-2 font-bold text-primary-foreground">+1</span>
          </div>
        ))}
        <div className="demo-press rounded-lg bg-primary py-2 text-center text-xs font-bold text-primary-foreground" style={{ animationDelay: "2600ms" }}>Send to kitchen</div>
        <Toast delay={3300}><Check className="size-3.5" />Sent · printing at the counter</Toast>
      </div>
    ),
  },
  {
    key: "qr", app: "Guest QR ordering", device: "phone", title: "Guests order from your QR, at 0% commission",
    text: "Dine-in, takeaway and delivery from one QR. No aggregator, no commission, and the guest's number is yours.",
    features: ["One QR for dine-in, takeaway and delivery", "No app for the guest", "Google Maps pin for delivery", "Counter chimes and accepts", "In-room QR for hotel guests", "0% commission on every order"],
    body: () => (
      <div className="relative h-full p-3">
        <p className="flex items-center gap-1.5 text-xs font-bold"><QrCode className="size-3.5 text-primary" />TAB Bistro · Menu</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {["Peri Peri Fries", "Egg Dosa", "Curd Rice", "Cold Coffee"].map((d, i) => (
            <div key={d} className={cn("demo-pop rounded-lg border p-2 text-[11px]", i % 2 === 0 ? "border-primary bg-primary/10" : "border-border bg-secondary")} style={{ animationDelay: `${300 + i * 250}ms` }}>
              <p className="font-semibold">{d}</p><p className="text-muted-foreground">₹{[160, 90, 110, 140][i]}</p>
            </div>
          ))}
        </div>
        <div className="demo-press mt-3 rounded-full bg-primary py-2 text-center text-xs font-bold text-primary-foreground" style={{ animationDelay: "2000ms" }}>Place order · ₹270</div>
        <div className="demo-rise absolute inset-x-3 bottom-3 rounded-xl border border-gold bg-card p-2 text-[11px]" style={{ animationDelay: "3000ms" }}>
          <p className="flex items-center gap-1 font-bold text-warning"><BellRing className="size-3.5" />Counter: new QR order · QR/0042</p>
          <p className="text-muted-foreground">Table D4 · 2 dishes · Accept</p>
        </div>
      </div>
    ),
  },
  {
    key: "settle", app: "POS Billdesk", device: "desktop", title: "Settle the bill, GST and all",
    text: "Cash, UPI, card or split across them. GST is worked out per dish, and the printed bill carries your GSTIN.",
    features: ["GST split per dish (CGST / SGST)", "Cash, UPI, card and split payments", "UPI QR printed on the bill", "Discounts behind an admin code", "No-charge (NC) bills", "Round-off and bill numbering"],
    body: () => (
      <div className="relative grid h-full grid-cols-[1.2fr_1fr] gap-3 p-3">
        <div className="rounded-xl border border-border bg-card p-2.5">
          <p className="text-xs font-bold">POS/0142 · Dine-in D1</p>
          <div className="mt-2 space-y-1">
            <Row delay={300}><span>Subtotal</span><span className="tabular-nums">₹520.00</span></Row>
            <Row delay={700}><span>Discount 10% <KeyRound className="ml-0.5 inline size-3 text-primary" /></span><span className="tabular-nums">− ₹52.00</span></Row>
            <Row delay={1100}><span>CGST 2.5% + SGST 2.5%</span><span className="tabular-nums">₹23.40</span></Row>
            <Row delay={1500}><span>Round off</span><span className="tabular-nums">₹0.60</span></Row>
          </div>
          <div className="demo-fade mt-2 flex justify-between border-t border-border pt-2 text-sm font-extrabold" style={{ animationDelay: "1900ms" }}><span>To pay</span><span className="tabular-nums">₹492</span></div>
        </div>
        <div className="space-y-2">
          {([["Cash", "₹200"], ["UPI", "₹292"]] as const).map(([m, a], i) => (
            <Row key={m} delay={2300 + i * 500} tone="ok"><span className="font-semibold">{m}</span><span className="tabular-nums">{a}</span></Row>
          ))}
          <div className="demo-press rounded-lg bg-primary py-1.5 text-center text-xs font-bold text-primary-foreground" style={{ animationDelay: "3400ms" }}><IndianRupee className="mr-1 inline size-3.5" />Settle and print</div>
          <Toast delay={4200}><Receipt className="size-3.5" />Bill printed · GSTIN on it</Toast>
        </div>
      </div>
    ),
  },
  {
    key: "manager", app: "POS Manager", device: "phone", title: "Run it from your phone",
    text: "Live sales, purchases to approve, new terminals to allow: the owner sees everything, anywhere.",
    features: ["Live sales dashboard", "Running bills and table status", "Payment-mode split", "Alerts for anything waiting on you", "Approve a new terminal from anywhere"],
    body: () => (
      <div className="relative h-full space-y-2 p-3">
        <div className="grid grid-cols-2 gap-2">
          {([["Sales today", "₹18,420"], ["Bills", "64"], ["Cash · UPI", "38% · 52%"], ["Running", "5 tables"]] as const).map(([l, v], i) => <Stat key={l} label={l} value={v} delay={i * 150} />)}
        </div>
        <div className="flex h-16 items-end gap-1 rounded-lg bg-secondary p-2" aria-hidden="true">
          {[40, 65, 50, 80, 95, 70, 88].map((h, i) => <div key={i} className="demo-grow flex-1 rounded-t bg-primary" style={{ height: `${h}%`, animationDelay: `${800 + i * 110}ms` }} />)}
        </div>
        <div className="demo-rise rounded-xl border border-gold/60 bg-gold/10 p-2 text-[11px]" style={{ animationDelay: "2600ms" }}>
          <p className="flex items-center gap-1 font-bold text-warning"><ShieldCheck className="size-3.5" />New POS Billdesk wants to join</p>
          <div className="mt-1.5 flex gap-1.5"><span className="demo-press rounded-md bg-primary px-2 py-0.5 font-bold text-primary-foreground" style={{ animationDelay: "3600ms" }}>Approve · Counter 2</span><span className="rounded-md border border-border px-2 py-0.5">Turn away</span></div>
        </div>
      </div>
    ),
  },
  {
    key: "purchase", app: "POS Manager", device: "tablet", title: "Control what you spend",
    text: "The bill desk records the supplier bill; you check it and approve. Nothing counts until you say so.",
    features: ["Supplier bills with invoice number", "Owner approval before it counts", "Vendor-wise spend, day by day", "Price history per item", "Supplier returns", "Chime both ways when something needs you"],
    body: () => (
      <div className="relative h-full p-3">
        <p className="flex items-center gap-1.5 text-xs font-bold"><ShoppingBasket className="size-3.5 text-primary" />Waiting for your approval</p>
        <div className="mt-2 space-y-1.5">
          <Row delay={300} tone="warn"><span>Sri Devi Traders · INV-2291</span><span className="tabular-nums font-bold">₹4,180</span></Row>
          <Row delay={800}><span>Tomato 20 kg</span><span className="tabular-nums">₹640</span></Row>
          <Row delay={1100}><span>Paneer 6 kg</span><span className="tabular-nums">₹2,100</span></Row>
          <Row delay={1400}><span>Refined oil 15 L</span><span className="tabular-nums">₹1,440</span></Row>
        </div>
        <div className="demo-fade mt-2 flex items-center gap-1.5 text-[11px]" style={{ animationDelay: "1900ms" }}><span className="grid size-4 place-items-center rounded border border-primary bg-primary text-primary-foreground"><Check className="size-3" /></span>Supplier bill checked</div>
        <div className="demo-press mt-2 w-max rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground" style={{ animationDelay: "2600ms" }}>Approve purchase</div>
        <Toast delay={3400}><Check className="size-3.5" />Approved · counts in vendor spend now</Toast>
      </div>
    ),
  },
  {
    key: "guests", app: "POS Manager", device: "tablet", title: "Your guest list, not the aggregator's",
    text: "Every bill builds it. Points bring guests back, and a WhatsApp offer reaches the ones who went quiet.",
    features: ["Guest list built from your bills", "Points earned and spent on bills", "Visits and favourite dishes", "WhatsApp campaigns by how often they come", "Win back guests who stopped coming", "Your data leaves with you"],
    body: () => (
      <div className="relative h-full p-3">
        <div className="grid grid-cols-3 gap-2">
          {([["Guests", "1,284"], ["Repeat", "41%"], ["Points live", "18,900"]] as const).map(([l, v], i) => <Stat key={l} label={l} value={v} delay={i * 150} />)}
        </div>
        <div className="mt-2 space-y-1.5">
          <Row delay={700}><span className="flex items-center gap-1.5"><Users className="size-3.5 text-primary" />Priya · 9 visits</span><span className="tabular-nums">320 pts</span></Row>
          <Row delay={1100}><span className="flex items-center gap-1.5"><Users className="size-3.5 text-primary" />Arun · 4 visits</span><span className="tabular-nums">90 pts</span></Row>
          <Row delay={1500} tone="warn"><span className="flex items-center gap-1.5"><CalendarCheck className="size-3.5" />42 guests quiet for a month</span><span>Pick</span></Row>
        </div>
        <div className="demo-press mt-2 w-max rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground" style={{ animationDelay: "2400ms" }}><MessageCircle className="mr-1 inline size-3.5" />Send the offer</div>
        <Toast delay={3200}><Check className="size-3.5" />Sent on WhatsApp · 42 guests</Toast>
      </div>
    ),
  },
  {
    key: "reports", app: "POS Manager", device: "desktop", title: "Know your numbers by 9 AM",
    text: "Day, week and month, by payment mode, by dish and by who billed it. Export for your accountant.",
    features: ["Day, week and month sales", "Item-wise and category sales", "Payment-mode split", "Staff-wise billing", "Cancelled and NC bills tracked", "Excel export for your CA"],
    body: () => (
      <div className="relative h-full p-3">
        <div className="grid grid-cols-4 gap-2">
          {([["Sales", "₹4.9L"], ["Bills", "1,612"], ["Average", "₹304"], ["NC", "₹2,100"]] as const).map(([l, v], i) => <Stat key={l} label={l} value={v} delay={i * 130} />)}
        </div>
        <div className="mt-3 grid grid-cols-[1.3fr_1fr] gap-3">
          <div className="flex h-24 items-end gap-1 rounded-lg bg-secondary p-2" aria-hidden="true">
            {[55, 70, 45, 85, 60, 95, 78, 66, 90, 72].map((h, i) => <div key={i} className="demo-grow flex-1 rounded-t bg-primary" style={{ height: `${h}%`, animationDelay: `${700 + i * 90}ms` }} />)}
          </div>
          <div className="space-y-1">
            {([["Masala Dosa", "182"], ["Peri Peri Fries", "141"], ["Cold Coffee", "128"]] as const).map(([d, n], i) => <Row key={d} delay={1500 + i * 300}><span>{d}</span><span className="tabular-nums">{n}</span></Row>)}
          </div>
        </div>
        <Toast delay={3200}><FileSpreadsheet className="size-3.5" />Excel ready · GST summary inside</Toast>
      </div>
    ),
  },
  {
    key: "security", app: "Every app", device: "desktop", title: "Nobody bills on a device you didn't allow",
    text: "A new device waits for your name and your code. Every change is written down, on every terminal.",
    features: ["Every new terminal named and approved", "60-second admin code, no internet needed", "Block or release any device", "Audit log of who changed what", "Roles for owner, manager, billdesk and waiter", "Discounts and voids behind approval"],
    body: () => (
      <div className="relative grid h-full grid-cols-[1fr_1.1fr] gap-3 p-3">
        <div className="rounded-xl border border-gold/50 bg-gold/10 p-3 text-center">
          <ShieldCheck className="demo-pop mx-auto size-7 text-warning" />
          <p className="mt-1 text-[11px] font-bold">New terminal</p>
          <p className="demo-fade mt-2 rounded-md bg-card px-2 py-1 font-mono text-lg tracking-[0.3em]" style={{ animationDelay: "900ms" }}>418 302</p>
          <p className="text-[10px] text-muted-foreground">changes every 60 s</p>
          <div className="demo-press mt-2 rounded-md bg-primary py-1 text-[11px] font-bold text-primary-foreground" style={{ animationDelay: "1800ms" }}>Approve · Counter 2</div>
        </div>
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold">Audit log</p>
          <Row delay={2200}><span>Discount 10% · POS/0142</span><span className="text-muted-foreground">Admin</span></Row>
          <Row delay={2600}><span>Price changed · Egg Dosa</span><span className="text-muted-foreground">Manager</span></Row>
          <Row delay={3000}><span>Bill cancelled · POS/0139</span><span className="text-muted-foreground">Counter 1</span></Row>
          <Row delay={3400} tone="ok"><span>Terminal approved · Counter 2</span><span>just now</span></Row>
        </div>
      </div>
    ),
  },
  {
    key: "offline", app: "Every app", device: "tablet", title: "Keeps billing when the internet doesn't",
    text: "Bills are saved on the device first. When the connection is back, every terminal syncs on its own.",
    features: ["Billing never stops offline", "Bill numbers stay in order", "Syncs itself when back online", "Every terminal ends up with the same books"],
    body: () => (
      <div className="relative grid h-full place-items-center p-4 text-center">
        <div>
          <WifiOff className="demo-pulse mx-auto size-9 text-warning" />
          <p className="mt-2 text-sm font-bold">Internet down</p>
          <div className="mt-3 space-y-1.5">
            {["POS/0141 settled · Cash", "POS/0142 settled · UPI", "KOT/0075 printed"].map((t, i) => (
              <p key={t} className="demo-slide rounded-md bg-secondary px-3 py-1 text-xs" style={{ animationDelay: `${600 + i * 600}ms` }}>{t}</p>
            ))}
          </div>
          <p className="demo-fade mt-3 flex items-center justify-center gap-1.5 text-xs font-bold text-success" style={{ animationDelay: "3200ms" }}><Check className="size-3.5" />Back online · all terminals synced</p>
        </div>
      </div>
    ),
  },
];

/** Every feature the tour names, so the count on screen is the real one. */
export const DEMO_FEATURE_COUNT = SCENES.reduce((n, s) => n + s.features.length, 0);

function Frame({ device, children }: { device: Scene["device"]; children: ReactNode }) {
  if (device === "desktop") {
    return (
      <div className="mx-auto w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        <div className="flex items-center gap-1.5 border-b border-border bg-card px-3 py-2"><span className="size-2.5 rounded-full bg-destructive/70" /><span className="size-2.5 rounded-full bg-gold/70" /><span className="size-2.5 rounded-full bg-success/70" /></div>
        <div className="h-64">{children}</div>
      </div>
    );
  }
  return (
    <div className={cn("mx-auto overflow-hidden border-[6px] border-[#2b2b30] bg-background shadow-2xl", device === "phone" ? "h-[22rem] w-52 rounded-[2rem]" : "h-64 w-[26rem] max-w-full rounded-[1.5rem]")}>
      <div className="h-full">{children}</div>
    </div>
  );
}

export function DemoTour({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [run, setRun] = useState(0); // restarts a scene's animation
  const scene = SCENES[i]!;
  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) setPlaying(false);
  }, []);
  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => { setI((n) => (n + 1) % SCENES.length); setRun((r) => r + 1); }, SCENE_MS);
    return () => window.clearTimeout(t);
  }, [playing, i, run]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const go = (d: number) => { setI((n) => (n + d + SCENES.length) % SCENES.length); setRun((r) => r + 1); };

  return (
    <div role="dialog" aria-modal="true" aria-label="XTSY POS demo" className="fixed inset-0 z-50 overflow-y-auto bg-black/85 p-3 backdrop-blur-sm sm:p-6">
      <style>{`
        @keyframes demo-pop { from { opacity: 0; transform: scale(.92) } to { opacity: 1; transform: none } }
        @keyframes demo-slide { from { opacity: 0; transform: translateX(-12px) } to { opacity: 1; transform: none } }
        @keyframes demo-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes demo-toast { from { opacity: 0; transform: translate(-50%, 10px) } to { opacity: 1; transform: translate(-50%, 0) } }
        @keyframes demo-press { 0%, 100% { transform: none } 50% { transform: scale(.94); filter: brightness(1.2) } }
        @keyframes demo-grow { from { transform: scaleY(0) } to { transform: scaleY(1) } }
        @keyframes demo-pulse { 0%, 100% { opacity: 1 } 50% { opacity: .4 } }
        .demo-pop { opacity: 0; animation: demo-pop .45s ease-out forwards }
        .demo-slide { opacity: 0; animation: demo-slide .45s ease-out forwards }
        .demo-fade { opacity: 0; animation: demo-fade .5s ease-out forwards }
        .demo-toast { opacity: 0; animation: demo-toast .45s ease-out forwards }
        @keyframes demo-rise { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
        .demo-rise { opacity: 0; animation: demo-rise .45s ease-out forwards }
        .demo-press { animation: demo-press .5s ease-in-out 2 }
        .demo-grow { transform-origin: bottom; transform: scaleY(0); animation: demo-grow .6s ease-out forwards }
        .demo-pulse { animation: demo-pulse 1.4s ease-in-out infinite }
        @media (prefers-reduced-motion: reduce) { .demo-pop, .demo-slide, .demo-fade, .demo-rise, .demo-grow { animation: none; opacity: 1; transform: none } .demo-toast { animation: none; opacity: 1 } .demo-press, .demo-pulse { animation: none } }
      `}</style>
      <div className="mx-auto flex min-h-full max-w-4xl flex-col justify-center">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-brand text-2xl leading-none">XTSY POS · Demo</p>
            <p className="mt-1 text-xs text-muted-foreground">{DEMO_FEATURE_COUNT} features across {SCENES.length} screens · step {i + 1} of {SCENES.length}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close demo" className="rounded-full border border-border p-2 hover:bg-secondary"><X className="size-5" /></button>
        </div>
        <div className="mt-4 grid items-center gap-6 rounded-3xl border border-border bg-card/60 p-5 md:grid-cols-[1fr_1.3fr] md:p-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{scene.app}</p>
            <h2 className="mt-2 font-brand text-4xl leading-none">{scene.title}</h2>
            <p className="mt-3 text-muted-foreground">{scene.text}</p>
            <ul className="mt-4 flex flex-wrap gap-1.5" aria-label={`What ${scene.title} shows`}>
              {scene.features.map((f) => (
                <li key={f} className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium"><Check className="size-3 shrink-0 text-primary" />{f}</li>
              ))}
            </ul>
            <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground"><Smartphone className="size-3.5" />{scene.device === "desktop" ? "Windows or Mac computer" : scene.device === "tablet" ? "Phone, tablet or computer" : "Android or iPhone"}</p>
          </div>
          <div key={`${scene.key}-${run}`} aria-hidden="true">
            <Frame device={scene.device}>{scene.body()}</Frame>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1.5" role="tablist" aria-label="Demo scenes">
            {SCENES.map((s, n) => (
              <button key={s.key} type="button" role="tab" aria-selected={n === i} aria-label={s.title} onClick={() => { setI(n); setRun((r) => r + 1); }}
                className={cn("h-2 rounded-full transition-all", n === i ? "w-8 bg-primary" : "w-2 bg-muted-foreground/40 hover:bg-muted-foreground")} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => go(-1)} aria-label="Previous" className="rounded-full border border-border p-2 hover:bg-secondary"><ChevronLeft className="size-4" /></button>
            <button type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"} className="rounded-full border border-border p-2 hover:bg-secondary">{playing ? <Pause className="size-4" /> : <Play className="size-4" />}</button>
            <button type="button" onClick={() => go(1)} aria-label="Next" className="rounded-full border border-border p-2 hover:bg-secondary"><ChevronRight className="size-4" /></button>
            <a href="#enquire" onClick={onClose} className="ml-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary-hover">Get started</a>
          </div>
        </div>
      </div>
    </div>
  );
}
