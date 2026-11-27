import { createFileRoute, redirect } from "@tanstack/react-router";
import { SILENT_PARAMS } from "@/lib/silent-route";

/** Old Tourism POS sign-in address: now /tourismpos (query kept, e.g. ?app=pos from install links). */
export const Route = createFileRoute("/tourism/login/{-$sub}")({
  params: SILENT_PARAMS,
  beforeLoad: ({ location }) => { throw redirect({ href: `/tourismpos${location.searchStr}`, replace: true }); },
});
