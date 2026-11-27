import { createFileRoute } from "@tanstack/react-router";
import { SignInScreen } from "@/components/SignInScreen";

const description = "Resort POS by XTSY sign-in. Coming soon: join the waitlist.";

/** Resort POS sign-in: /resortpos. Its app screens live under /resort/… (public-urls.ts). */
export const Route = createFileRoute("/resortpos")({
  head: () => ({
    meta: [
      { title: "Sign in — Resort POS by XTSY" },
      { name: "description", content: description },
      { name: "robots", content: "noindex" }, { property: "og:title", content: "Sign in — Resort POS by XTSY" }, { property: "og:description", content: description }, { property: "og:type", content: "website" },
    ],
  }),
  component: () => <SignInScreen door="resort_pos" />,
});
