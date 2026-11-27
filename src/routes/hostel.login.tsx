import { createFileRoute } from "@tanstack/react-router";
import { SignInScreen } from "@/components/SignInScreen";

const description = "Sign in to Hostel POS by XTSY: Property Manager and Front Desk, with the channel manager and booking engine.";

export const Route = createFileRoute("/hostel/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Hostel POS by XTSY" },
      { name: "description", content: description },
      { name: "robots", content: "noindex" }, { property: "og:title", content: "Sign in — Hostel POS by XTSY" }, { property: "og:description", content: description }, { property: "og:type", content: "website" },
    ],
  }),
  component: () => <SignInScreen door="hostel_pos" />,
});
