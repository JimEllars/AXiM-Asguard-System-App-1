export interface AsguardTelemetryEvent {
  id: string;
  timestamp: string;
  sender: string;
  recipient: string;
  subject: string;
  threat_level: 'BENIGN' | 'SUSPICIOUS' | 'MALICIOUS';
  score: number;
  action_taken: 'DELIVER' | 'FLAG' | 'QUARANTINE';
  indicators: string[];
  raw_snippet?: string;
  source_ip?: string;
}
