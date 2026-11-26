/**
 * PMS by XTSY ↔ ZimmerStack (channel manager), server only.
 *
 * The PMS is the one system that sends room counts and prices to ZimmerStack for each property
 * it runs (owner's decision, 26 Nov 2026; the xtsy.one booking engine moves to reading from the
 * PMS). Rules from @zimmerstack/connect's AGENTS.md: the key lives only in the server environment
 * (`ZIMMERSTACK_CONNECT_KEY`) and is never logged, returned or put in an error; writes happen only
 * on a person's action and only for what changed; no timers, no retry loops of our own; errors show
 * `err.message` and branch on `err.code`.
 *
 * This first piece only READS: is the key there and well formed, test or live, and which hotels it
 * reaches. Nothing here writes to ZimmerStack yet.
 */
import { checkKey, ZimmerStack, ZimmerStackError } from "@zimmerstack/connect";

export interface ChannelStatus {
  /** Key present and well formed. */
  keyOk: boolean;
  /** For a person: what's wrong with the key, never the key itself. */
  keyMessage: string;
  mode: "live" | "test" | null;
  keyKind?: "company" | "property";
  hotels?: { id: number; name: string; channelManager: boolean; sandbox: boolean }[];
  /** The API's answer when the read failed (message only), e.g. a revoked key. */
  error?: { code: string; message: string };
}

export async function channelStatus(): Promise<ChannelStatus> {
  const check = checkKey(process.env["ZIMMERSTACK_CONNECT_KEY"]);
  if (!check.ok) {
    return {
      keyOk: false, mode: check.mode,
      keyMessage: check.problem === "empty"
        ? "No ZimmerStack key on the server. Add it as the secret ZIMMERSTACK_CONNECT_KEY in Lovable (Cloud → Secrets)."
        : check.message,
    };
  }
  try {
    const zs = new ZimmerStack({ maxRetries: 1 });
    const list = await zs.properties.list();
    return {
      keyOk: true, mode: check.mode, keyMessage: check.message, keyKind: list.keyKind,
      hotels: list.properties.map((p) => ({ id: p.id, name: p.name, channelManager: p.channelManager, sandbox: p.sandbox })),
    };
  } catch (e) {
    const code = e instanceof ZimmerStackError ? String(e.code) : "UNKNOWN";
    const message = e instanceof Error ? e.message : "ZimmerStack didn't answer.";
    return { keyOk: true, mode: check.mode, keyMessage: check.message, error: { code, message } };
  }
}
