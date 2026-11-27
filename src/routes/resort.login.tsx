import { createFileRoute } from "@tanstack/react-router";
import { SignInScreen } from "@/components/SignInScreen";

const description = "Resort POS by XTSY is coming soon: join the waitlist.";

export const Route = createFileRoute("/resort/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Resort POS by XTSY" },
      { name: "description", content: description },
      { name: "robots", content: "noindex" }, { property: "og:title", content: "Sign in — Resort POS by XTSY" }, { property: "og:description", content: description }, { property: "og:type", content: "website" },
    ],
  }),
  component: () => <SignInScreen door="resort_pos" />,
});
