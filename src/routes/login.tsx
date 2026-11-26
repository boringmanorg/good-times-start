import { createFileRoute } from "@tanstack/react-router";
import { SignInScreen } from "@/components/SignInScreen";

const description = "Sign in to Restaurant POS by XTSY: POS Manager, POS Billdesk and Waiter Pro.";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Restaurant POS by XTSY" },
      { name: "description", content: description },
      { name: "robots", content: "noindex" }, { property: "og:title", content: "Sign in — Restaurant POS by XTSY" }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <SignInScreen door="restaurant" />,
});
