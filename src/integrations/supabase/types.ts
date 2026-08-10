export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      audit_log: {
        Row: {
          action_id: string | null;
          actor_id: string | null;
          created_at: string;
          id: number;
          new_data: Json | null;
          old_data: Json | null;
          operation: string;
          record_id: string | null;
          table_name: string;
        };
        Insert: {
          action_id?: string | null;
          actor_id?: string | null;
          created_at?: string;
          id?: number;
          new_data?: Json | null;
          old_data?: Json | null;
          operation: string;
          record_id?: string | null;
          table_name: string;
        };
        Update: {
          action_id?: string | null;
          actor_id?: string | null;
          created_at?: string;
          id?: number;
          new_data?: Json | null;
          old_data?: Json | null;
          operation?: string;
          record_id?: string | null;
          table_name?: string;
        };
        Relationships: [];
      };
      item_categories: {
        Row: {
          created_at: string;
          fixed_purity: number | null;
          fixed_weight: number | null;
          id: string;
          is_active: boolean;
          name_ar: string;
          scope: Database["public"]["Enums"]["merchant_type"];
          sort_order: number;
          tracks_count: boolean;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          fixed_purity?: number | null;
          fixed_weight?: number | null;
          id?: string;
          is_active?: boolean;
          name_ar: string;
          scope: Database["public"]["Enums"]["merchant_type"];
          sort_order?: number;
          tracks_count?: boolean;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          fixed_purity?: number | null;
          fixed_weight?: number | null;
          id?: string;
          is_active?: boolean;
          name_ar?: string;
          scope?: Database["public"]["Enums"]["merchant_type"];
          sort_order?: number;
          tracks_count?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      merchants: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          is_active: boolean;
          merchant_type: Database["public"]["Enums"]["merchant_type"];
          name: string;
          notes: string | null;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          merchant_type: Database["public"]["Enums"]["merchant_type"];
          name: string;
          notes?: string | null;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          merchant_type?: Database["public"]["Enums"]["merchant_type"];
          name?: string;
          notes?: string | null;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          full_name: string;
          id: string;
          is_active: boolean;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          full_name?: string;
          id: string;
          is_active?: boolean;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          full_name?: string;
          id?: string;
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      transaction_lines: {
        Row: {
          cash_amount: number;
          cash_delta: number;
          category_id: string | null;
          created_at: string;
          gold_delta: number;
          gold_price_per_gram: number | null;
          id: string;
          is_return: boolean;
          kind: Database["public"]["Enums"]["txn_kind"];
          label: string;
          method: Database["public"]["Enums"]["pay_method"] | null;
          pieces: number | null;
          purity: number;
          rate_per_gram: number;
          sort_order: number;
          transaction_id: string;
          updated_at: string;
          weight: number;
          weight_21: number;
        };
        Insert: {
          cash_amount?: number;
          cash_delta?: number;
          category_id?: string | null;
          created_at?: string;
          gold_delta?: number;
          gold_price_per_gram?: number | null;
          id?: string;
          is_return?: boolean;
          kind: Database["public"]["Enums"]["txn_kind"];
          label?: string;
          method?: Database["public"]["Enums"]["pay_method"] | null;
          pieces?: number | null;
          purity?: number;
          rate_per_gram?: number;
          sort_order?: number;
          transaction_id: string;
          updated_at?: string;
          weight?: number;
          weight_21?: number;
        };
        Update: {
          cash_amount?: number;
          cash_delta?: number;
          category_id?: string | null;
          created_at?: string;
          gold_delta?: number;
          gold_price_per_gram?: number | null;
          id?: string;
          is_return?: boolean;
          kind?: Database["public"]["Enums"]["txn_kind"];
          label?: string;
          method?: Database["public"]["Enums"]["pay_method"] | null;
          pieces?: number | null;
          purity?: number;
          rate_per_gram?: number;
          sort_order?: number;
          transaction_id?: string;
          updated_at?: string;
          weight?: number;
          weight_21?: number;
        };
        Relationships: [
          {
            foreignKeyName: "transaction_lines_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "item_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transaction_lines_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      transactions: {
        Row: {
          counterparty_merchant_id: string | null;
          created_at: string;
          created_by: string | null;
          gold_price_used: number | null;
          id: string;
          is_account_settlement: boolean;
          kind: Database["public"]["Enums"]["txn_kind"];
          merchant_id: string;
          notes: string | null;
          status: Database["public"]["Enums"]["txn_status"];
          total_cash: number;
          total_gold_21: number;
          txn_date: string;
          updated_at: string;
          updated_by: string | null;
          void_reason: string | null;
          voided_at: string | null;
          voided_by: string | null;
        };
        Insert: {
          counterparty_merchant_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          gold_price_used?: number | null;
          id?: string;
          is_account_settlement?: boolean;
          kind: Database["public"]["Enums"]["txn_kind"];
          merchant_id: string;
          notes?: string | null;
          status?: Database["public"]["Enums"]["txn_status"];
          total_cash?: number;
          total_gold_21?: number;
          txn_date?: string;
          updated_at?: string;
          updated_by?: string | null;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Update: {
          counterparty_merchant_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          gold_price_used?: number | null;
          id?: string;
          is_account_settlement?: boolean;
          kind?: Database["public"]["Enums"]["txn_kind"];
          merchant_id?: string;
          notes?: string | null;
          status?: Database["public"]["Enums"]["txn_status"];
          total_cash?: number;
          total_gold_21?: number;
          txn_date?: string;
          updated_at?: string;
          updated_by?: string | null;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_counterparty_merchant_id_fkey";
            columns: ["counterparty_merchant_id"];
            isOneToOne: false;
            referencedRelation: "merchants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_merchant_id_fkey";
            columns: ["merchant_id"];
            isOneToOne: false;
            referencedRelation: "merchants";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      merchant_balances: {
        Args: never;
        Returns: {
          cash: number;
          gold_21: number;
          last_txn_date: string;
          merchant_id: string;
          merchant_type: Database["public"]["Enums"]["merchant_type"];
          name: string;
          phone: string;
        }[];
      };
      merchant_directory: {
        Args: {
          _search?: string | null;
          _sort?: string | null;
          _type?: Database["public"]["Enums"]["merchant_type"] | null;
        };
        Returns: {
          cash: number;
          gold_21: number;
          last_txn_date: string | null;
          merchant_id: string;
          merchant_type: Database["public"]["Enums"]["merchant_type"];
          name: string;
          phone: string | null;
        }[];
      };
      merchant_balance_summary: {
        Args: Record<PropertyKey, never>;
        Returns: {
          cash_credit: number;
          cash_owed: number;
          gold_credit: number;
          gold_owed: number;
        }[];
      };
      merchant_activity_totals: {
        Args: { _from?: string; _merchant_id: string; _to?: string };
        Returns: { cash: number; gold: number }[];
      };
      merchant_statement_balances: {
        Args: { _from?: string; _merchant_id: string; _to?: string };
        Returns: {
          closing_cash: number;
          closing_gold: number;
          opening_cash: number;
          opening_gold: number;
          period_cash: number;
          period_gold: number;
        }[];
      };
      merchant_purity_breakdown: {
        Args: { _merchant_id: string };
        Returns: {
          gold_weight: number;
          purity: number;
        }[];
      };
      merchant_statement: {
        Args: { _from?: string; _merchant_id: string; _to?: string };
        Returns: {
          cash_delta: number;
          counterparty_name: string | null;
          created_at: string;
          gold_delta: number;
          kind: Database["public"]["Enums"]["txn_kind"];
          line_kinds: Database["public"]["Enums"]["txn_kind"][];
          has_returns: boolean;
          is_account_settlement: boolean;
          notes: string | null;
          opening_cash: number;
          opening_gold: number;
          running_cash: number;
          running_gold: number;
          status: Database["public"]["Enums"]["txn_status"];
          transaction_id: string;
          txn_date: string;
        }[];
      };
      save_transaction: {
        Args: { _payload: Json; _transaction_id: string | null };
        Returns: string;
      };
      merchant_statement_summary: {
        Args: { _from?: string; _merchant_id: string; _to?: string };
        Returns: {
          total_bullion_received_21: number;
          total_cash_paid: number;
          total_cash_received: number;
          total_jewelry_received_21: number;
          total_scrap_paid_21: number;
        }[];
      };
      settle_merchant_account: {
        Args: { _merchant_id: string; _reason: string };
        Returns: string;
      };
      visible_audit_log: {
        Args: {
          _from?: string | null;
          _operation?: string | null;
          _table_name?: string | null;
          _to?: string | null;
        };
        Returns: Database["public"]["Tables"]["audit_log"]["Row"][];
      };
      visible_audit_activity: {
        Args: {
          _actor_id?: string | null;
          _from?: string | null;
          _operation?: string | null;
          _table_name?: string | null;
          _to?: string | null;
        };
        Returns: {
          action_id: string | null;
          activity_key: string;
          actor_id: string | null;
          created_at: string;
          events: Json;
          operations: string[];
          table_names: string[];
        }[];
      };
      void_transaction: {
        Args: { _reason: string; _transaction_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      app_role: "admin" | "user";
      merchant_type: "jewelry" | "raw";
      pay_method:
        | "cash"
        | "cash_received"
        | "scrap_21"
        | "scrap_18"
        | "bar_cashback"
        | "bar_other_purity"
        | "bandaqi"
        | "wage_to_gold"
        | "transfer";
      txn_kind: "inbound" | "settlement" | "purchase" | "sale" | "transfer" | "mixed";
      txn_status: "posted" | "voided";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      merchant_type: ["jewelry", "raw"],
      pay_method: [
        "cash",
        "scrap_21",
        "scrap_18",
        "bar_cashback",
        "bar_other_purity",
        "bandaqi",
        "wage_to_gold",
        "transfer",
      ],
      txn_kind: ["inbound", "settlement", "purchase", "sale", "transfer"],
    },
  },
} as const;
