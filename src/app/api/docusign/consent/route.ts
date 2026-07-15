export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Landing del consentimiento de admin de DocuSign (JWT Grant). DocuSign redirige
 * acá tras aceptar el scope `signature impersonation`. El consentimiento queda
 * registrado al hacer "Allow"; este endpoint solo muestra un mensaje amable (no
 * necesita procesar el ?code para el flujo JWT). Ver docs/docusign-integration-plan.md §2.
 *
 * Debe estar registrado como Redirect URI en la app DocuSign:
 *   https://hijuelas-crm.vercel.app/api/docusign/consent
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const error = url.searchParams.get("error");
  const ok = !error;

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>DocuSign — Consentimiento</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7f8;
    display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;color:#1f2937}
  .card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:32px 36px;max-width:440px;
    box-shadow:0 1px 3px rgba(0,0,0,.06);text-align:center}
  .ico{font-size:40px;margin-bottom:8px}
  h1{font-size:18px;margin:8px 0}
  p{font-size:14px;color:#4b5563;line-height:1.5}
  code{background:#f3f4f6;padding:2px 6px;border-radius:6px;font-size:12px}
</style></head>
<body><div class="card">
  <div class="ico">${ok ? "✅" : "⚠️"}</div>
  <h1>${ok ? "Consentimiento otorgado" : "No se pudo otorgar el consentimiento"}</h1>
  <p>${
    ok
      ? "DocuSign ya autorizó la integración <b>HijuelasGrowth</b> (scope <code>signature impersonation</code>). Podés cerrar esta pestaña; la app Hijuelas One ya puede enviar contratos a firmar."
      : `Error: <code>${error}</code>. Revisá que el Integration Key y el redirect URI coincidan, y volvé a intentar.`
  }</p>
</div></body></html>`;

  return new Response(html, {
    status: ok ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
