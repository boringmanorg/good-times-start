import { createFileRoute, redirect } from "@tanstack/react-router";
import { SILENT_PARAMS } from "@/lib/silent-route";

/** Old sign-in address: installed apps and bookmarks from before 13 Nov 2026 land on /login. */
export const Route = createFileRoute("/auth/{-$sub}")({
  params: SILENT_PARAMS,
  beforeLoad: ({ location }) => {
    throw redirect({ href: `/login${location.searchStr}`, replace: true });
  },
});
