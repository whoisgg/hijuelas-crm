export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          diff_json: Json | null
          entity_id: string
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          diff_json?: Json | null
          entity_id: string
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          diff_json?: Json | null
          entity_id?: string
          entity_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      app_users: {
        Row: {
          avatar_url: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
          is_module_builder: boolean
          organization_id: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
          is_module_builder?: boolean
          organization_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          is_module_builder?: boolean
          organization_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          entity_id: string
          entity_type: string
          filename: string
          id: string
          mime_type: string | null
          path: string
          size_bytes: number | null
          updated_at: string
          updated_by: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          entity_id: string
          entity_type: string
          filename: string
          id?: string
          mime_type?: string | null
          path: string
          size_bytes?: number | null
          updated_at?: string
          updated_by?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          entity_id?: string
          entity_type?: string
          filename?: string
          id?: string
          mime_type?: string | null
          path?: string
          size_bytes?: number | null
          updated_at?: string
          updated_by?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      client_addresses: {
        Row: {
          client_id: string
          country_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          line1: string | null
          line2: string | null
          postal_code: string | null
          region: string | null
          type: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_id: string
          country_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          line1?: string | null
          line2?: string | null
          postal_code?: string | null
          region?: string | null
          type?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_id?: string
          country_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          line1?: string | null
          line2?: string | null
          postal_code?: string | null
          region?: string | null
          type?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_addresses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_addresses_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contacts: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          id: string
          is_primary: boolean
          name: string
          notes: string | null
          phone: string | null
          role: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_share_links: {
        Row: {
          client_id: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          last_opened_at: string | null
          open_count: number
          revoked_at: string | null
          token: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          last_opened_at?: string | null
          open_count?: number
          revoked_at?: string | null
          token: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          last_opened_at?: string | null
          open_count?: number
          revoked_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_share_links_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_share_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          account_owner_id: string | null
          country_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          giro: string | null
          id: string
          is_active: boolean
          legal_name: string | null
          name: string
          notes: string | null
          region: string | null
          source: string | null
          tax_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_owner_id?: string | null
          country_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          giro?: string | null
          id?: string
          is_active?: boolean
          legal_name?: string | null
          name: string
          notes?: string | null
          region?: string | null
          source?: string | null
          tax_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_owner_id?: string | null
          country_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          giro?: string | null
          id?: string
          is_active?: boolean
          legal_name?: string | null
          name?: string
          notes?: string | null
          region?: string | null
          source?: string | null
          tax_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_account_owner_id_fkey"
            columns: ["account_owner_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          entity_id: string
          entity_type: string
          id: string
          mentions: string[]
          parent_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          mentions?: string[]
          parent_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          mentions?: string[]
          parent_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_amendments: {
        Row: {
          applied_at: string
          contract_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          diff_json: Json
          id: string
          reason: string | null
          type: Database["public"]["Enums"]["amendment_type"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          applied_at?: string
          contract_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          diff_json: Json
          id?: string
          reason?: string | null
          type: Database["public"]["Enums"]["amendment_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          applied_at?: string
          contract_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          diff_json?: Json
          id?: string
          reason?: string | null
          type?: Database["public"]["Enums"]["amendment_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_amendments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_items: {
        Row: {
          contract_id: string
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          deleted_at: string | null
          delivery_month: number | null
          delivery_week: number
          delivery_year: number
          format: string | null
          genetic_program_id: string | null
          id: string
          legacy_excel_row: number | null
          material_type: Database["public"]["Enums"]["material_type"] | null
          notes: string | null
          qty_delivered: number
          qty_plants: number
          status: Database["public"]["Enums"]["delivery_status"]
          unit_price: number
          updated_at: string
          updated_by: string | null
          variety_id: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          created_by?: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          deleted_at?: string | null
          delivery_month?: number | null
          delivery_week: number
          delivery_year: number
          format?: string | null
          genetic_program_id?: string | null
          id?: string
          legacy_excel_row?: number | null
          material_type?: Database["public"]["Enums"]["material_type"] | null
          notes?: string | null
          qty_delivered?: number
          qty_plants: number
          status?: Database["public"]["Enums"]["delivery_status"]
          unit_price: number
          updated_at?: string
          updated_by?: string | null
          variety_id: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          deleted_at?: string | null
          delivery_month?: number | null
          delivery_week?: number
          delivery_year?: number
          format?: string | null
          genetic_program_id?: string | null
          id?: string
          legacy_excel_row?: number | null
          material_type?: Database["public"]["Enums"]["material_type"] | null
          notes?: string | null
          qty_delivered?: number
          qty_plants?: number
          status?: Database["public"]["Enums"]["delivery_status"]
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
          variety_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_items_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_items_genetic_program_id_fkey"
            columns: ["genetic_program_id"]
            isOneToOne: false
            referencedRelation: "genetic_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_items_variety_id_fkey"
            columns: ["variety_id"]
            isOneToOne: false
            referencedRelation: "varieties"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_notes: {
        Row: {
          author_id: string
          body: string
          contract_id: string
          created_at: string
          deleted_at: string | null
          id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          contract_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          contract_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_notes_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_signatures: {
        Row: {
          certificate_url: string | null
          completed_at: string | null
          contract_id: string
          created_at: string
          created_by: string | null
          declined_reason: string | null
          delivered_at: string | null
          document_hash: string | null
          envelope_id: string | null
          id: string
          provider: string
          raw_event: Json | null
          sent_at: string | null
          signed_pdf_url: string | null
          signer_email: string
          signer_name: string | null
          status: string
          updated_at: string
        }
        Insert: {
          certificate_url?: string | null
          completed_at?: string | null
          contract_id: string
          created_at?: string
          created_by?: string | null
          declined_reason?: string | null
          delivered_at?: string | null
          document_hash?: string | null
          envelope_id?: string | null
          id?: string
          provider?: string
          raw_event?: Json | null
          sent_at?: string | null
          signed_pdf_url?: string | null
          signer_email: string
          signer_name?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          certificate_url?: string | null
          completed_at?: string | null
          contract_id?: string
          created_at?: string
          created_by?: string | null
          declined_reason?: string | null
          delivered_at?: string | null
          document_hash?: string | null
          envelope_id?: string | null
          id?: string
          provider?: string
          raw_event?: Json | null
          sent_at?: string | null
          signed_pdf_url?: string | null
          signer_email?: string
          signer_name?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_signatures_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_signatures_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_versions: {
        Row: {
          contract_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          frozen_at: string
          id: string
          pdf_url: string | null
          snapshot_json: Json
          updated_at: string
          updated_by: string | null
          version_n: number
        }
        Insert: {
          contract_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          frozen_at?: string
          id?: string
          pdf_url?: string | null
          snapshot_json: Json
          updated_at?: string
          updated_by?: string | null
          version_n: number
        }
        Update: {
          contract_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          frozen_at?: string
          id?: string
          pdf_url?: string | null
          snapshot_json?: Json
          updated_at?: string
          updated_by?: string | null
          version_n?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_versions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          client_id: string
          condition: Database["public"]["Enums"]["condition_type"]
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          deleted_at: string | null
          doc_type: Database["public"]["Enums"]["commercial_doc_type"]
          fx_rate_to_usd: number | null
          id: string
          incoterm: string | null
          kam_id: string | null
          notes: string | null
          number: string
          organization_id: string
          sale_type: Database["public"]["Enums"]["sale_type"] | null
          ship_to_client_id: string | null
          signed_at: string | null
          source_opportunity_id: string | null
          status: Database["public"]["Enums"]["contract_status"]
          total_iva: number
          total_neto: number
          total_neto_usd: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_id: string
          condition?: Database["public"]["Enums"]["condition_type"]
          created_at?: string
          created_by?: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          deleted_at?: string | null
          doc_type?: Database["public"]["Enums"]["commercial_doc_type"]
          fx_rate_to_usd?: number | null
          id?: string
          incoterm?: string | null
          kam_id?: string | null
          notes?: string | null
          number: string
          organization_id: string
          sale_type?: Database["public"]["Enums"]["sale_type"] | null
          ship_to_client_id?: string | null
          signed_at?: string | null
          source_opportunity_id?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          total_iva?: number
          total_neto?: number
          total_neto_usd?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_id?: string
          condition?: Database["public"]["Enums"]["condition_type"]
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          deleted_at?: string | null
          doc_type?: Database["public"]["Enums"]["commercial_doc_type"]
          fx_rate_to_usd?: number | null
          id?: string
          incoterm?: string | null
          kam_id?: string | null
          notes?: string | null
          number?: string
          organization_id?: string
          sale_type?: Database["public"]["Enums"]["sale_type"] | null
          ship_to_client_id?: string | null
          signed_at?: string | null
          source_opportunity_id?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          total_iva?: number
          total_neto?: number
          total_neto_usd?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_kam_id_fkey"
            columns: ["kam_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_ship_to_client_id_fkey"
            columns: ["ship_to_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_source_opportunity_id_fkey"
            columns: ["source_opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      countries: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          iso2: string
          iso3: string
          lat: number | null
          lon: number | null
          name_en: string
          name_es: string
          region: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          iso2: string
          iso3: string
          lat?: number | null
          lon?: number | null
          name_en: string
          name_es: string
          region?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          iso2?: string
          iso3?: string
          lat?: number | null
          lon?: number | null
          name_en?: string
          name_es?: string
          region?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      custom_fields: {
        Row: {
          id: number
          key: string
          label: string
          master_source: string | null
          module_id: number
          options: Json
          required: boolean
          sort: number
          type: string
        }
        Insert: {
          id?: number
          key: string
          label: string
          master_source?: string | null
          module_id: number
          options?: Json
          required?: boolean
          sort?: number
          type: string
        }
        Update: {
          id?: number
          key?: string
          label?: string
          master_source?: string | null
          module_id?: number
          options?: Json
          required?: boolean
          sort?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_fields_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "custom_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_modules: {
        Row: {
          created_at: string
          description: string | null
          icon: string
          id: number
          key: string
          name: string
          owner_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string
          id?: number
          key: string
          name: string
          owner_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string
          id?: number
          key?: string
          name?: string
          owner_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_modules_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_records: {
        Row: {
          created_at: string
          created_by: string | null
          data: Json
          id: number
          module_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: number
          module_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: number
          module_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_records_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_records_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "custom_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      deliveries: {
        Row: {
          contract_item_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          delivered_at: string
          id: string
          notes: string | null
          qty_delivered: number
          remito_number: string | null
          ship_to_address: string | null
          ship_to_client_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          contract_item_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          delivered_at: string
          id?: string
          notes?: string | null
          qty_delivered: number
          remito_number?: string | null
          ship_to_address?: string | null
          ship_to_client_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          contract_item_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          delivered_at?: string
          id?: string
          notes?: string | null
          qty_delivered?: number
          remito_number?: string | null
          ship_to_address?: string | null
          ship_to_client_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_contract_item_id_fkey"
            columns: ["contract_item_id"]
            isOneToOne: false
            referencedRelation: "contract_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_ship_to_client_id_fkey"
            columns: ["ship_to_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      genetic_programs: {
        Row: {
          created_at: string
          created_by: string | null
          default_royalty_pct: number
          default_royalty_per_plant: number
          deleted_at: string | null
          id: string
          name: string
          notes: string | null
          owner: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_royalty_pct?: number
          default_royalty_per_plant?: number
          deleted_at?: string | null
          id?: string
          name: string
          notes?: string | null
          owner?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_royalty_pct?: number
          default_royalty_per_plant?: number
          deleted_at?: string | null
          id?: string
          name?: string
          notes?: string | null
          owner?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      mcp_tokens: {
        Row: {
          created_at: string
          id: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          scopes: string[]
          token_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
          scopes?: string[]
          token_hash: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          scopes?: string[]
          token_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          link: string | null
          payload: Json | null
          read_at: string | null
          title: string
          type: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          link?: string | null
          payload?: Json | null
          read_at?: string | null
          title: string
          type: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          link?: string | null
          payload?: Json | null
          read_at?: string | null
          title?: string
          type?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          client_id: string | null
          client_name_raw: string | null
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          deleted_at: string | null
          estimated_value: number | null
          estimated_value_usd: number | null
          expected_close_date: string | null
          id: string
          lost_reason: string | null
          name: string
          notes: string | null
          organization_id: string
          owner_id: string | null
          probability_pct: number
          source: string | null
          stage_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_id?: string | null
          client_name_raw?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          deleted_at?: string | null
          estimated_value?: number | null
          estimated_value_usd?: number | null
          expected_close_date?: string | null
          id?: string
          lost_reason?: string | null
          name: string
          notes?: string | null
          organization_id: string
          owner_id?: string | null
          probability_pct: number
          source?: string | null
          stage_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_id?: string | null
          client_name_raw?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          deleted_at?: string | null
          estimated_value?: number | null
          estimated_value_usd?: number | null
          expected_close_date?: string | null
          id?: string
          lost_reason?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          owner_id?: string | null
          probability_pct?: number
          source?: string | null
          stage_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "opportunity_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_activities: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          done_at: string | null
          due_at: string | null
          id: string
          opportunity_id: string
          owner_id: string | null
          subject: string
          type: Database["public"]["Enums"]["activity_type"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          done_at?: string | null
          due_at?: string | null
          id?: string
          opportunity_id: string
          owner_id?: string | null
          subject: string
          type: Database["public"]["Enums"]["activity_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          done_at?: string | null
          due_at?: string | null
          id?: string
          opportunity_id?: string
          owner_id?: string | null
          subject?: string
          type?: Database["public"]["Enums"]["activity_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_activities_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_activities_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_items: {
        Row: {
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"] | null
          deleted_at: string | null
          expected_delivery_week: number | null
          expected_delivery_year: number | null
          format: string | null
          id: string
          notes: string | null
          opportunity_id: string
          qty_plants_est: number
          unit_price_est: number | null
          updated_at: string
          updated_by: string | null
          variety_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"] | null
          deleted_at?: string | null
          expected_delivery_week?: number | null
          expected_delivery_year?: number | null
          format?: string | null
          id?: string
          notes?: string | null
          opportunity_id: string
          qty_plants_est: number
          unit_price_est?: number | null
          updated_at?: string
          updated_by?: string | null
          variety_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"] | null
          deleted_at?: string | null
          expected_delivery_week?: number | null
          expected_delivery_year?: number | null
          format?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string
          qty_plants_est?: number
          unit_price_est?: number | null
          updated_at?: string
          updated_by?: string | null
          variety_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_items_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_items_variety_id_fkey"
            columns: ["variety_id"]
            isOneToOne: false
            referencedRelation: "varieties"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_stages: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_lost: boolean
          is_won: boolean
          name: string
          order_index: number
          probability_default: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_lost?: boolean
          is_won?: boolean
          name: string
          order_index: number
          probability_default: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_lost?: boolean
          is_won?: boolean
          name?: string
          order_index?: number
          probability_default?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      organizations: {
        Row: {
          active: boolean
          bank_account: string | null
          bank_name: string | null
          contract_prefix: string
          country_id: string | null
          created_at: string
          created_by: string | null
          default_currency: Database["public"]["Enums"]["currency_code"]
          deleted_at: string | null
          id: string
          legal_domicile: string | null
          legal_name: string | null
          legal_representative_id: string | null
          legal_representative_name: string | null
          logo_url: string | null
          name: string
          notice_email: string | null
          notice_name: string | null
          signer_email: string | null
          tax_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          bank_account?: string | null
          bank_name?: string | null
          contract_prefix: string
          country_id?: string | null
          created_at?: string
          created_by?: string | null
          default_currency?: Database["public"]["Enums"]["currency_code"]
          deleted_at?: string | null
          id?: string
          legal_domicile?: string | null
          legal_name?: string | null
          legal_representative_id?: string | null
          legal_representative_name?: string | null
          logo_url?: string | null
          name: string
          notice_email?: string | null
          notice_name?: string | null
          signer_email?: string | null
          tax_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          bank_account?: string | null
          bank_name?: string | null
          contract_prefix?: string
          country_id?: string | null
          created_at?: string
          created_by?: string | null
          default_currency?: Database["public"]["Enums"]["currency_code"]
          deleted_at?: string | null
          id?: string
          legal_domicile?: string | null
          legal_name?: string | null
          legal_representative_id?: string | null
          legal_representative_name?: string | null
          logo_url?: string | null
          name?: string
          notice_email?: string | null
          notice_name?: string | null
          signer_email?: string | null
          tax_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          contract_id: string
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          deleted_at: string | null
          due_date: string | null
          id: string
          iva: number
          paid_at: string | null
          reference: string | null
          status: Database["public"]["Enums"]["payment_status"]
          type: Database["public"]["Enums"]["payment_type"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          contract_id: string
          created_at?: string
          created_by?: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          iva?: number
          paid_at?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          type: Database["public"]["Enums"]["payment_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          contract_id?: string
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          iva?: number
          paid_at?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          type?: Database["public"]["Enums"]["payment_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      planner_aliases: {
        Row: {
          alias: string
          canonical: string
          id: number
          kind: string
        }
        Insert: {
          alias: string
          canonical: string
          id?: number
          kind: string
        }
        Update: {
          alias?: string
          canonical?: string
          id?: number
          kind?: string
        }
        Relationships: []
      }
      planner_areas: {
        Row: {
          active: boolean
          capacity_trays: number
          created_at: string
          id: number
          name: string
          priority: number
          stage: string
          type: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          capacity_trays?: number
          created_at?: string
          id?: number
          name: string
          priority?: number
          stage: string
          type?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          capacity_trays?: number
          created_at?: string
          id?: number
          name?: string
          priority?: number
          stage?: string
          type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      planner_calendar_weeks: {
        Row: {
          campaign_week: number | null
          end_date: string | null
          id: number
          month_name: string | null
          start_date: string | null
          week: number
          year: number
        }
        Insert: {
          campaign_week?: number | null
          end_date?: string | null
          id?: number
          month_name?: string | null
          start_date?: string | null
          week: number
          year: number
        }
        Update: {
          campaign_week?: number | null
          end_date?: string | null
          id?: number
          month_name?: string | null
          start_date?: string | null
          week?: number
          year?: number
        }
        Relationships: []
      }
      planner_demand: {
        Row: {
          id: number
          month_name: string | null
          plants: number
          species_id: number
          tray_format: number | null
          trays: number | null
          upload_id: string | null
          variety_id: number | null
          week: number
          year: number
        }
        Insert: {
          id?: number
          month_name?: string | null
          plants: number
          species_id: number
          tray_format?: number | null
          trays?: number | null
          upload_id?: string | null
          variety_id?: number | null
          week: number
          year: number
        }
        Update: {
          id?: number
          month_name?: string | null
          plants?: number
          species_id?: number
          tray_format?: number | null
          trays?: number | null
          upload_id?: string | null
          variety_id?: number | null
          week?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "planner_demand_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "planner_species"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planner_demand_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "planner_uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planner_demand_variety_id_fkey"
            columns: ["variety_id"]
            isOneToOne: false
            referencedRelation: "planner_varieties"
            referencedColumns: ["id"]
          },
        ]
      }
      planner_locations: {
        Row: {
          capacity_trays: number | null
          code: string
          id: number
          module_id: number
          row_num: number | null
          side: string | null
          tray_format: number | null
        }
        Insert: {
          capacity_trays?: number | null
          code: string
          id?: number
          module_id: number
          row_num?: number | null
          side?: string | null
          tray_format?: number | null
        }
        Update: {
          capacity_trays?: number | null
          code?: string
          id?: number
          module_id?: number
          row_num?: number | null
          side?: string | null
          tray_format?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "planner_locations_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "planner_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      planner_lots: {
        Row: {
          end_week: number | null
          id: number
          lot_code: string
          maturation_area_id: number | null
          maturation_end_week: number | null
          maturation_start_week: number | null
          maturation_weeks: number
          plants: number
          predispatch_area_id: number | null
          predispatch_end_week: number | null
          predispatch_start_week: number | null
          predispatch_weeks: number
          rooting_area_id: number | null
          rooting_end_week: number | null
          rooting_start_week: number | null
          rooting_weeks: number
          species_id: number
          start_week: number
          status: string
          tray_format: number | null
          trays: number | null
          upload_id: string | null
          variety_id: number | null
          year: number
        }
        Insert: {
          end_week?: number | null
          id?: number
          lot_code: string
          maturation_area_id?: number | null
          maturation_end_week?: number | null
          maturation_start_week?: number | null
          maturation_weeks?: number
          plants: number
          predispatch_area_id?: number | null
          predispatch_end_week?: number | null
          predispatch_start_week?: number | null
          predispatch_weeks?: number
          rooting_area_id?: number | null
          rooting_end_week?: number | null
          rooting_start_week?: number | null
          rooting_weeks?: number
          species_id: number
          start_week: number
          status?: string
          tray_format?: number | null
          trays?: number | null
          upload_id?: string | null
          variety_id?: number | null
          year: number
        }
        Update: {
          end_week?: number | null
          id?: number
          lot_code?: string
          maturation_area_id?: number | null
          maturation_end_week?: number | null
          maturation_start_week?: number | null
          maturation_weeks?: number
          plants?: number
          predispatch_area_id?: number | null
          predispatch_end_week?: number | null
          predispatch_start_week?: number | null
          predispatch_weeks?: number
          rooting_area_id?: number | null
          rooting_end_week?: number | null
          rooting_start_week?: number | null
          rooting_weeks?: number
          species_id?: number
          start_week?: number
          status?: string
          tray_format?: number | null
          trays?: number | null
          upload_id?: string | null
          variety_id?: number | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "planner_lots_maturation_area_id_fkey"
            columns: ["maturation_area_id"]
            isOneToOne: false
            referencedRelation: "planner_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planner_lots_predispatch_area_id_fkey"
            columns: ["predispatch_area_id"]
            isOneToOne: false
            referencedRelation: "planner_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planner_lots_rooting_area_id_fkey"
            columns: ["rooting_area_id"]
            isOneToOne: false
            referencedRelation: "planner_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planner_lots_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "planner_species"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planner_lots_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "planner_uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planner_lots_variety_id_fkey"
            columns: ["variety_id"]
            isOneToOne: false
            referencedRelation: "planner_varieties"
            referencedColumns: ["id"]
          },
        ]
      }
      planner_modules: {
        Row: {
          area_id: number
          id: number
          name: string
          sort: number
        }
        Insert: {
          area_id: number
          id?: number
          name: string
          sort?: number
        }
        Update: {
          area_id?: number
          id?: number
          name?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "planner_modules_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "planner_areas"
            referencedColumns: ["id"]
          },
        ]
      }
      planner_movements: {
        Row: {
          area_from_id: number | null
          area_to_id: number | null
          created_at: string
          created_by: string | null
          id: number
          lot_id: number | null
          notes: string | null
          plants: number
          trays: number
          type: string
          week: number
          year: number
        }
        Insert: {
          area_from_id?: number | null
          area_to_id?: number | null
          created_at?: string
          created_by?: string | null
          id?: number
          lot_id?: number | null
          notes?: string | null
          plants?: number
          trays?: number
          type: string
          week: number
          year: number
        }
        Update: {
          area_from_id?: number | null
          area_to_id?: number | null
          created_at?: string
          created_by?: string | null
          id?: number
          lot_id?: number | null
          notes?: string | null
          plants?: number
          trays?: number
          type?: string
          week?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "planner_movements_area_from_id_fkey"
            columns: ["area_from_id"]
            isOneToOne: false
            referencedRelation: "planner_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planner_movements_area_to_id_fkey"
            columns: ["area_to_id"]
            isOneToOne: false
            referencedRelation: "planner_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planner_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planner_movements_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "planner_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      planner_occupancy_snapshot: {
        Row: {
          id: number
          location_id: number
          plants: number
          species_id: number | null
          species_name: string | null
          trays: number
          upload_id: string
        }
        Insert: {
          id?: number
          location_id: number
          plants?: number
          species_id?: number | null
          species_name?: string | null
          trays?: number
          upload_id: string
        }
        Update: {
          id?: number
          location_id?: number
          plants?: number
          species_id?: number | null
          species_name?: string | null
          trays?: number
          upload_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planner_occupancy_snapshot_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "planner_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planner_occupancy_snapshot_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "planner_species"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planner_occupancy_snapshot_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "planner_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      planner_parameters: {
        Row: {
          comment: string | null
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          comment?: string | null
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          comment?: string | null
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      planner_scenario_lot_pins: {
        Row: {
          created_at: string
          id: number
          location_id: number
          scenario_id: number
          scenario_lot_id: number
          stage: string
        }
        Insert: {
          created_at?: string
          id?: number
          location_id: number
          scenario_id: number
          scenario_lot_id: number
          stage: string
        }
        Update: {
          created_at?: string
          id?: number
          location_id?: number
          scenario_id?: number
          scenario_lot_id?: number
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "planner_scenario_lot_pins_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "planner_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planner_scenario_lot_pins_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "planner_scenarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planner_scenario_lot_pins_scenario_lot_id_fkey"
            columns: ["scenario_lot_id"]
            isOneToOne: false
            referencedRelation: "planner_scenario_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      planner_scenario_lots: {
        Row: {
          end_week: number | null
          id: number
          lot_code: string
          maturation_area_id: number | null
          maturation_end_week: number | null
          maturation_start_week: number | null
          maturation_weeks: number
          plants: number
          predispatch_area_id: number | null
          predispatch_end_week: number | null
          predispatch_start_week: number | null
          predispatch_weeks: number
          rooting_area_id: number | null
          rooting_end_week: number | null
          rooting_start_week: number | null
          rooting_weeks: number
          scenario_id: number
          species_id: number
          start_week: number
          status: string
          tray_format: number | null
          trays: number | null
          variety_id: number | null
          year: number
        }
        Insert: {
          end_week?: number | null
          id?: number
          lot_code: string
          maturation_area_id?: number | null
          maturation_end_week?: number | null
          maturation_start_week?: number | null
          maturation_weeks?: number
          plants: number
          predispatch_area_id?: number | null
          predispatch_end_week?: number | null
          predispatch_start_week?: number | null
          predispatch_weeks?: number
          rooting_area_id?: number | null
          rooting_end_week?: number | null
          rooting_start_week?: number | null
          rooting_weeks?: number
          scenario_id: number
          species_id: number
          start_week: number
          status?: string
          tray_format?: number | null
          trays?: number | null
          variety_id?: number | null
          year: number
        }
        Update: {
          end_week?: number | null
          id?: number
          lot_code?: string
          maturation_area_id?: number | null
          maturation_end_week?: number | null
          maturation_start_week?: number | null
          maturation_weeks?: number
          plants?: number
          predispatch_area_id?: number | null
          predispatch_end_week?: number | null
          predispatch_start_week?: number | null
          predispatch_weeks?: number
          rooting_area_id?: number | null
          rooting_end_week?: number | null
          rooting_start_week?: number | null
          rooting_weeks?: number
          scenario_id?: number
          species_id?: number
          start_week?: number
          status?: string
          tray_format?: number | null
          trays?: number | null
          variety_id?: number | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "planner_scenario_lots_maturation_area_id_fkey"
            columns: ["maturation_area_id"]
            isOneToOne: false
            referencedRelation: "planner_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planner_scenario_lots_predispatch_area_id_fkey"
            columns: ["predispatch_area_id"]
            isOneToOne: false
            referencedRelation: "planner_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planner_scenario_lots_rooting_area_id_fkey"
            columns: ["rooting_area_id"]
            isOneToOne: false
            referencedRelation: "planner_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planner_scenario_lots_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "planner_scenarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planner_scenario_lots_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "planner_species"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planner_scenario_lots_variety_id_fkey"
            columns: ["variety_id"]
            isOneToOne: false
            referencedRelation: "planner_varieties"
            referencedColumns: ["id"]
          },
        ]
      }
      planner_scenarios: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: number
          is_simulation: boolean
          is_working: boolean
          name: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: number
          is_simulation?: boolean
          is_working?: boolean
          name: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: number
          is_simulation?: boolean
          is_working?: boolean
          name?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "planner_scenarios_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      planner_species: {
        Row: {
          active: boolean
          code: string | null
          color: string | null
          family: string | null
          id: number
          master_species_id: string | null
          maturation_area_id: number | null
          maturation_weeks: number
          name: string
          predispatch_area_id: number | null
          predispatch_weeks: number
          priority: number
          rooting_area_id: number | null
          rooting_weeks: number
          tray_format: number
        }
        Insert: {
          active?: boolean
          code?: string | null
          color?: string | null
          family?: string | null
          id?: number
          master_species_id?: string | null
          maturation_area_id?: number | null
          maturation_weeks?: number
          name: string
          predispatch_area_id?: number | null
          predispatch_weeks?: number
          priority?: number
          rooting_area_id?: number | null
          rooting_weeks?: number
          tray_format?: number
        }
        Update: {
          active?: boolean
          code?: string | null
          color?: string | null
          family?: string | null
          id?: number
          master_species_id?: string | null
          maturation_area_id?: number | null
          maturation_weeks?: number
          name?: string
          predispatch_area_id?: number | null
          predispatch_weeks?: number
          priority?: number
          rooting_area_id?: number | null
          rooting_weeks?: number
          tray_format?: number
        }
        Relationships: [
          {
            foreignKeyName: "planner_species_maturation_area_id_fkey"
            columns: ["maturation_area_id"]
            isOneToOne: false
            referencedRelation: "planner_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planner_species_predispatch_area_id_fkey"
            columns: ["predispatch_area_id"]
            isOneToOne: false
            referencedRelation: "planner_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planner_species_rooting_area_id_fkey"
            columns: ["rooting_area_id"]
            isOneToOne: false
            referencedRelation: "planner_areas"
            referencedColumns: ["id"]
          },
        ]
      }
      planner_uploads: {
        Row: {
          created_at: string
          file_name: string
          id: string
          kind: string
          stats: Json
          status: string
          uploaded_by: string | null
          warnings: Json
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          kind: string
          stats?: Json
          status?: string
          uploaded_by?: string | null
          warnings?: Json
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          kind?: string
          stats?: Json
          status?: string
          uploaded_by?: string | null
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "planner_uploads_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      planner_varieties: {
        Row: {
          code: string | null
          id: number
          master_variety_id: string | null
          name: string
          species_id: number
        }
        Insert: {
          code?: string | null
          id?: number
          master_variety_id?: string | null
          name: string
          species_id: number
        }
        Update: {
          code?: string | null
          id?: number
          master_variety_id?: string | null
          name?: string
          species_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "planner_varieties_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "planner_species"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planner_varieties_master_variety_id_fkey"
            columns: ["master_variety_id"]
            isOneToOne: false
            referencedRelation: "varieties"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_module_requests: {
        Row: {
          created_at: string
          description: string
          id: number
          name: string
          requested_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: number
          name: string
          requested_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: number
          name?: string
          requested_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_module_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      royalty_obligations: {
        Row: {
          amount: number
          contract_item_id: string | null
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          deleted_at: string | null
          delivery_id: string | null
          genetic_program_id: string | null
          id: string
          paid_at: string | null
          qty_plants: number
          status: Database["public"]["Enums"]["royalty_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          contract_item_id?: string | null
          created_at?: string
          created_by?: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          deleted_at?: string | null
          delivery_id?: string | null
          genetic_program_id?: string | null
          id?: string
          paid_at?: string | null
          qty_plants: number
          status?: Database["public"]["Enums"]["royalty_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          contract_item_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          deleted_at?: string | null
          delivery_id?: string | null
          genetic_program_id?: string | null
          id?: string
          paid_at?: string | null
          qty_plants?: number
          status?: Database["public"]["Enums"]["royalty_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "royalty_obligations_contract_item_id_fkey"
            columns: ["contract_item_id"]
            isOneToOne: false
            referencedRelation: "contract_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "royalty_obligations_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "royalty_obligations_genetic_program_id_fkey"
            columns: ["genetic_program_id"]
            isOneToOne: false
            referencedRelation: "genetic_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      share_access_log: {
        Row: {
          country: string | null
          id: string
          ip: string | null
          opened_at: string
          share_id: string
          user_agent: string | null
        }
        Insert: {
          country?: string | null
          id?: string
          ip?: string | null
          opened_at?: string
          share_id: string
          user_agent?: string | null
        }
        Update: {
          country?: string | null
          id?: string
          ip?: string | null
          opened_at?: string
          share_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "share_access_log_share_id_fkey"
            columns: ["share_id"]
            isOneToOne: false
            referencedRelation: "shares"
            referencedColumns: ["id"]
          },
        ]
      }
      shares: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          entity_id: string | null
          expires_at: string | null
          filter_json: Json | null
          id: string
          password_hash: string | null
          permissions: Database["public"]["Enums"]["share_permission"]
          scope: Database["public"]["Enums"]["share_scope"]
          title: string | null
          token: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          entity_id?: string | null
          expires_at?: string | null
          filter_json?: Json | null
          id?: string
          password_hash?: string | null
          permissions?: Database["public"]["Enums"]["share_permission"]
          scope: Database["public"]["Enums"]["share_scope"]
          title?: string | null
          token?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          entity_id?: string | null
          expires_at?: string | null
          filter_json?: Json | null
          id?: string
          password_hash?: string | null
          permissions?: Database["public"]["Enums"]["share_permission"]
          scope?: Database["public"]["Enums"]["share_scope"]
          title?: string | null
          token?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      species: {
        Row: {
          code: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          icon: string | null
          id: string
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          icon?: string | null
          id?: string
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          icon?: string | null
          id?: string
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      user_client_assignments: {
        Row: {
          assigned_at: string
          client_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          assigned_at?: string
          client_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          assigned_at?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_client_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_client_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      varieties: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          genetic_program_id: string | null
          id: string
          is_active: boolean
          name: string
          royalty_per_plant: number | null
          species_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          genetic_program_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          royalty_per_plant?: number | null
          species_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          genetic_program_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          royalty_per_plant?: number | null
          species_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "varieties_genetic_program_id_fkey"
            columns: ["genetic_program_id"]
            isOneToOne: false
            referencedRelation: "genetic_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "varieties_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      calendar_events: {
        Row: {
          client_id: string | null
          contract_condition: string | null
          contract_id: string | null
          contract_status: string | null
          organization_id: string | null
          owner_id: string | null
          probability_pct: number | null
          qty: number | null
          source_id: string | null
          source_type: string | null
          status: string | null
          variety_id: string | null
          week: number | null
          year: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _mcp_contract_status_match: {
        Args: { p_filter: string; p_status: string }
        Returns: boolean
      }
      _mcp_require_active: {
        Args: { p_user_id: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      _mcp_require_signer: {
        Args: { p_user_id: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      _mcp_require_writer: {
        Args: { p_user_id: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      _require_admin: { Args: never; Returns: string }
      admin_create_user: {
        Args: {
          p_email: string
          p_full_name: string
          p_password: string
          p_role: Database["public"]["Enums"]["user_role"]
        }
        Returns: string
      }
      admin_delete_user: { Args: { p_id: string }; Returns: undefined }
      admin_list_organizations: { Args: never; Returns: Json }
      admin_list_users: {
        Args: never
        Returns: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          last_sign_in_at: string
          role: Database["public"]["Enums"]["user_role"]
        }[]
      }
      admin_update_organization_legal: {
        Args: {
          p_bank_account: string
          p_bank_name: string
          p_legal_domicile: string
          p_legal_name: string
          p_legal_representative_id: string
          p_legal_representative_name: string
          p_notice_email: string
          p_notice_name: string
          p_org_id: string
          p_signer_email: string
          p_tax_id: string
        }
        Returns: undefined
      }
      admin_update_user: {
        Args: {
          p_email: string
          p_full_name: string
          p_id: string
          p_is_active: boolean
          p_password?: string
          p_role: Database["public"]["Enums"]["user_role"]
        }
        Returns: undefined
      }
      create_client_share_link: {
        Args: { p_client_id: string; p_ttl_days?: number }
        Returns: {
          expires_at: string
          id: string
          token: string
        }[]
      }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      docusign_apply_event: {
        Args: {
          p_certificate_url?: string
          p_completed_at?: string
          p_declined_reason?: string
          p_envelope_id: string
          p_raw_event?: Json
          p_signed_pdf_url?: string
          p_status: string
        }
        Returns: string
      }
      docusign_record_sent: {
        Args: {
          p_contract_id: string
          p_document_hash: string
          p_envelope_id: string
          p_signer_email: string
          p_signer_name: string
        }
        Returns: string
      }
      docusign_set_signed_pdf: {
        Args: {
          p_certificate_url?: string
          p_envelope_id: string
          p_signed_pdf_url: string
        }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_builder: { Args: { uid: string }; Returns: boolean }
      is_finance: { Args: never; Returns: boolean }
      is_sales: { Args: never; Returns: boolean }
      list_client_share_links: { Args: { p_client_id?: string }; Returns: Json }
      mcp_add_contract_note: {
        Args: { p_body: string; p_contract_id: string; p_user_id: string }
        Returns: Json
      }
      mcp_clients_with_unpaid: {
        Args: { p_limit?: number; p_only_overdue?: boolean; p_user_id: string }
        Returns: Json
      }
      mcp_contract_for_signature: {
        Args: { p_contract_id: string; p_user_id: string }
        Returns: Json
      }
      mcp_contracts_overview: {
        Args: { p_status_filter?: string; p_user_id: string; p_year?: number }
        Returns: Json
      }
      mcp_create_client: {
        Args: {
          p_account_owner_id?: string
          p_country_id?: string
          p_giro?: string
          p_legal_name?: string
          p_name: string
          p_notes?: string
          p_region?: string
          p_tax_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      mcp_create_contract_draft: {
        Args: {
          p_client_id: string
          p_condition?: string
          p_currency: string
          p_doc_type?: string
          p_incoterm?: string
          p_items: Json
          p_notes?: string
          p_organization_id?: string
          p_sale_type?: string
          p_ship_to_client_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      mcp_create_opportunity: {
        Args: {
          p_client_id?: string
          p_client_name_raw?: string
          p_currency?: string
          p_estimated_value?: number
          p_expected_close_date?: string
          p_name: string
          p_notes?: string
          p_owner_id?: string
          p_stage_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      mcp_create_token: {
        Args: { p_name: string }
        Returns: {
          created_at: string
          id: string
          name: string
          plaintext: string
        }[]
      }
      mcp_deliveries_overview: {
        Args: {
          p_client_id?: string
          p_country_id?: string
          p_kam_id?: string
          p_month?: number
          p_only_pending?: boolean
          p_status_filter?: string
          p_user_id: string
          p_week_from?: number
          p_week_to?: number
          p_year: number
        }
        Returns: Json
      }
      mcp_docusign_record_sent: {
        Args: {
          p_contract_id: string
          p_document_hash: string
          p_envelope_id: string
          p_signer_email: string
          p_signer_name: string
          p_user_id: string
        }
        Returns: string
      }
      mcp_docusign_signature_status: {
        Args: { p_contract_id: string; p_user_id: string }
        Returns: Json
      }
      mcp_forecast_by_month: {
        Args: {
          p_country_id?: string
          p_from_month?: number
          p_include_opportunities?: boolean
          p_kam_id?: string
          p_organization_id?: string
          p_status_in?: string[]
          p_user_id: string
          p_year: number
        }
        Returns: Json
      }
      mcp_forecast_contracts_anticipos: {
        Args: {
          p_country_id?: string
          p_from_month?: number
          p_kam_id?: string
          p_organization_id?: string
          p_status_in?: string[]
          p_user_id: string
          p_year: number
        }
        Returns: Json
      }
      mcp_get_client: {
        Args: { p_client_id: string; p_user_id: string }
        Returns: Json
      }
      mcp_get_contract: {
        Args: { p_contract_id: string; p_user_id: string }
        Returns: Json
      }
      mcp_get_opportunity: {
        Args: { p_opportunity_id: string; p_user_id: string }
        Returns: Json
      }
      mcp_kam_summary: {
        Args: {
          p_kam_id: string
          p_status_filter?: string
          p_user_id: string
          p_year?: number
        }
        Returns: Json
      }
      mcp_list_clients: {
        Args: {
          p_country_id?: string
          p_kam_id?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_user_id: string
        }
        Returns: Json
      }
      mcp_list_contract_notes: {
        Args: { p_contract_id: string; p_limit?: number; p_user_id: string }
        Returns: Json
      }
      mcp_list_contracts: {
        Args: {
          p_client_id?: string
          p_doc_type?: string
          p_kam_id?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_status?: string
          p_user_id: string
          p_year?: number
        }
        Returns: Json
      }
      mcp_list_kams: {
        Args: { p_include_support?: boolean; p_user_id: string }
        Returns: Json
      }
      mcp_list_my_tokens: {
        Args: never
        Returns: {
          created_at: string
          id: string
          last_used_at: string
          name: string
          revoked_at: string
          scopes: string[]
        }[]
      }
      mcp_list_opportunities: {
        Args: {
          p_client_id?: string
          p_limit?: number
          p_offset?: number
          p_owner_id?: string
          p_stage_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      mcp_list_opportunity_stages: {
        Args: { p_user_id: string }
        Returns: Json
      }
      mcp_list_payments: {
        Args: {
          p_client_id?: string
          p_contract_id?: string
          p_limit?: number
          p_offset?: number
          p_status?: string
          p_user_id: string
        }
        Returns: Json
      }
      mcp_list_varieties: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_program_id?: string
          p_search?: string
          p_species_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      mcp_move_opportunity_stage: {
        Args: {
          p_opportunity_id: string
          p_stage_id: string
          p_user_id: string
        }
        Returns: Json
      }
      mcp_payments_overview: {
        Args: { p_status_filter?: string; p_user_id: string; p_year?: number }
        Returns: Json
      }
      mcp_pipeline_summary: {
        Args: { p_owner_id?: string; p_user_id: string; p_year?: number }
        Returns: Json
      }
      mcp_planner_alertas: { Args: { p_user_id: string }; Returns: Json }
      mcp_planner_lotes: {
        Args: { p_especie?: string; p_limit?: number; p_user_id: string }
        Returns: Json
      }
      mcp_planner_ocupacion: {
        Args: { p_semanas?: number; p_user_id: string }
        Returns: Json
      }
      mcp_planner_role_ok: { Args: { p_user_id: string }; Returns: boolean }
      mcp_register_payment: {
        Args: {
          p_amount: number
          p_contract_id: string
          p_currency: string
          p_due_date?: string
          p_iva?: number
          p_paid_at?: string
          p_reference?: string
          p_status?: string
          p_type: string
          p_user_id: string
        }
        Returns: Json
      }
      mcp_revoke_token: { Args: { p_token_id: string }; Returns: undefined }
      mcp_search: {
        Args: { p_limit?: number; p_query: string; p_user_id: string }
        Returns: Json
      }
      mcp_top_clients: {
        Args: {
          p_limit?: number
          p_metric?: string
          p_status?: string
          p_user_id: string
          p_year?: number
        }
        Returns: Json
      }
      mcp_top_countries: {
        Args: {
          p_limit?: number
          p_metric?: string
          p_status_filter?: string
          p_user_id: string
          p_year?: number
        }
        Returns: Json
      }
      mcp_top_kams: {
        Args: {
          p_limit?: number
          p_metric?: string
          p_status_filter?: string
          p_user_id: string
          p_year?: number
        }
        Returns: Json
      }
      mcp_top_varieties: {
        Args: {
          p_limit?: number
          p_metric?: string
          p_status_filter?: string
          p_user_id: string
          p_year?: number
        }
        Returns: Json
      }
      mcp_upcoming_payments: {
        Args: {
          p_days_ahead?: number
          p_include_overdue?: boolean
          p_limit?: number
          p_user_id: string
        }
        Returns: Json
      }
      mcp_update_client: {
        Args: {
          p_account_owner_id?: string
          p_client_id: string
          p_country_id?: string
          p_giro?: string
          p_is_active?: boolean
          p_legal_name?: string
          p_name?: string
          p_notes?: string
          p_region?: string
          p_tax_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      mcp_update_contract: {
        Args: {
          p_condition?: string
          p_contract_id: string
          p_doc_type?: string
          p_incoterm?: string
          p_kam_id?: string
          p_notes?: string
          p_sale_type?: string
          p_ship_to_client_id?: string
          p_signed_at?: string
          p_status?: string
          p_user_id: string
        }
        Returns: Json
      }
      mcp_update_opportunity: {
        Args: {
          p_currency?: string
          p_estimated_value?: number
          p_expected_close_date?: string
          p_lost_reason?: string
          p_name?: string
          p_notes?: string
          p_opportunity_id: string
          p_owner_id?: string
          p_probability_pct?: number
          p_stage_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      mcp_validate_token: {
        Args: { p_token: string }
        Returns: {
          email: string
          role: Database["public"]["Enums"]["user_role"]
          scopes: string[]
          user_id: string
        }[]
      }
      planner_apply_scenario_to_plan: {
        Args: { p_scenario_id: number }
        Returns: number
      }
      planner_copy_lots_to_scenario: {
        Args: { p_scenario_id: number }
        Returns: number
      }
      public_get_shared_client: { Args: { p_token: string }; Returns: Json }
      revoke_client_share_link: { Args: { p_id: string }; Returns: undefined }
      sales_can_write_client: {
        Args: { p_client_id: string }
        Returns: boolean
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      activity_type: "call" | "email" | "meeting" | "task" | "note"
      amendment_type: "withdraw" | "modify" | "add"
      commercial_doc_type: "contrato" | "orden_compra" | "venta_spot"
      condition_type: "venta" | "reposicion" | "muestra"
      contract_status:
        | "borrador"
        | "por_revisar"
        | "firmado"
        | "en_proceso"
        | "finalizado"
        | "cancelado"
      currency_code: "CLP" | "USD" | "EUR"
      delivery_status: "pendiente" | "en_proceso" | "finalizado" | "eliminado"
      material_type: "vitro" | "raiz_cubierta" | "otros"
      payment_status: "pendiente" | "pagado" | "vencido"
      payment_type: "anticipo_1" | "anticipo_2" | "saldo"
      royalty_status: "no_califica" | "pendiente" | "pagado"
      sale_type: "nacional" | "exportacion"
      share_permission: "view" | "comment" | "edit_suggested"
      share_scope: "cliente" | "contrato" | "calendario" | "mapa" | "dashboard"
      user_role:
        | "admin"
        | "sales"
        | "finance"
        | "viewer"
        | "sales_support"
        | "mcp_editor"
        | "produccion"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      activity_type: ["call", "email", "meeting", "task", "note"],
      amendment_type: ["withdraw", "modify", "add"],
      commercial_doc_type: ["contrato", "orden_compra", "venta_spot"],
      condition_type: ["venta", "reposicion", "muestra"],
      contract_status: [
        "borrador",
        "por_revisar",
        "firmado",
        "en_proceso",
        "finalizado",
        "cancelado",
      ],
      currency_code: ["CLP", "USD", "EUR"],
      delivery_status: ["pendiente", "en_proceso", "finalizado", "eliminado"],
      material_type: ["vitro", "raiz_cubierta", "otros"],
      payment_status: ["pendiente", "pagado", "vencido"],
      payment_type: ["anticipo_1", "anticipo_2", "saldo"],
      royalty_status: ["no_califica", "pendiente", "pagado"],
      sale_type: ["nacional", "exportacion"],
      share_permission: ["view", "comment", "edit_suggested"],
      share_scope: ["cliente", "contrato", "calendario", "mapa", "dashboard"],
      user_role: [
        "admin",
        "sales",
        "finance",
        "viewer",
        "sales_support",
        "mcp_editor",
        "produccion",
      ],
    },
  },
} as const
