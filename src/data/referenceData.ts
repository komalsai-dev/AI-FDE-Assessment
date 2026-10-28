/** Synthetic reference data. No confidential operational data is used. */
export const INSTRUMENT_TYPES = [
  { id: "PRS", name: "Pressure Gauge", unit: "bar", tol: 0.5, nominal: 10, interval: [180, 120] as const, cert: true, prohibit: true, description: "Bourdon/digital pressure gauges" },
  { id: "TMP", name: "Temperature Sensor", unit: "°C", tol: 0.3, nominal: 100, interval: [365, 365] as const, cert: true, prohibit: true, description: "RTD and thermocouple probes" },
  { id: "WGT", name: "Weighing Scale", unit: "kg", tol: 0.05, nominal: 20, interval: [90, 90] as const, cert: true, prohibit: true, description: "Platform and bench scales" },
  { id: "FLW", name: "Flow Meter", unit: "m³/h", tol: 1.0, nominal: 50, interval: [180, 180] as const, cert: true, prohibit: true, description: "Electromagnetic & Coriolis meters" },
  { id: "PHM", name: "pH Meter", unit: "pH", tol: 0.05, nominal: 7, interval: [90, 60] as const, cert: true, prohibit: true, description: "Inline and bench pH meters" },
  { id: "TRQ", name: "Torque Wrench", unit: "N·m", tol: 0.2, nominal: 25, interval: [365, 365] as const, cert: true, prohibit: true, description: "Click-type and digital torque tools" },
  { id: "CND", name: "Conductivity Meter", unit: "µS/cm", tol: 2.0, nominal: 1413, interval: [180, 180] as const, cert: true, prohibit: true, description: "Process conductivity cells" },
  { id: "HUM", name: "Humidity Sensor", unit: "%RH", tol: 1.5, nominal: 50, interval: [365, 365] as const, cert: false, prohibit: false, description: "Ambient monitoring (non-critical)" },
] as const;

export const SUPPLIERS = [
  { id: "SUP-001", name: "Meridian Metrology Ltd", status: "APPROVED", from: "2023-01-01", to: null },
  { id: "SUP-002", name: "Northgate Calibration Services", status: "APPROVED", from: "2023-01-01", to: null },
  { id: "SUP-003", name: "Apex Instrument Labs", status: "APPROVED", from: "2023-01-01", to: null },
  { id: "SUP-004", name: "Keystone Test & Measure", status: "APPROVED", from: "2023-01-01", to: null },
  { id: "SUP-005", name: "Ridgeline Precision", status: "APPROVED", from: "2023-01-01", to: null },
  { id: "SUP-006", name: "Harbor Gauge Works", status: "APPROVED", from: "2023-01-01", to: null },
  { id: "SUP-007", name: "Cobalt Accredited Labs", status: "APPROVED", from: "2023-01-01", to: null },
  { id: "SUP-008", name: "Summit Thermal Cal", status: "APPROVED", from: "2023-01-01", to: null },
  { id: "SUP-009", name: "Vantage Metrics", status: "CONDITIONAL", from: "2024-06-01", to: "2027-06-01" },
  { id: "SUP-010", name: "Pioneer Field Cal", status: "PENDING", from: null, to: null },
  { id: "SUP-011", name: "Delta Quick-Cal", status: "SUSPENDED", from: "2023-01-01", to: "2025-09-30" },
  { id: "SUP-012", name: "Lowbid Instruments", status: "REVOKED", from: "2023-01-01", to: "2024-12-31" },
] as const;

export const LOCATIONS = ["Plant A / Mixing", "Plant A / Filling", "Plant A / Packaging", "Plant B / Reactor Hall", "Plant B / Utilities", "Plant B / QC Lab", "Warehouse / Dispatch", "Boiler House"] as const;
export const LINES = ["LINE-A", "LINE-B", "LINE-C", "LINE-D", "LINE-E", "LINE-F"] as const;
