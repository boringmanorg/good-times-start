import { createFileRoute, redirect } from "@tanstack/react-router";
import { SILENT_PARAMS } from "@/lib/silent-route";

/** The website's old address: the home page is "/" (listed in the editor as /homepage). */
export const Route = createFileRoute("/xtsy-pos/{-$sub}")({
  params: SILENT_PARAMS,
  beforeLoad: () => { throw redirect({ href: "/", replace: true }); },
});
