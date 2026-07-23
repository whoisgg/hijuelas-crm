import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = [
  "/apps",
  "/dashboard",
  "/clientes",
  "/contratos",
  "/oportunidades",
  "/calendario",
  "/mapa",
  "/catalogo",
  "/reportes",
  "/compartir",
  "/planner",
];

const AUTH_PATHS = ["/login", "/signup", "/reset-password", "/update-password"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    // Si faltan envs, dejamos pasar para que se vea el error en la página.
    return supabaseResponse;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  const isAuthPath = AUTH_PATHS.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (!user && isProtected) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  // Si el user está logueado y entra a /login o /signup, mandar al selector
  // de apps. /update-password sí lo dejamos porque puede estar logueado por
  // reset link.
  const isPublicAuthPath =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/reset-password";

  if (user && isPublicAuthPath) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/apps";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  // isAuthPath se usa para detectar rutas de auth; lo dejamos referenciado.
  void isAuthPath;

  return supabaseResponse;
}
