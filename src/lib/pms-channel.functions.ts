import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/* Super admin: the channel manager (ZimmerStack) as the PMS sees it. Server code loads inside
   the handler, so the key and the service role never reach the browser. Read-only for now. */

const token = z.string().min(20).max(4096);

export const platformChannelStatus = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ token }).parse(input))
  .handler(async ({ data }) => {
    const { superAdminFromToken } = await import("./platform/logins.server");
    const { channelStatus } = await import("./pms/channel/zimmerstack.server");
    await superAdminFromToken(data.token);
    return channelStatus();
  });
