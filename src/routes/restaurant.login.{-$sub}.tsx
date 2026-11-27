import { createFileRoute, redirect } from "@tanstack/react-router";
import { SILENT_PARAMS } from "@/lib/silent-route";

/** Old Restaurant POS sign-in address: now /restaurantpos (query kept, e.g. ?app=pos from install links). */
export const Route = createFileRoute("/restaurant/login/{-$sub}")({
  params: SILENT_PARAMS,
  beforeLoad: ({ location }) => { throw redirect({ href: `/restaurantpos${location.searchStr}`, replace: true }); },
});
