import { createFileRoute, redirect } from "@tanstack/react-router";
import { SILENT_PARAMS } from "@/lib/silent-route";

/** Old Hotel POS sign-in address: now /hotelpos (query kept, e.g. ?app=pos from install links). */
export const Route = createFileRoute("/hotel/login/{-$sub}")({
  params: SILENT_PARAMS,
  beforeLoad: ({ location }) => { throw redirect({ href: `/hotelpos${location.searchStr}`, replace: true }); },
});
