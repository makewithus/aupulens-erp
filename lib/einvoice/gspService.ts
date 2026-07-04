// Clean-interface wrapper around the external NIC/GSP e-invoicing network calls.
// TODO: replace the stubbed methods below with real HTTP calls once GSP API keys
// and endpoint URLs are available. Nothing outside this file should know the
// integration is stubbed — callers only depend on GspService.

export interface GspCredentialsInput {
  provider: string;
  username: string;
  password: string;
}

export interface GspValidationResult {
  ok: boolean;
  error?: string;
}

export interface GenerateEinvoiceInput {
  invoiceNumber: string;
  totalAmount: number;
  // Real integration will also need seller/buyer GSTIN, line items, HSN codes, etc.
}

export interface GenerateEinvoiceResult {
  ok: boolean;
  irn?: string;
  ackNo?: string;
  ackDate?: Date;
  error?: string;
}

export interface GspService {
  validateCredentials(credentials: GspCredentialsInput): Promise<GspValidationResult>;
  generateEinvoice(
    credentials: GspCredentialsInput,
    invoice: GenerateEinvoiceInput,
  ): Promise<GenerateEinvoiceResult>;
}

// TODO: replace with a real NIC/GSP API client once credentials are available.
class StubGspService implements GspService {
  async validateCredentials(credentials: GspCredentialsInput): Promise<GspValidationResult> {
    if (!credentials.username || !credentials.password) {
      return { ok: false, error: "Username and password are required" };
    }
    // Stub: accept any non-empty credentials as valid in the absence of real GSP access.
    return { ok: true };
  }

  async generateEinvoice(
    _credentials: GspCredentialsInput,
    invoice: GenerateEinvoiceInput,
  ): Promise<GenerateEinvoiceResult> {
    // Stub: synthesize a fake IRN/ack so the internal flow (status tracking, UI) is real end-to-end.
    const irn = `STUB-IRN-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ackNo = `STUB-ACK-${Date.now()}`;
    return { ok: true, irn, ackNo, ackDate: new Date() };
  }
}

let gspService: GspService = new StubGspService();

export function getGspService(): GspService {
  return gspService;
}

// Test-only override hook.
export function setGspService(service: GspService) {
  gspService = service;
}
