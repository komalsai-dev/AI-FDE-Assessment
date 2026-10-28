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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      action_receipts: {
        Row: {
          action: string
          actor: string
          created_at: string
          payload: Json
          request_id: string
          result: Json
        }
        Insert: {
          action: string
          actor: string
          created_at?: string
          payload: Json
          request_id: string
          result: Json
        }
        Update: {
          action?: string
          actor?: string
          created_at?: string
          payload?: Json
          request_id?: string
          result?: Json
        }
        Relationships: []
      }
      alert_notes: {
        Row: {
          actor: string
          alert_id: string
          created_at: string
          note: string
          note_id: number
        }
        Insert: {
          actor: string
          alert_id: string
          created_at?: string
          note: string
          note_id?: number
        }
        Update: {
          actor?: string
          alert_id?: string
          created_at?: string
          note?: string
          note_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "alert_notes_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["alert_id"]
          },
        ]
      }
      alerts: {
        Row: {
          alert_id: string
          asset_id: string | null
          assigned_to: string | null
          created_at: string
          details: Json
          explanation: string
          issue_type: string
          related_entity_id: string
          related_entity_type: string
          resolved_at: string | null
          rule_id: string
          severity: string
          status: string
          updated_at: string
        }
        Insert: {
          alert_id: string
          asset_id?: string | null
          assigned_to?: string | null
          created_at?: string
          details?: Json
          explanation: string
          issue_type: string
          related_entity_id: string
          related_entity_type: string
          resolved_at?: string | null
          rule_id: string
          severity: string
          status?: string
          updated_at?: string
        }
        Update: {
          alert_id?: string
          asset_id?: string | null
          assigned_to?: string | null
          created_at?: string
          details?: Json
          explanation?: string
          issue_type?: string
          related_entity_id?: string
          related_entity_type?: string
          resolved_at?: string | null
          rule_id?: string
          severity?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "alerts_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "v_asset_status"
            referencedColumns: ["asset_id"]
          },
        ]
      }
      assets: {
        Row: {
          asset_id: string
          asset_name: string
          commissioned_on: string | null
          created_at: string
          instrument_type_id: string
          lifecycle_status: string
          location: string
          retired_at: string | null
          serial_number: string | null
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          asset_id: string
          asset_name: string
          commissioned_on?: string | null
          created_at?: string
          instrument_type_id: string
          lifecycle_status: string
          location: string
          retired_at?: string | null
          serial_number?: string | null
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          asset_id?: string
          asset_name?: string
          commissioned_on?: string | null
          created_at?: string
          instrument_type_id?: string
          lifecycle_status?: string
          location?: string
          retired_at?: string | null
          serial_number?: string | null
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_instrument_type_id_fkey"
            columns: ["instrument_type_id"]
            isOneToOne: false
            referencedRelation: "instrument_types"
            referencedColumns: ["instrument_type_id"]
          },
          {
            foreignKeyName: "assets_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["supplier_id"]
          },
        ]
      }
      audit_records: {
        Row: {
          action: string
          actor: string
          audit_id: number
          entity_id: string
          entity_type: string
          new_value: Json | null
          old_value: Json | null
          reason: string | null
          timestamp: string
        }
        Insert: {
          action: string
          actor: string
          audit_id?: number
          entity_id: string
          entity_type: string
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          timestamp?: string
        }
        Update: {
          action?: string
          actor?: string
          audit_id?: number
          entity_id?: string
          entity_type?: string
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          timestamp?: string
        }
        Relationships: []
      }
      calibration_events: {
        Row: {
          asset_id: string
          calibration_date: string | null
          calibration_id: string
          cancel_reason: string | null
          created_at: string
          event_status: string
          interval_days_used: number
          measured_value: number | null
          next_due_date: string | null
          plan_id: string
          reference_value: number | null
          result: string | null
          scheduled_date: string | null
          supplier_id: string | null
          tolerance_used: number
          updated_at: string
        }
        Insert: {
          asset_id: string
          calibration_date?: string | null
          calibration_id: string
          cancel_reason?: string | null
          created_at?: string
          event_status: string
          interval_days_used: number
          measured_value?: number | null
          next_due_date?: string | null
          plan_id: string
          reference_value?: number | null
          result?: string | null
          scheduled_date?: string | null
          supplier_id?: string | null
          tolerance_used: number
          updated_at?: string
        }
        Update: {
          asset_id?: string
          calibration_date?: string | null
          calibration_id?: string
          cancel_reason?: string | null
          created_at?: string
          event_status?: string
          interval_days_used?: number
          measured_value?: number | null
          next_due_date?: string | null
          plan_id?: string
          reference_value?: number | null
          result?: string | null
          scheduled_date?: string | null
          supplier_id?: string | null
          tolerance_used?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calibration_events_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "calibration_events_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "v_asset_status"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "calibration_events_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "calibration_plans"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "calibration_events_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["supplier_id"]
          },
        ]
      }
      calibration_plans: {
        Row: {
          created_at: string
          effective_from: string
          effective_to: string | null
          instrument_type_id: string
          interval_days: number
          plan_id: string
          prohibit_overdue_use: boolean
          requires_certificate: boolean
          status: string
          tolerance: number
          version: number
        }
        Insert: {
          created_at?: string
          effective_from: string
          effective_to?: string | null
          instrument_type_id: string
          interval_days: number
          plan_id: string
          prohibit_overdue_use?: boolean
          requires_certificate?: boolean
          status: string
          tolerance: number
          version: number
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          instrument_type_id?: string
          interval_days?: number
          plan_id?: string
          prohibit_overdue_use?: boolean
          requires_certificate?: boolean
          status?: string
          tolerance?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "calibration_plans_instrument_type_id_fkey"
            columns: ["instrument_type_id"]
            isOneToOne: false
            referencedRelation: "instrument_types"
            referencedColumns: ["instrument_type_id"]
          },
        ]
      }
      certificates: {
        Row: {
          asset_id: string
          calibration_id: string
          certificate_id: string
          certificate_status: string
          created_at: string
          document_reference: string | null
          expiry_date: string | null
          issue_date: string
        }
        Insert: {
          asset_id: string
          calibration_id: string
          certificate_id: string
          certificate_status: string
          created_at?: string
          document_reference?: string | null
          expiry_date?: string | null
          issue_date: string
        }
        Update: {
          asset_id?: string
          calibration_id?: string
          certificate_id?: string
          certificate_status?: string
          created_at?: string
          document_reference?: string | null
          expiry_date?: string | null
          issue_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificates_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "certificates_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "v_asset_status"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "certificates_calibration_id_fkey"
            columns: ["calibration_id"]
            isOneToOne: true
            referencedRelation: "calibration_events"
            referencedColumns: ["calibration_id"]
          },
          {
            foreignKeyName: "certificates_calibration_id_fkey"
            columns: ["calibration_id"]
            isOneToOne: true
            referencedRelation: "v_asset_status"
            referencedColumns: ["last_calibration_id"]
          },
          {
            foreignKeyName: "certificates_calibration_id_fkey"
            columns: ["calibration_id"]
            isOneToOne: true
            referencedRelation: "v_asset_status"
            referencedColumns: ["last_pass_calibration_id"]
          },
        ]
      }
      corrective_actions: {
        Row: {
          action_type: string
          alert_id: string | null
          approved_by: string | null
          asset_id: string
          assigned_to: string | null
          calibration_id: string | null
          completed_at: string | null
          corrective_action_id: string
          created_at: string
          due_at: string
          priority: string
          resolution_notes: string | null
          root_cause: string | null
          status: string
          updated_at: string
        }
        Insert: {
          action_type: string
          alert_id?: string | null
          approved_by?: string | null
          asset_id: string
          assigned_to?: string | null
          calibration_id?: string | null
          completed_at?: string | null
          corrective_action_id: string
          created_at?: string
          due_at: string
          priority: string
          resolution_notes?: string | null
          root_cause?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          alert_id?: string | null
          approved_by?: string | null
          asset_id?: string
          assigned_to?: string | null
          calibration_id?: string | null
          completed_at?: string | null
          corrective_action_id?: string
          created_at?: string
          due_at?: string
          priority?: string
          resolution_notes?: string | null
          root_cause?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "corrective_actions_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["alert_id"]
          },
          {
            foreignKeyName: "corrective_actions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "corrective_actions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "v_asset_status"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "corrective_actions_calibration_id_fkey"
            columns: ["calibration_id"]
            isOneToOne: false
            referencedRelation: "calibration_events"
            referencedColumns: ["calibration_id"]
          },
          {
            foreignKeyName: "corrective_actions_calibration_id_fkey"
            columns: ["calibration_id"]
            isOneToOne: false
            referencedRelation: "v_asset_status"
            referencedColumns: ["last_calibration_id"]
          },
          {
            foreignKeyName: "corrective_actions_calibration_id_fkey"
            columns: ["calibration_id"]
            isOneToOne: false
            referencedRelation: "v_asset_status"
            referencedColumns: ["last_pass_calibration_id"]
          },
        ]
      }
      downtime_events: {
        Row: {
          asset_id: string
          created_at: string
          downtime_id: string
          end_at: string
          reason: string
          start_at: string
          work_order_id: string | null
        }
        Insert: {
          asset_id: string
          created_at?: string
          downtime_id: string
          end_at: string
          reason: string
          start_at: string
          work_order_id?: string | null
        }
        Update: {
          asset_id?: string
          created_at?: string
          downtime_id?: string
          end_at?: string
          reason?: string
          start_at?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "downtime_events_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "downtime_events_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "v_asset_status"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "downtime_events_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["work_order_id"]
          },
        ]
      }
      evaluation_runs: {
        Row: {
          error: string | null
          finished_at: string | null
          ground_truth_version: string | null
          inputs: Json
          kind: string
          metrics: Json
          run_id: string
          started_at: string
          status: string
          summary: Json
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          ground_truth_version?: string | null
          inputs?: Json
          kind: string
          metrics?: Json
          run_id?: string
          started_at?: string
          status: string
          summary?: Json
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          ground_truth_version?: string | null
          inputs?: Json
          kind?: string
          metrics?: Json
          run_id?: string
          started_at?: string
          status?: string
          summary?: Json
        }
        Relationships: []
      }
      exception_records: {
        Row: {
          approval_status: string
          approved_by: string | null
          asset_id: string
          created_at: string
          exception_id: string
          exception_type: string
          reason: string
          scope: string
          updated_at: string
          valid_from: string
          valid_until: string
        }
        Insert: {
          approval_status: string
          approved_by?: string | null
          asset_id: string
          created_at?: string
          exception_id: string
          exception_type?: string
          reason: string
          scope?: string
          updated_at?: string
          valid_from: string
          valid_until: string
        }
        Update: {
          approval_status?: string
          approved_by?: string | null
          asset_id?: string
          created_at?: string
          exception_id?: string
          exception_type?: string
          reason?: string
          scope?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "exception_records_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "exception_records_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "v_asset_status"
            referencedColumns: ["asset_id"]
          },
        ]
      }
      generation_runs: {
        Row: {
          checksums: Json
          error: string | null
          finished_at: string | null
          generator_version: string
          progress: Json
          row_counts: Json
          run_id: string
          scale: string
          seed: number
          sim_end: string
          sim_start: string
          started_at: string
          status: string
        }
        Insert: {
          checksums?: Json
          error?: string | null
          finished_at?: string | null
          generator_version: string
          progress?: Json
          row_counts?: Json
          run_id?: string
          scale: string
          seed: number
          sim_end: string
          sim_start: string
          started_at?: string
          status: string
        }
        Update: {
          checksums?: Json
          error?: string | null
          finished_at?: string | null
          generator_version?: string
          progress?: Json
          row_counts?: Json
          run_id?: string
          scale?: string
          seed?: number
          sim_end?: string
          sim_start?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      generation_step_receipts: {
        Row: {
          created_at: string
          run_id: string
          step: string
        }
        Insert: {
          created_at?: string
          run_id: string
          step: string
        }
        Update: {
          created_at?: string
          run_id?: string
          step?: string
        }
        Relationships: [
          {
            foreignKeyName: "generation_step_receipts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "generation_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      ground_truth_cases: {
        Row: {
          case_id: string
          entity_id: string
          entity_type: string
          expected_decision: string | null
          expected_violation: boolean
          generation_run_id: string | null
          issue_type: string
          rule_id: string
          severity: string
        }
        Insert: {
          case_id: string
          entity_id: string
          entity_type: string
          expected_decision?: string | null
          expected_violation: boolean
          generation_run_id?: string | null
          issue_type: string
          rule_id: string
          severity: string
        }
        Update: {
          case_id?: string
          entity_id?: string
          entity_type?: string
          expected_decision?: string | null
          expected_violation?: boolean
          generation_run_id?: string | null
          issue_type?: string
          rule_id?: string
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "ground_truth_cases_generation_run_id_fkey"
            columns: ["generation_run_id"]
            isOneToOne: false
            referencedRelation: "generation_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      id_counters: {
        Row: {
          prefix: string
          value: number
        }
        Insert: {
          prefix: string
          value?: number
        }
        Update: {
          prefix?: string
          value?: number
        }
        Relationships: []
      }
      impact_assessments: {
        Row: {
          affected_use_count: number
          assessed_by: string | null
          assessment_end: string
          assessment_id: string
          assessment_start: string
          asset_id: string
          calibration_id: string
          completed_at: string | null
          conclusion: string | null
          created_at: string
          findings: string | null
          status: string
          updated_at: string
        }
        Insert: {
          affected_use_count?: number
          assessed_by?: string | null
          assessment_end: string
          assessment_id: string
          assessment_start: string
          asset_id: string
          calibration_id: string
          completed_at?: string | null
          conclusion?: string | null
          created_at?: string
          findings?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          affected_use_count?: number
          assessed_by?: string | null
          assessment_end?: string
          assessment_id?: string
          assessment_start?: string
          asset_id?: string
          calibration_id?: string
          completed_at?: string | null
          conclusion?: string | null
          created_at?: string
          findings?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "impact_assessments_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "impact_assessments_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "v_asset_status"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "impact_assessments_calibration_id_fkey"
            columns: ["calibration_id"]
            isOneToOne: true
            referencedRelation: "calibration_events"
            referencedColumns: ["calibration_id"]
          },
          {
            foreignKeyName: "impact_assessments_calibration_id_fkey"
            columns: ["calibration_id"]
            isOneToOne: true
            referencedRelation: "v_asset_status"
            referencedColumns: ["last_calibration_id"]
          },
          {
            foreignKeyName: "impact_assessments_calibration_id_fkey"
            columns: ["calibration_id"]
            isOneToOne: true
            referencedRelation: "v_asset_status"
            referencedColumns: ["last_pass_calibration_id"]
          },
        ]
      }
      instrument_types: {
        Row: {
          created_at: string
          default_tolerance: number
          description: string | null
          instrument_type_id: string
          measurement_unit: string
          type_name: string
        }
        Insert: {
          created_at?: string
          default_tolerance: number
          description?: string | null
          instrument_type_id: string
          measurement_unit: string
          type_name: string
        }
        Update: {
          created_at?: string
          default_tolerance?: number
          description?: string | null
          instrument_type_id?: string
          measurement_unit?: string
          type_name?: string
        }
        Relationships: []
      }
      production_use: {
        Row: {
          asset_id: string
          calibration_id: string | null
          created_at: string
          decision: string
          exception_id: string | null
          operation_id: string | null
          production_line: string
          reason_code: string | null
          rule_id: string | null
          use_id: string
          used_at: string
        }
        Insert: {
          asset_id: string
          calibration_id?: string | null
          created_at?: string
          decision: string
          exception_id?: string | null
          operation_id?: string | null
          production_line: string
          reason_code?: string | null
          rule_id?: string | null
          use_id: string
          used_at: string
        }
        Update: {
          asset_id?: string
          calibration_id?: string | null
          created_at?: string
          decision?: string
          exception_id?: string | null
          operation_id?: string | null
          production_line?: string
          reason_code?: string | null
          rule_id?: string | null
          use_id?: string
          used_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_use_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "production_use_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "v_asset_status"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "production_use_calibration_id_fkey"
            columns: ["calibration_id"]
            isOneToOne: false
            referencedRelation: "calibration_events"
            referencedColumns: ["calibration_id"]
          },
          {
            foreignKeyName: "production_use_calibration_id_fkey"
            columns: ["calibration_id"]
            isOneToOne: false
            referencedRelation: "v_asset_status"
            referencedColumns: ["last_calibration_id"]
          },
          {
            foreignKeyName: "production_use_calibration_id_fkey"
            columns: ["calibration_id"]
            isOneToOne: false
            referencedRelation: "v_asset_status"
            referencedColumns: ["last_pass_calibration_id"]
          },
          {
            foreignKeyName: "production_use_exception_id_fkey"
            columns: ["exception_id"]
            isOneToOne: false
            referencedRelation: "exception_records"
            referencedColumns: ["exception_id"]
          },
        ]
      }
      settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string
          value: Json
          version: number
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string
          value: Json
          version?: number
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string
          value?: Json
          version?: number
        }
        Relationships: []
      }
      settings_history: {
        Row: {
          actor: string
          changed_at: string
          id: number
          key: string
          new_value: Json
          old_value: Json | null
          reason: string | null
          version: number
        }
        Insert: {
          actor: string
          changed_at?: string
          id?: number
          key: string
          new_value: Json
          old_value?: Json | null
          reason?: string | null
          version: number
        }
        Update: {
          actor?: string
          changed_at?: string
          id?: number
          key?: string
          new_value?: Json
          old_value?: Json | null
          reason?: string | null
          version?: number
        }
        Relationships: []
      }
      state_history: {
        Row: {
          actor: string
          changed_at: string
          entity_id: string
          entity_type: string
          id: number
          new_state: string
          previous_state: string | null
          reason: string | null
          related: Json | null
        }
        Insert: {
          actor: string
          changed_at?: string
          entity_id: string
          entity_type: string
          id?: number
          new_state: string
          previous_state?: string | null
          reason?: string | null
          related?: Json | null
        }
        Update: {
          actor?: string
          changed_at?: string
          entity_id?: string
          entity_type?: string
          id?: number
          new_state?: string
          previous_state?: string | null
          reason?: string | null
          related?: Json | null
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          approval_status: string
          created_at: string
          supplier_id: string
          supplier_name: string
          updated_at: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          approval_status: string
          created_at?: string
          supplier_id: string
          supplier_name: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          approval_status?: string
          created_at?: string
          supplier_id?: string
          supplier_name?: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: []
      }
      use_attempts: {
        Row: {
          actor: string
          asset_id: string
          attempt_id: string
          created_at: string
          decision: string
          evaluation: Json
          explanation: string
          operation_id: string | null
          production_line: string
          reason_code: string
          requested_at: string
          resulting_use_id: string | null
          rule_id: string
        }
        Insert: {
          actor: string
          asset_id: string
          attempt_id: string
          created_at?: string
          decision: string
          evaluation: Json
          explanation: string
          operation_id?: string | null
          production_line: string
          reason_code: string
          requested_at: string
          resulting_use_id?: string | null
          rule_id: string
        }
        Update: {
          actor?: string
          asset_id?: string
          attempt_id?: string
          created_at?: string
          decision?: string
          evaluation?: Json
          explanation?: string
          operation_id?: string | null
          production_line?: string
          reason_code?: string
          requested_at?: string
          resulting_use_id?: string | null
          rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "use_attempts_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "use_attempts_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "v_asset_status"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "use_attempts_resulting_use_id_fkey"
            columns: ["resulting_use_id"]
            isOneToOne: false
            referencedRelation: "production_use"
            referencedColumns: ["use_id"]
          },
        ]
      }
      work_orders: {
        Row: {
          asset_id: string
          assigned_to: string | null
          calibration_id: string | null
          cancel_reason: string | null
          completed_at: string | null
          created_at: string
          downtime_hours: number
          due_at: string
          priority: string
          started_at: string | null
          status: string
          updated_at: string
          work_order_id: string
          work_order_type: string
        }
        Insert: {
          asset_id: string
          assigned_to?: string | null
          calibration_id?: string | null
          cancel_reason?: string | null
          completed_at?: string | null
          created_at?: string
          downtime_hours?: number
          due_at: string
          priority: string
          started_at?: string | null
          status: string
          updated_at?: string
          work_order_id: string
          work_order_type: string
        }
        Update: {
          asset_id?: string
          assigned_to?: string | null
          calibration_id?: string | null
          cancel_reason?: string | null
          completed_at?: string | null
          created_at?: string
          downtime_hours?: number
          due_at?: string
          priority?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          work_order_id?: string
          work_order_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "work_orders_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "v_asset_status"
            referencedColumns: ["asset_id"]
          },
          {
            foreignKeyName: "work_orders_calibration_id_fkey"
            columns: ["calibration_id"]
            isOneToOne: false
            referencedRelation: "calibration_events"
            referencedColumns: ["calibration_id"]
          },
          {
            foreignKeyName: "work_orders_calibration_id_fkey"
            columns: ["calibration_id"]
            isOneToOne: false
            referencedRelation: "v_asset_status"
            referencedColumns: ["last_calibration_id"]
          },
          {
            foreignKeyName: "work_orders_calibration_id_fkey"
            columns: ["calibration_id"]
            isOneToOne: false
            referencedRelation: "v_asset_status"
            referencedColumns: ["last_pass_calibration_id"]
          },
        ]
      }
    }
    Views: {
      v_asset_status: {
        Row: {
          asset_id: string | null
          asset_name: string | null
          calc_status: string | null
          created_at: string | null
          days_past_due: number | null
          expected_due_date: string | null
          instrument_type_id: string | null
          last_calibration_date: string | null
          last_calibration_id: string | null
          last_pass_calibration_id: string | null
          last_pass_date: string | null
          last_result: string | null
          lifecycle_status: string | null
          location: string | null
          serial_number: string | null
          stored_due_date: string | null
          supplier_id: string | null
          type_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_instrument_type_id_fkey"
            columns: ["instrument_type_id"]
            isOneToOne: false
            referencedRelation: "instrument_types"
            referencedColumns: ["instrument_type_id"]
          },
          {
            foreignKeyName: "assets_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["supplier_id"]
          },
        ]
      }
    }
    Functions: {
      append_generation_history: {
        Args: { p_audit: Json; p_run_id: string; p_state: Json }
        Returns: undefined
      }
      apply_ops: { Args: { ops: Json }; Returns: Json }
      calibra_reset: { Args: never; Returns: undefined }
      next_ids: {
        Args: { p_count?: number; p_prefix: string }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
