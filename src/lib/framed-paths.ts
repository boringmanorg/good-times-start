/** Staff screens that share the persistent frame (sidebar, header, orders bell). */
const FRAMED = ["/", "/dashboard", "/marketing", "/tables", "/menu", "/stock", "/customers", "/reports", "/kitchen", "/settings", "/setup"];
export function isFramedPath(pathname: string): boolean {
  return FRAMED.some((p) => (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`)));
}
