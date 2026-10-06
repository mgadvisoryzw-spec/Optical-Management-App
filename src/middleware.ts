import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-change-me");

export async function middleware(req: NextRequest) {
  const token = req.cookies.get("ov_session")?.value;
  let valid = false;
  let superAdmin = false;
  let hasOrg = false;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret());
      valid = true;
      superAdmin = payload.sa === true;
      hasOrg = !!payload.oid;
    } catch {
      valid = false;
    }
  }
  const { pathname } = req.nextUrl;
  const redirectTo = (path: string, keepNext = false) => {
    const url = req.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    if (keepNext) url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  };

  // MG Advisory platform console — its own front door.
  if (pathname.startsWith("/platform") && pathname !== "/platform/login") {
    if (!valid) return redirectTo("/platform/login");
    if (!superAdmin) return redirectTo("/app");
    return NextResponse.next();
  }
  if (pathname === "/platform/login" && valid && superAdmin) return redirectTo("/platform");

  // Practice app.
  if (!valid && (pathname.startsWith("/app") || pathname.startsWith("/admin"))) return redirectTo("/login", true);
  // The platform owner has no practice of their own — send them to the console.
  if (valid && superAdmin && !hasOrg && (pathname.startsWith("/app") || pathname.startsWith("/admin"))) return redirectTo("/platform");
  if (valid && (pathname === "/login" || pathname === "/signup")) return redirectTo(superAdmin && !hasOrg ? "/platform" : "/app");
  return NextResponse.next();
}

export const config = { matcher: ["/app/:path*", "/admin/:path*", "/platform/:path*", "/login", "/signup"] };
