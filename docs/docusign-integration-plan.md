# Integración DocuSign ↔ Hijuelas Growth — Plan técnico

> Estado: **pendiente de ejecución**. Cuenta DocuSign ya creada + conector MCP probado.
> Complementa `docs/firma-electronica-plan.md` (decisión: para los contratos de venta
> externos se usa DocuSign por aceptación del cliente + no-repudio de tercero, no por
> validez legal — la FES self-built también sería válida en CL/PE/MX).

## 0. Datos de la cuenta (verificados 2026-06-03 vía conector)

| Dato | Valor |
|---|---|
| Account name | **Grupo Hijuelas** |
| Account ID (GUID) | `9d02b533-5e42-4b10-ac0a-49395dfdbf48` |
| External Account ID | `246822847` |
| API base path | `https://na4.docusign.net/restapi` |
| OAuth base (producción) | `account.docusign.com` |
| Owner / User ID | Gaspar Goycoolea · `60377bbf-9e95-464c-bb46-fe87e206b11e` · gasparg@grupohijuelas.com |
| Plan | **Business Pro Trial – 30 días** (vence ~2026-07-03) · envíos ilimitados |
| Connect (webhooks) | `full` ✅ |
| Templates | 0 |

> ⚠️ **Trial**: pasar a plan pago antes del ~3 jul para no perder el envío en producción.
> 👤 **Continuidad**: agregar el correo de soporte del grupo como admin (Users → Add) para
> que la cuenta no quede atada solo a gasparg@. Idealmente el integration user de la API
> es un usuario de sistema/rol, no una persona.

## 1. Arquitectura

```
/contratos/[id]  ──(server action "Enviar a firmar")──►  DocuSign REST API
      ▲                                                        │ crea Envelope
      │                                                        │ (PDF + recipient + signHere)
      │                                                        ▼
      │                                                  Cliente recibe email
      │                                                  → firma en DocuSign
      │                                                        │
      └──(webhook DocuSign Connect)◄───────────────────────────┘ envelope-completed
            /api/docusign/webhook
            → verifica HMAC
            → contracts.status = 'firmado'
            → guarda signed PDF en Storage
            → contract_signatures (audit)
```

Dos credenciales DISTINTAS (no confundir):
- **Conector MCP** (ya conectado) = Claude ↔ DocuSign. Solo para testear/operar desde el chat.
- **Integration Key (JWT)** = la app Next.js ↔ DocuSign. Es lo que hay que crear y configurar.

## 2. Autenticación — JWT Grant (server-to-server)

La app autentica como aplicación e **impersona** al integration user (sin login interactivo).

**Prerrequisitos (en DocuSign Admin → Settings → Apps and Keys):**
1. Crear **Integration Key** (es el `client_id`).
2. Generar un **RSA keypair** → guardar la **clave privada** (la pública queda en DocuSign).
3. Anotar el **User ID** (GUID) del integration user a impersonar.
4. **Consentimiento de admin** (una sola vez) — abrir en el navegador:
   ```
   https://account.docusign.com/oauth/auth?response_type=code
     &scope=signature%20impersonation
     &client_id=<INTEGRATION_KEY>
     &redirect_uri=<una redirect URI registrada en la app>
   ```
   Aceptar con la cuenta admin. (Solo se hace una vez por integration key.)

**Flujo en runtime:**
- La app firma un JWT con la clave privada (`aud=account.docusign.com`, `iss=INTEGRATION_KEY`,
  `sub=USER_ID`, `scope=signature impersonation`) y lo cambia por un **access token** (~1h, cacheable).
- Con el token llama al REST API (`https://na4.docusign.net/restapi/v2.1/accounts/{accountId}/...`).

**Librería sugerida:** `docusign-esign` (Node SDK oficial) o REST directo con `fetch`.
> ⚠️ Verificar firmas/métodos exactos del SDK contra la doc vigente antes de codear
> (https://developers.docusign.com/docs/esign-rest-api/). Y recordar el AGENTS.md del repo:
> esta versión de Next tiene breaking changes — leer `node_modules/next/dist/docs/` antes de escribir.

## 3. Variables de entorno

`.env.local` (y Vercel env vars — Production + Preview):
```
DOCUSIGN_INTEGRATION_KEY=<client_id>
DOCUSIGN_USER_ID=60377bbf-9e95-464c-bb46-fe87e206b11e   # cambiar al integration user de sistema cuando exista
DOCUSIGN_ACCOUNT_ID=9d02b533-5e42-4b10-ac0a-49395dfdbf48
DOCUSIGN_API_BASE=https://na4.docusign.net/restapi
DOCUSIGN_OAUTH_BASE=account.docusign.com
DOCUSIGN_PRIVATE_KEY=<RSA private key — multilinea, base64 o \n-escaped>
DOCUSIGN_CONNECT_HMAC_KEY=<secret para verificar el webhook>
```
> La clave privada es secreto fuerte: NO commitear. En Vercel va como env var (no `NEXT_PUBLIC_`).

## 4. Base de datos — migración `contract_signatures`

Reusar/expandir el esquema del plan FES (`firma-electronica-plan.md`), agregando campos DocuSign:
```sql
create table public.contract_signatures (
  id                 uuid primary key default gen_random_uuid(),
  contract_id        uuid not null references public.contracts(id) on delete cascade,
  provider           text not null default 'docusign',
  envelope_id        text,                 -- DocuSign envelopeId
  status             text not null default 'created',  -- created|sent|delivered|completed|declined|voided
  signer_email       text not null,
  signer_name        text,
  signed_pdf_url     text,                 -- PDF firmado en Supabase Storage
  document_hash      text,                 -- SHA256 del PDF original
  sent_at            timestamptz,
  completed_at       timestamptz,
  declined_reason    text,
  raw_event          jsonb,                -- último payload Connect (audit)
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);
create index on public.contract_signatures (contract_id);
create unique index on public.contract_signatures (envelope_id) where envelope_id is not null;
-- RLS: lectura para authenticated del mismo tenant; escritura solo vía server actions / service role.
```

## 5. Server actions

`src/lib/actions/signatures.ts`:
- `sendContractForSignature(contractId)`:
  1. Carga el contrato + genera/obtiene el **PDF** (depende del template — ver §7).
  2. `document_hash = SHA256(pdf)`.
  3. Crea Envelope: documento (base64) + recipient (cliente: email, nombre) + `signHere` tab + `status:'sent'`.
  4. Inserta fila en `contract_signatures` (status `sent`, envelope_id, sent_at).
  5. (Opcional) marca el contrato con un sub-estado "enviado a firma".
- `getEnvelopeStatus(contractId)` — fallback de polling por si el webhook falla.
- `voidEnvelope(contractId, reason)` — anular un envío.

## 6. Webhook — DocuSign Connect

Endpoint `src/app/api/docusign/webhook/route.ts` (POST):
1. **Verificar HMAC** del header (`X-DocuSign-Signature-1`) contra `DOCUSIGN_CONNECT_HMAC_KEY`. Rechazar si no valida.
2. Parsear el evento (`envelope-completed`, `recipient-completed`, `envelope-declined`, `envelope-voided`).
3. En `completed`:
   - Descargar el **PDF firmado** (`combined`) + el **Certificate of Completion** del envelope.
   - Subirlos a Supabase Storage (`contracts-signed/`).
   - `contract_signatures`: status `completed`, `signed_pdf_url`, `completed_at`, `raw_event`.
   - `contracts.status = 'firmado'`, `signed_at = completed_at` (reusa `transitionContractStatus`).
   - Notificar al sales del contrato (email).
4. En `declined`/`voided`: registrar y notificar; el contrato NO avanza.

> Configurar Connect en DocuSign Admin → Connect → apuntando a
> `https://hijuelas-crm.vercel.app/api/docusign/webhook`, con HMAC activado y los eventos de envelope.

## 7. Dependencia bloqueante — PDF del contrato

"Enviar a firmar" necesita un **PDF**. Hoy los contratos se redactan en Word a mano. Antes de la
integración hay que resolver (de `firma-electronica-plan.md`):
1. Conseguir el contrato base en `.docx` (el PDF actual está escaneado, sin capa de texto).
2. Parametrizar variables (cliente, vivero, items, condiciones, firmas).
3. Generar el PDF on-demand desde el detalle del contrato (`pdf-lib` o template MDX/Handlebars).
Sin esto, la integración no tiene documento que enviar.

## 8. UI — `/contratos/[id]`

- Botón **"Enviar a firmar"** (gated: contrato en estado borrador/firmable, con cliente+email).
- Badge de estado de firma (Enviado / Visto / Firmado / Rechazado) leyendo `contract_signatures`.
- Link al PDF firmado + Certificate of Completion cuando `completed`.
- Reusar el patrón de `ContratoStatusBar` para no duplicar la máquina de estados.

## 9. Estados (mapeo DocuSign → CRM)

| Envelope (DocuSign) | contract_signatures.status | contracts.status |
|---|---|---|
| sent | sent | (sin cambio) |
| delivered (abierto) | delivered | (sin cambio) |
| completed | completed | **firmado** |
| declined | declined | (sin cambio) |
| voided | voided | (sin cambio) |

## 10. Fases de ejecución

- **Fase 0 — Setup cuenta** (vos): Integration Key + RSA + consent + agregar correo soporte como admin + plan pago.
- **Fase 1 — Auth + envío básico**: JWT helper, `sendContractForSignature`, tabla, botón. Probar con un PDF dummy.
- **Fase 2 — Webhook + estado**: Connect + `/api/docusign/webhook` + guardado del PDF firmado + flip a `firmado`.
- **Fase 3 — Template PDF**: parametrizar el contrato real (depende de recibir el `.docx`).
- **Fase 4 — Polish**: recordatorios, multi-firmante (cliente → vivero), notificaciones, reintentos.

## 11. Checklist concreto

- [ ] Crear Integration Key (JWT) + generar RSA keypair (guardar privada)
- [ ] Definir/crear el integration user de sistema (¿`firmas@`?) y usar su User ID
- [ ] Dar consentimiento admin (scope `signature impersonation`)
- [ ] Cargar env vars en `.env.local` + Vercel (Prod + Preview)
- [ ] Migración `contract_signatures` (+ RLS + `NOTIFY pgrst`)
- [ ] `src/lib/actions/signatures.ts` (send / status / void)
- [ ] `/api/docusign/webhook` con verificación HMAC
- [ ] Configurar Connect → URL del webhook + HMAC + eventos
- [ ] Botón "Enviar a firmar" + badge en `/contratos/[id]`
- [ ] Resolver PDF del contrato (template)
- [ ] Pasar trial → plan pago antes del ~3 jul
- [ ] Test end-to-end con un contrato real de bajo riesgo
