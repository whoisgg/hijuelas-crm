import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Antes `src/middleware.ts`: Next 16 deprecó la convención `middleware` y la
// renombró a `proxy` (mismo comportamiento, mismo matcher). El helper
// `lib/supabase/middleware` mantiene su nombre — no es file convention.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (archivos estáticos)
     * - _next/image (optimización de imágenes)
     * - favicon.ico
     * - archivos con extensión (svg/png/jpg/...)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
