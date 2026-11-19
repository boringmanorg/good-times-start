/**
 * Translucent colours for browsers without color-mix() — Chrome 109 and older,
 * which is the newest Chrome Windows 7 can run (our counter PCs).
 *
 * Tailwind 4 writes `bg-gold/15` as a fallback of the FULL colour, then the real
 * 15% tint inside `@supports (color: color-mix(...))`. Old Chrome only sees the
 * fallback, so every soft tint became a solid block (gold text on solid gold,
 * solid red badges, heavy borders). This rewrites each paired fallback to
 * `rgb(var(--x-rgb) / 15%)`, and adds an `--x-rgb` channel triple next to every
 * hex colour token, per theme. New browsers still use the color-mix() rule.
 *
 * Build-time only: used by the Vite plugin in vite.config.ts on the emitted CSS.
 */

const SUPPORTS = "@supports (color:color-mix(in lab, red, red))";

/** "#e9b949" / "#fff" → "233 185 73"; null for anything else. */
export function hexToChannels(hex: string): string | null {
  const h = hex.trim().replace(/^#/, "");
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(h)) return null;
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)).join(" ");
}

/** Add `--name-rgb:R G B` after every `--name:#hex` custom property. */
export function addChannelTokens(css: string): string {
  return css.replace(/(--([a-z0-9-]+)):\s*(#[0-9a-fA-F]{3,6})(?=[;}])/g, (whole, _prop: string, name: string, hex: string) => {
    if (name.endsWith("-rgb")) return whole;
    const rgb = hexToChannels(hex);
    return rgb ? `${whole};--${name}-rgb:${rgb}` : whole;
  });
}

const PAIRED = /(?<sel>[^{}@]+)\{(?<prop>[a-z-]+):(?<fb>[^;{}]+)\}@supports \(color:color-mix\(in lab, red, red\)\)\{(?<sel2>[^{}]+)\{(?<prop2>[a-z-]+):color-mix\(in (?:oklab|srgb), var\(--(?<name>[a-z0-9-]+)\) (?<pct>[\d.]+)%, transparent\)\}\}/g;

/** Rewrite each full-colour fallback that has a matching color-mix rule into an rgb() with alpha. */
export function translucentFallbacks(css: string): string {
  // Tailwind's own colours are `--color-black`; ours are `--gold` behind a `--color-gold` alias.
  const defined = new Set([...css.matchAll(/--([a-z0-9-]+)-rgb:/g)].map((m) => m[1]));
  return css.replace(PAIRED, (whole, ...args) => {
    const g = args[args.length - 1] as { sel: string; prop: string; fb: string; sel2: string; prop2: string; name: string; pct: string };
    if (g.prop !== g.prop2) return whole;
    // Tailwind sometimes shares one fallback between `.bg-x` and `.bg-x\/40`: split the tinted one out.
    const list = g.sel.split(",");
    const shared = g.sel !== g.sel2 && list.includes(g.sel2);
    if (g.sel !== g.sel2 && !shared) return whole;
    const stripped = g.name.replace(/^color-/, "");
    const name = defined.has(g.name) ? g.name : defined.has(stripped) || !defined.size ? stripped : null;
    if (!name) return whole;
    const tint = `${g.sel2}{${g.prop}:rgb(var(--${name}-rgb) / ${g.pct}%)}`;
    const head = shared ? `${list.filter((x) => x !== g.sel2).join(",")}{${g.prop}:${g.fb}}${tint}` : tint;
    return `${head}${SUPPORTS}{${g.sel2}{${g.prop2}:color-mix(in oklab, var(--${g.name}) ${g.pct}%, transparent)}}`;
  });
}

/** The whole transform applied to a built stylesheet. */
export function legacyColorFallback(css: string): string {
  if (!css.includes("color-mix(")) return css;
  return translucentFallbacks(addChannelTokens(css));
}
