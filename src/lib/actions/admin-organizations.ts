"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type OrganizationLegalRow = {
  id: string;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  contract_prefix: string | null;
  default_currency: string | null;
  active: boolean | null;
  legal_representative_name: string | null;
  legal_representative_id: string | null;
  legal_domicile: string | null;
  bank_name: string | null;
  bank_account: string | null;
  notice_name: string | null;
  notice_email: string | null;
  signer_email: string | null;
};

type RpcResult<T> = { data: T | null; error: { message: string } | null };

async function callRpc<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<RpcResult<T>> {
  const supabase = await createClient();
  return (
    supabase.rpc as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<RpcResult<T>>
  )(name, args);
}

export async function listOrganizationsLegal(): Promise<OrganizationLegalRow[]> {
  const { data, error } = await callRpc<OrganizationLegalRow[]>(
    "admin_list_organizations",
    {},
  );
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type UpdateOrgLegalInput = {
  id: string;
  legal_name: string | null;
  tax_id: string | null;
  legal_representative_name: string | null;
  legal_representative_id: string | null;
  legal_domicile: string | null;
  bank_name: string | null;
  bank_account: string | null;
  notice_name: string | null;
  notice_email: string | null;
  signer_email: string | null;
};

export async function updateOrganizationLegal(
  input: UpdateOrgLegalInput,
): Promise<{ ok: boolean; message?: string }> {
  const { error } = await callRpc("admin_update_organization_legal", {
    p_org_id: input.id,
    p_legal_name: input.legal_name,
    p_tax_id: input.tax_id,
    p_legal_representative_name: input.legal_representative_name,
    p_legal_representative_id: input.legal_representative_id,
    p_legal_domicile: input.legal_domicile,
    p_bank_name: input.bank_name,
    p_bank_account: input.bank_account,
    p_notice_name: input.notice_name,
    p_notice_email: input.notice_email,
    p_signer_email: input.signer_email,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/organizaciones");
  return { ok: true };
}
