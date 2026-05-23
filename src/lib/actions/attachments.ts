"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";

import { createClient } from "@/lib/supabase/server";

const BUCKET = "attachments";

export type AttachmentRow = {
  id: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  path: string;
  created_at: string;
  uploaded_by: string | null;
};

/**
 * Sube un archivo a Storage + crea la fila en `attachments`.
 * `formData` debe contener:
 *   - entity_type (e.g. "contract")
 *   - entity_id   (UUID)
 *   - file        (File)
 */
export async function uploadAttachment(formData: FormData) {
  const entityType = formData.get("entity_type") as string;
  const entityId = formData.get("entity_id") as string;
  const file = formData.get("file") as File | null;

  if (!entityType || !entityId || !file) {
    throw new Error("Faltan campos entity_type / entity_id / file");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  // Sanitizar filename (mantiene letras, números, dots, dashes, underscores)
  const safeName = file.name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 200);
  const path = `${entityType}/${entityId}/${Date.now()}-${randomUUID().slice(0, 8)}-${safeName}`;

  // Upload binary
  const buffer = Buffer.from(await file.arrayBuffer());
  const upload = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type || "application/octet-stream",
    cacheControl: "3600",
    upsert: false,
  });
  if (upload.error) throw new Error(upload.error.message);

  // Insert metadata row
  const insertRes = await supabase
    .from("attachments")
    .insert({
      entity_type: entityType,
      entity_id: entityId,
      path,
      filename: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: user.id,
    })
    .select("id")
    .single();
  if (insertRes.error) {
    // Rollback storage upload
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(insertRes.error.message);
  }

  if (entityType === "contract") revalidatePath(`/contratos/${entityId}`);
  return { ok: true, id: insertRes.data.id };
}

export async function listAttachments(
  entityType: string,
  entityId: string,
): Promise<AttachmentRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attachments")
    .select("id, filename, mime_type, size_bytes, path, created_at, uploaded_by")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Devuelve una URL firmada (1 hora) para descargar el archivo.
 */
export async function getAttachmentDownloadUrl(
  attachmentId: string,
): Promise<{ url: string; filename: string }> {
  const supabase = await createClient();
  const { data: row, error: rowErr } = await supabase
    .from("attachments")
    .select("path, filename")
    .eq("id", attachmentId)
    .single();
  if (rowErr) throw new Error(rowErr.message);

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(row.path, 60 * 60, { download: row.filename });
  if (error) throw new Error(error.message);
  return { url: data.signedUrl, filename: row.filename };
}

export async function deleteAttachment(attachmentId: string) {
  const supabase = await createClient();
  const { data: row, error: rowErr } = await supabase
    .from("attachments")
    .select("path, entity_type, entity_id")
    .eq("id", attachmentId)
    .single();
  if (rowErr) throw new Error(rowErr.message);

  // Soft-delete metadata
  const { error: updErr } = await supabase
    .from("attachments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", attachmentId);
  if (updErr) throw new Error(updErr.message);

  // Hard delete from storage (libera espacio)
  await supabase.storage.from(BUCKET).remove([row.path]);

  if (row.entity_type === "contract") {
    revalidatePath(`/contratos/${row.entity_id}`);
  }
  return { ok: true };
}
