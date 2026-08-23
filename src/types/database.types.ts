export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type WorkspaceRole = 'owner' | 'admin' | 'member';
export type DocumentSourceType = 'file' | 'url' | 'raw_text';
export type DocumentStatus = 'pending' | 'processing' | 'ready' | 'failed';
export type ConversationStatus = 'active' | 'escalated' | 'resolved' | 'closed';
export type MessageSenderType = 'user' | 'bot' | 'agent';
export type EscalationReason = 'user_requested' | 'unresolved_query' | 'negative_sentiment' | 'manual';
export type EscalationStatus = 'pending' | 'assigned' | 'resolved' | 'dismissed';

export interface Database {
  public: {
    Tables: {
      workspaces: {
        Row: {
          id: string;
          name: string;
          slug: string;
          public_widget_key: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          public_widget_key?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          public_widget_key?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      workspace_members: {
        Row: {
          id: string;
          workspace_id: string;
          user_id: string;
          role: WorkspaceRole;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          user_id: string;
          role?: WorkspaceRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          user_id?: string;
          role?: WorkspaceRole;
          created_at?: string;
          updated_at?: string;
        };
      };
      documents: {
        Row: {
          id: string;
          workspace_id: string;
          title: string;
          content: string;
          source_type: DocumentSourceType;
          source_url: string | null;
          file_path: string | null;
          file_size_bytes: number | null;
          mime_type: string | null;
          content_hash: string | null;
          status: DocumentStatus;
          error_message: string | null;
          metadata: Json;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          title: string;
          content: string;
          source_type: DocumentSourceType;
          source_url?: string | null;
          file_path?: string | null;
          file_size_bytes?: number | null;
          mime_type?: string | null;
          content_hash?: string | null;
          status?: DocumentStatus;
          error_message?: string | null;
          metadata?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          title?: string;
          content?: string;
          source_type?: DocumentSourceType;
          source_url?: string | null;
          file_path?: string | null;
          file_size_bytes?: number | null;
          mime_type?: string | null;
          content_hash?: string | null;
          status?: DocumentStatus;
          error_message?: string | null;
          metadata?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      document_chunks: {
        Row: {
          id: string;
          workspace_id: string;
          document_id: string;
          chunk_index: number;
          content: string;
          token_count: number;
          embedding: string; // vector representation in string format e.g. "[0.1, 0.2, ...]"
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          document_id: string;
          chunk_index: number;
          content: string;
          token_count: number;
          embedding: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          document_id?: string;
          chunk_index?: number;
          content?: string;
          token_count?: number;
          embedding?: string;
          metadata?: Json;
          created_at?: string;
        };
      };
      widget_settings: {
        Row: {
          id: string;
          workspace_id: string;
          brand_name: string;
          brand_color: string;
          welcome_message: string;
          logo_url: string | null;
          position: string;
          allowed_domains: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          brand_name?: string;
          brand_color?: string;
          welcome_message?: string;
          logo_url?: string | null;
          position?: string;
          allowed_domains?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          brand_name?: string;
          brand_color?: string;
          welcome_message?: string;
          logo_url?: string | null;
          position?: string;
          allowed_domains?: string[];
          created_at?: string;
          updated_at?: string;
        };
      };
      conversations: {
        Row: {
          id: string;
          workspace_id: string;
          visitor_id: string;
          customer_name: string | null;
          customer_email: string | null;
          status: ConversationStatus;
          last_message_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          visitor_id: string;
          customer_name?: string | null;
          customer_email?: string | null;
          status?: ConversationStatus;
          last_message_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          visitor_id?: string;
          customer_name?: string | null;
          customer_email?: string | null;
          status?: ConversationStatus;
          last_message_at?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      messages: {
        Row: {
          id: string;
          workspace_id: string;
          conversation_id: string;
          sender_type: MessageSenderType;
          sender_id: string | null;
          content: string;
          sources: Json;
          grounded: boolean;
          tokens_prompt: number | null;
          tokens_completion: number | null;
          latency_ms: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          conversation_id: string;
          sender_type: MessageSenderType;
          sender_id?: string | null;
          content: string;
          sources?: Json;
          grounded?: boolean;
          tokens_prompt?: number | null;
          tokens_completion?: number | null;
          latency_ms?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          conversation_id?: string;
          sender_type?: MessageSenderType;
          sender_id?: string | null;
          content?: string;
          sources?: Json;
          grounded?: boolean;
          tokens_prompt?: number | null;
          tokens_completion?: number | null;
          latency_ms?: number | null;
          created_at?: string;
        };
      };
      escalations: {
        Row: {
          id: string;
          workspace_id: string;
          conversation_id: string;
          reason: EscalationReason;
          status: EscalationStatus;
          assigned_to: string | null;
          customer_email: string | null;
          notes: string | null;
          resolved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          conversation_id: string;
          reason?: EscalationReason;
          status?: EscalationStatus;
          assigned_to?: string | null;
          customer_email?: string | null;
          notes?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          conversation_id?: string;
          reason?: EscalationReason;
          status?: EscalationStatus;
          assigned_to?: string | null;
          customer_email?: string | null;
          notes?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_user_workspace_ids: {
        Args: Record<PropertyKey, never>;
        Returns: string[];
      };
      is_workspace_member: {
        Args: {
          _workspace_id: string;
        };
        Returns: boolean;
      };
      has_workspace_role: {
        Args: {
          _workspace_id: string;
          _roles: WorkspaceRole[];
        };
        Returns: boolean;
      };
      create_workspace_for_user: {
        Args: {
          p_name: string;
          p_slug?: string | null;
        };
        Returns: {
          id: string;
          name: string;
          slug: string;
          public_widget_key: string;
          role: WorkspaceRole;
        }[];
      };
      generate_unique_workspace_slug: {
        Args: {
          p_name: string;
        };
        Returns: string;
      };
      get_public_widget_config: {
        Args: {
          p_public_widget_key: string;
        };
        Returns: {
          brand_name: string;
          brand_color: string;
          welcome_message: string;
          logo_url: string | null;
          position: string;
        }[];
      };
      create_or_get_widget_conversation: {
        Args: {
          p_public_widget_key: string;
          p_visitor_id: string;
        };
        Returns: {
          conversation_id: string;
          status: ConversationStatus;
          created_at: string;
        }[];
      };
      send_visitor_message: {
        Args: {
          p_public_widget_key: string;
          p_visitor_id: string;
          p_conversation_id: string;
          p_content: string;
        };
        Returns: {
          message_id: string;
          conversation_id: string;
          sender_type: MessageSenderType;
          content: string;
          created_at: string;
        }[];
      };
      get_conversation_messages: {
        Args: {
          p_public_widget_key: string;
          p_visitor_id: string;
          p_conversation_id: string;
        };
        Returns: {
          message_id: string;
          sender_type: MessageSenderType;
          content: string;
          created_at: string;
        }[];
      };
      search_workspace_knowledge: {
        Args: {
          p_public_widget_key: string;
          p_query: string;
          p_match_limit?: number;
        };
        Returns: {
          document_id: string;
          title: string;
          content: string;
        }[];
      };
    };
    Enums: {
      workspace_role: WorkspaceRole;
      document_source_type: DocumentSourceType;
      document_status: DocumentStatus;
      conversation_status: ConversationStatus;
      message_sender_type: MessageSenderType;
      escalation_reason: EscalationReason;
      escalation_status: EscalationStatus;
    };
  };
}
