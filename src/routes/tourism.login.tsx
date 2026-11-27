import { createFileRoute } from "@tanstack/react-router";
import { SignInScreen } from "@/components/SignInScreen";

const description = "Tourism POS by XTSY is coming soon: join the waitlist.";

export const Route = createFileRoute("/tourism/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Tourism POS by XTSY" },
      { name: "description", content: description },
      { name: "robots", content: "noindex" }, { property: "og:title", content: "Sign in — Tourism POS by XTSY" }, { property: "og:description", content: description }, { property: "og:type", content: "website" },
    ],
  }),
  component: () => <SignInScreen door="tourism_pos" />,
});
