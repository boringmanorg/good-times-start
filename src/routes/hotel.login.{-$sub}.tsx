import { createFileRoute } from "@tanstack/react-router";
import { SignInScreen } from "@/components/SignInScreen";
import { SILENT_PARAMS } from "@/lib/silent-route";

const description = "Hotel POS by XTSY is coming soon: join the waitlist.";

export const Route = createFileRoute("/hotel/login/{-$sub}")({
  params: SILENT_PARAMS,
  head: () => ({
    meta: [
      { title: "Sign in — Hotel POS by XTSY" },
      { name: "description", content: description },
      { name: "robots", content: "noindex" }, { property: "og:title", content: "Sign in — Hotel POS by XTSY" }, { property: "og:description", content: description }, { property: "og:type", content: "website" },
    ],
  }),
  component: () => <SignInScreen door="hotel_pos" />,
});
