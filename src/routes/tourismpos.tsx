import { createFileRoute } from "@tanstack/react-router";
import { SignInScreen } from "@/components/SignInScreen";

const description = "Tourism POS by XTSY sign-in. Coming soon: join the waitlist.";

/** Tourism POS sign-in: /tourismpos. Its app screens live under /tourism/… (public-urls.ts). */
export const Route = createFileRoute("/tourismpos")({
  head: () => ({
    meta: [
      { title: "Sign in — Tourism POS by XTSY" },
      { name: "description", content: description },
      { name: "robots", content: "noindex" }, { property: "og:title", content: "Sign in — Tourism POS by XTSY" }, { property: "og:description", content: description }, { property: "og:type", content: "website" },
    ],
  }),
  component: () => <SignInScreen door="tourism_pos" />,
});
