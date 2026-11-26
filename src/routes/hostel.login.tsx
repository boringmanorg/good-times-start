import { createFileRoute } from "@tanstack/react-router";
import { SignInScreen } from "@/components/SignInScreen";

const description = "Sign in to Hostel & Hotel POS by XTSY: the property manager, front desk and channel manager.";

export const Route = createFileRoute("/hostel/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Hostel & Hotel POS by XTSY" },
      { name: "description", content: description },
      { name: "robots", content: "noindex" }, { property: "og:title", content: "Sign in — Hostel & Hotel POS by XTSY" }, { property: "og:description", content: description }, { property: "og:type", content: "website" },
    ],
  }),
  component: () => <SignInScreen door="stay" />,
});
