import type { Database, Json } from "@/lib/database.types";

type CurrencyCode = Database["public"]["Enums"]["currency_code"];
type DeliveryStatus = Database["public"]["Enums"]["delivery_status"];
type MaterialType = Database["public"]["Enums"]["material_type"];
type PaymentStatus = Database["public"]["Enums"]["payment_status"];
type PaymentType = Database["public"]["Enums"]["payment_type"];
type AmendmentType = Database["public"]["Enums"]["amendment_type"];
type ContractStatus = Database["public"]["Enums"]["contract_status"];

export type ContractItemRow = {
  id: string;
  variety_id: string;
  variety_name: string | null;
  qty_plants: number;
  qty_delivered: number;
  unit_price: number;
  currency: CurrencyCode;
  delivery_year: number;
  delivery_week: number;
  format: string | null;
  material_type: MaterialType | null;
  status: DeliveryStatus;
  notes: string | null;
};

export type ContractPayment = {
  id: string;
  type: PaymentType;
  amount: number;
  iva: number;
  currency: CurrencyCode;
  status: PaymentStatus;
  due_date: string | null;
  paid_at: string | null;
  reference: string | null;
};

export type ContractAmendment = {
  id: string;
  type: AmendmentType;
  reason: string | null;
  diff_json: Json | null;
  applied_at: string;
  created_by: string | null;
  created_at: string;
};

export type ContractVersion = {
  id: string;
  version_n: number;
  pdf_url: string | null;
  frozen_at: string;
  created_at: string;
};

export type ContractHeader = {
  id: string;
  number: string;
  status: ContractStatus;
  currency: CurrencyCode;
  total_neto: number;
  total_iva: number;
  total_neto_usd: number;
  signed_at: string | null;
  created_at: string;
  notes: string | null;
  incoterm: string | null;
  client: { id: string; name: string; tax_id: string | null } | null;
  organization: { id: string; name: string; contract_prefix: string } | null;
};
