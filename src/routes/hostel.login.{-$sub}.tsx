import { createFileRoute, redirect } from "@tanstack/react-router";
import { SILENT_PARAMS } from "@/lib/silent-route";

/** Old Hostel POS sign-in address: now /hostelpos (query kept, e.g. ?app=pos from install links). */
export const Route = createFileRoute("/hostel/login/{-$sub}")({
  params: SILENT_PARAMS,
  beforeLoad: ({ location }) => { throw redirect({ href: `/hostelpos${location.searchStr}`, replace: true }); },
});
