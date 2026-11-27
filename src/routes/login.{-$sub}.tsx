import { createFileRoute } from "@tanstack/react-router";
import { SignInScreen } from "@/components/SignInScreen";
import { SILENT_PARAMS } from "@/lib/silent-route";

const description = "Sign in to Restaurant POS by XTSY: POS Manager, POS Billdesk and Waiter Pro.";

export const Route = createFileRoute("/login/{-$sub}")({
  params: SILENT_PARAMS,
  head: () => ({
    meta: [
      { title: "Sign in — Restaurant POS by XTSY" },
      { name: "description", content: description },
      { name: "robots", content: "noindex" }, { property: "og:title", content: "Sign in — Restaurant POS by XTSY" }, { property: "og:description", content: description }, { property: "og:type", content: "website" },
    ],
  }),
  component: () => <SignInScreen door="restaurant_pos" />,
});
