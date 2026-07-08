-- Tipos de documento comercial y despacho a terceros.
--
-- 1. doc_type: un cliente puede tener contratos, órdenes de compra o ventas
--    spot (sin contrato). Se reutiliza la tabla contracts como documento
--    comercial genérico.
-- 2. ship_to_client_id: el documento siempre pertenece al cliente que paga
--    (client_id). Cuando se despacha a un tercero, se registra aquí a nivel
--    de documento, con override opcional por entrega en deliveries.

create type commercial_doc_type as enum ('contrato', 'orden_compra', 'venta_spot');

alter table public.contracts
  add column doc_type commercial_doc_type not null default 'contrato',
  add column ship_to_client_id uuid references public.clients(id);

alter table public.deliveries
  add column ship_to_client_id uuid references public.clients(id),
  add column ship_to_address text;

comment on column public.contracts.doc_type is
  'Tipo de documento comercial: contrato, orden_compra o venta_spot (venta sin contrato).';
comment on column public.contracts.ship_to_client_id is
  'Cliente al que se despacha cuando difiere del que paga (client_id). NULL = se despacha al mismo cliente.';
comment on column public.deliveries.ship_to_client_id is
  'Override por entrega del cliente de despacho. NULL = hereda el ship_to del contrato (o el cliente pagador).';

create index contracts_doc_type_idx on public.contracts (doc_type);
create index contracts_ship_to_client_idx on public.contracts (ship_to_client_id) where ship_to_client_id is not null;
create index deliveries_ship_to_client_idx on public.deliveries (ship_to_client_id) where ship_to_client_id is not null;
