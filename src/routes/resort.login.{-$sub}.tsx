import { createFileRoute, redirect } from "@tanstack/react-router";
import { SILENT_PARAMS } from "@/lib/silent-route";

/** Old Resort POS sign-in address: now /resortpos (query kept, e.g. ?app=pos from install links). */
export const Route = createFileRoute("/resort/login/{-$sub}")({
  params: SILENT_PARAMS,
  beforeLoad: ({ location }) => { throw redirect({ href: `/resortpos${location.searchStr}`, replace: true }); },
});
