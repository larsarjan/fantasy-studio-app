export const publicRoutes = new Set([
  "",
  "videos",
  "community",
  "about",
  "privacy",
  "contact",
]);
export function relativeRoute(pathname, base = "/") {
  return pathname.startsWith(base)
    ? pathname.slice(base.length).replace(/^\/+|\/+$/g, "")
    : "";
}
export function studioScreen(pathname, base = "/") {
  return (
    relativeRoute(pathname, base).replace(/^studio(?:\/|$)/, "") || "dashboard"
  );
}
export function studioPath(screen = "dashboard", base = "/") {
  return `${base}studio${screen === "dashboard" ? "" : `/${screen}`}`;
}
export function loginDestination(pathname, base = "/") {
  const route = relativeRoute(pathname, base);
  return publicRoutes.has(route) || route.startsWith("auth/")
    ? studioPath("dashboard", base)
    : pathname;
}
