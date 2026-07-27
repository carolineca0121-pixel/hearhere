export { default } from "next-auth/middleware";

export const config = {
  matcher: ["/confirm/:path*", "/explore/:path*", "/foods/:path*", "/trip/:path*"],
};
