import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old sign-in address: installed apps and bookmarks from before 13 Nov 2026 land on /login. */
export const Route = createFileRoute("/auth")({
  beforeLoad: ({ location }) => {
    throw redirect({ href: `/login${location.searchStr}`, replace: true });
  },
});
