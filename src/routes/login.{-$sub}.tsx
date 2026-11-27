import { createFileRoute, redirect } from "@tanstack/react-router";
import { SILENT_PARAMS } from "@/lib/silent-route";

/** /login (installed counter apps, old links): Restaurant POS sign-in is /restaurantpos now. */
export const Route = createFileRoute("/login/{-$sub}")({
  params: SILENT_PARAMS,
  beforeLoad: ({ location }) => { throw redirect({ href: `/restaurantpos${location.searchStr}`, replace: true }); },
});
