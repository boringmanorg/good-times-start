import { createFileRoute } from "@tanstack/react-router";
import { SignInScreen } from "@/components/SignInScreen";

const description = "Sign in to Hostel POS by XTSY: Property Manager and Front Desk.";

/** Hostel POS sign-in: /hostelpos. Its app screens live under /hostel/… (public-urls.ts). */
export const Route = createFileRoute("/hostelpos")({
  head: () => ({
    meta: [
      { title: "Sign in — Hostel POS by XTSY" },
      { name: "description", content: description },
      { name: "robots", content: "noindex" }, { property: "og:title", content: "Sign in — Hostel POS by XTSY" }, { property: "og:description", content: description }, { property: "og:type", content: "website" },
    ],
  }),
  component: () => <SignInScreen door="hostel_pos" />,
});
