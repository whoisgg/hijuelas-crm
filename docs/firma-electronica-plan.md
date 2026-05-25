# Firma Electrónica + Template de Contrato — Plan

> Estado: **pendiente**. Documento de referencia para próxima iteración.

## Contexto

Hoy los contratos de venta de plantas se imprimen y firman a mano. Queremos
digitalizar el flujo end-to-end sin pagar DocuSign. Chile permite **Firma
Electrónica Simple (FES)** para contratos privados — alcanza para los
contratos de Viveros Hijuelas.

## Marco legal — Chile / Perú / México

Hijuelas vende a clientes en los 3 países. La solución debe ser válida
en cada jurisdicción para contratos comerciales privados.

### 🇨🇱 Chile — Ley 19.799

| Tipo | Requisitos | Cuándo usar |
|---|---|---|
| **Firma Electrónica Simple (FES)** | Datos electrónicos vinculados + intención clara | Contratos comerciales, NDAs, propuestas |
| **Firma Electrónica Avanzada (FEA)** | Certificado de prestador acreditado + dispositivo seguro | Escrituras públicas, actos ante notario |

FES tiene mismo valor probatorio que firma manuscrita en contratos privados.
**Nuestros contratos = FES.**

### 🇵🇪 Perú — Ley 27269 (Firmas y Certificados Digitales) + DL 681

| Tipo | Requisitos | Cuándo usar |
|---|---|---|
| **Firma Electrónica** | Aceptada entre partes que consienten el medio | Contratos comerciales privados |
| **Firma Digital / Avanzada** | Certificado de entidad acreditada por INDECOPI (IOFE) | Actos sometidos a registro público, trámites estatales |

Art. 1 Ley 27269: la firma electrónica que cumpla con los requisitos
mínimos (identificación + integridad + voluntad) tiene mismo valor
probatorio. **Nuestros contratos = FE simple.**

### 🇲🇽 México — Código de Comercio (Art. 89-114) + NOM-151-SCFI-2016

| Tipo | Requisitos | Cuándo usar |
|---|---|---|
| **Firma Electrónica** | Datos en mensaje de datos atribuible al firmante | Contratos mercantiles entre privados |
| **Firma Electrónica Avanzada (FIEL / eFirma)** | Emitida por SAT (autoridad fiscal) | Trámites con autoridades, facturación |

Art. 97 CCo: cualquier firma electrónica es válida si garantiza
fiabilidad apropiada para el fin. NOM-151 regula la conservación de
mensajes de datos (timestamp confiable — usar NTP server + log audit).
**Nuestros contratos = FE simple (Art. 89-bis CCo).**

### Cumplimiento universal (FES válida en los 3)

Los 3 marcos coinciden en los **requisitos mínimos** que debe cumplir
nuestro flujo:

- ✅ **Identificación del firmante** — email + OTP verificado (link a RUT/RFC opcional)
- ✅ **Integridad del documento** — hash SHA256 del PDF al momento de firmar
- ✅ **Trazabilidad / no-repudio** — timestamp UTC (NTP), IP, user-agent, log inmutable de aceptación
- ✅ **Manifestación clara de voluntad** — checkbox + texto "Acepto y firmo electrónicamente"
- ✅ **Conservación** — PDF firmado + audit trail almacenados por el plazo legal (5 años Chile, 10 años Perú/México para fines tributarios)

Una implementación que cumpla los 5 puntos es válida en los 3 países
para contratos comerciales privados como los nuestros (sin requisito
de FEA / firma digital).

### Recomendación para escalamiento

Si en algún momento se necesita firma con mayor peso probatorio (en
juicio, por ejemplo), opciones:

- **🇨🇱 Chile:** integrar con e-Sign / Acepta (proveedores acreditados FEA)
- **🇵🇪 Perú:** integrar con Llama.pe / Camerfirma Perú (entidades IOFE)
- **🇲🇽 México:** habilitar firma con FIEL del SAT (cliente firma con su eFirma)

## Plan en 3 fases

### Fase 1 — Self-built básico (~2-3 días dev, $0 costo)

**Tabla nueva `contract_signatures`:**
```sql
- id uuid PK
- contract_id uuid FK contracts
- signer_email text
- signer_otp_verified_at timestamptz
- signer_ip inet
- signer_user_agent text
- signature_image_url text  -- canvas dibujo guardado en Storage
- signed_pdf_url text       -- PDF final con firma + audit page
- document_hash text        -- SHA256 del PDF original
- signed_at timestamptz
- created_at timestamptz
```

**Flujo:**
1. Click "Enviar a firmar" en `/contratos/[id]` → genera token único
2. Sistema envía email con link `/firmar/[token]` (provider: ver Fase 1.5)
3. Cliente abre link → ve PDF embebido → dibuja firma con dedo/mouse en canvas
4. Sistema captura: timestamp UTC, IP, user-agent, email verificado
5. Backend genera PDF firmado con `pdf-lib`:
   - Inserta imagen de firma en última página
   - Agrega página final con audit trail (todos los datos arriba)
6. Guarda PDF firmado en Supabase Storage
7. Marca `contracts.status = firmado`, `signed_at = NOW()`
8. Notifica al sales del contrato vía email

**Stack:**
- `pdf-lib` (npm) para edición server-side del PDF
- `react-signature-canvas` para el drawing pad
- Supabase Storage para archivos
- Resend o Supabase magic-link para OTP

### Fase 1.5 — Decisión OTP / autenticación

Pendiente decidir entre:

- **Resend** (3000 emails/mes gratis, React Email templates)
- **Supabase Auth magic-link** (cero config, look "Supabase" por default)
- **WhatsApp Business Cloud API** (1000 conversaciones/mes gratis, más LatAm-friendly)

### Fase 2 — Polish

- Recordatorios automáticos (cron job): 3, 7, 14 días sin firmar
- Multi-firmante secuencial (cliente firma → vivero firma)
- Plantilla de email customizable por organización
- Webhook outbound a otros sistemas (futuro)

### Fase 3 — Migrar a Documenso/DocuSign si

- Volumen pasa de ~50 contratos/mes (justifica el costo)
- Necesidad de FEA (firma avanzada) para ciertos casos especiales
- Flujos con varios firmantes en paralelo o lógica condicional compleja

## Pendiente urgente: parsear el contrato actual a template

**Problema actual:** los contratos se redactan manualmente en Word.
Cada uno copia-pega del anterior. No hay template oficial en el sistema.

**Plan:**

1. **Recibir** el contrato base en formato editable (.docx) — el PDF que
   se subió como referencia está escaneado (sin capa de texto), no
   utilizable directamente.
2. **Identificar** las variables a parametrizar:
   - Datos cliente (razón social, RUT, dirección, representante legal)
   - Datos vivero (organización, RUT, representante)
   - Tabla de items (variedad, cantidad, precio unitario, moneda, semana
     entrega, año)
   - Condiciones comerciales (forma de pago, plazos, royalty, FX rate)
   - Firmas + fecha
3. **Crear** template en MDX o Handlebars en
   `src/lib/contract-templates/[org-slug].mdx` con variables `{{client_name}}`
   etc.
4. **Generar** PDF on-demand desde el detalle del contrato vía `pdf-lib`
   con datos del DB inyectados al template.
5. **Storage** del PDF generado en Supabase Storage bucket `contracts-pdf/`.

## Estimación

- Fase 1: 2-3 días dev (sin contar revisión legal)
- Template: 1 día (después de recibir .docx)
- Total para tener "Enviar a firmar" funcionando: ~1 semana de dev

## Próximos pasos concretos

- [ ] Conseguir el contrato base en .docx (no en PDF escaneado)
- [ ] Confirmar provider de OTP (Resend / Supabase / WhatsApp)
- [ ] Validar el plan con un abogado chileno de tu confianza (1 hora consulta)
- [ ] Crear tabla `contract_signatures` (migración Supabase)
- [ ] Implementar Fase 1
