import { createFileRoute } from "@tanstack/react-router";
import { SignInScreen } from "@/components/SignInScreen";

const description = "Hotel POS by XTSY sign-in. Coming soon: join the waitlist.";

/** Hotel POS sign-in: /hotelpos. Its app screens live under /hotel/… (public-urls.ts). */
export const Route = createFileRoute("/hotelpos")({
  head: () => ({
    meta: [
      { title: "Sign in — Hotel POS by XTSY" },
      { name: "description", content: description },
      { name: "robots", content: "noindex" }, { property: "og:title", content: "Sign in — Hotel POS by XTSY" }, { property: "og:description", content: description }, { property: "og:type", content: "website" },
    ],
  }),
  component: () => <SignInScreen door="hotel_pos" />,
});
