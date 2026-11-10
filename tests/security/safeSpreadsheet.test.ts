import { describe, it, expect } from "vitest";
import * as xlsx from "xlsx";
import {
  safeReadSpreadsheet,
  safeSheetToJson,
  validateSpreadsheetBuffer,
  inspectZipHeaders,
  sanitizeCellValue,
} from "@/lib/security/safeSpreadsheet";

describe("Spreadsheet Security Containment (safeSpreadsheet)", () => {
  describe("sanitizeCellValue", () => {
    it("preserves regular text and numbers", () => {
      expect(sanitizeCellValue("John Doe")).toBe("John Doe");
      expect(sanitizeCellValue(12345)).toBe(12345);
      expect(sanitizeCellValue(null)).toBe(null);
      expect(sanitizeCellValue(undefined)).toBe(undefined);
    });

    it("preserves valid negative and positive numbers formatted as strings", () => {
      expect(sanitizeCellValue("-100.50")).toBe("-100.50");
      expect(sanitizeCellValue("+45")).toBe("+45");
      expect(sanitizeCellValue("-0")).toBe("-0");
    });

    it("neutralizes formula injection characters", () => {
      expect(sanitizeCellValue("=cmd|' /C calc'!A0")).toBe("'=cmd|' /C calc'!A0");
      expect(sanitizeCellValue("=SUM(A1:A10)")).toBe("'=SUM(A1:A10)");
      expect(sanitizeCellValue("+SUM(A1:A10)")).toBe("'+SUM(A1:A10)");
      expect(sanitizeCellValue("@SUM(A1:A10)")).toBe("'@SUM(A1:A10)");
      expect(sanitizeCellValue("-2+3+cmd|' /C calc'!A0")).toBe("'-2+3+cmd|' /C calc'!A0");
      expect(sanitizeCellValue("\tmalicious_tab")).toBe("'\tmalicious_tab");
      expect(sanitizeCellValue("\rmalicious_cr")).toBe("'\rmalicious_cr");
    });
  });

  describe("validateSpreadsheetBuffer & inspectZipHeaders", () => {
    it("rejects empty buffer", () => {
      expect(() => validateSpreadsheetBuffer(Buffer.alloc(0), "test.xlsx")).toThrow(
        "File is empty",
      );
    });

    it("rejects file exceeding maxSizeBytes", () => {
      const largeBuf = Buffer.alloc(11 * 1024 * 1024);
      expect(() => validateSpreadsheetBuffer(largeBuf, "test.xlsx", { maxSizeBytes: 10 * 1024 * 1024 })).toThrow(
        "exceeds maximum permitted size",
      );
    });

    it("rejects fake xlsx without ZIP magic bytes", () => {
      const fake = Buffer.from("MZ\x90\x00Not a zip file at all");
      expect(() => validateSpreadsheetBuffer(fake, "test.xlsx")).toThrow(
        "Invalid XLSX file: file header does not match ZIP container format",
      );
    });

    it("rejects executable disguised as xls or csv", () => {
      const exe = Buffer.from("MZ\x90\x00This is an executable binary");
      expect(() => validateSpreadsheetBuffer(exe, "test.xls")).toThrow(
        "Disallowed executable binary detected",
      );
      expect(() => validateSpreadsheetBuffer(exe, "test.csv")).toThrow(
        "Disallowed executable binary detected",
      );
    });

    it("rejects CSV with excessive binary null bytes", () => {
      const binaryBlob = Buffer.alloc(100);
      binaryBlob.write("CSV Header,Value\n", 0);
      binaryBlob[30] = 0x00;
      binaryBlob[31] = 0x00;
      binaryBlob[32] = 0x00;
      binaryBlob[33] = 0x00;
      expect(() => validateSpreadsheetBuffer(binaryBlob, "test.csv")).toThrow(
        "Binary data detected in text spreadsheet upload",
      );
    });
  });

  describe("safeReadSpreadsheet & safeSheetToJson", () => {
    it("successfully parses a valid in-memory workbook", () => {
      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.aoa_to_sheet([
        ["Customer Name", "Email", "Balance"],
        ["Acme Corp", "acme@example.com", 1500],
        ["Beta LLC", "beta@example.com", 2500],
      ]);
      xlsx.utils.book_append_sheet(wb, ws, "Customers");
      const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

      const parsedWb = safeReadSpreadsheet(buf, { fileName: "customers.xlsx" });
      expect(parsedWb.SheetNames).toEqual(["Customers"]);

      const rows = safeSheetToJson(parsedWb.Sheets["Customers"]);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({
        "Customer Name": "Acme Corp",
        Email: "acme@example.com",
        Balance: 1500,
      });
    });

    it("enforces sheet count limits", () => {
      const wb = xlsx.utils.book_new();
      for (let i = 0; i < 5; i++) {
        const ws = xlsx.utils.aoa_to_sheet([["Col"], [i]]);
        xlsx.utils.book_append_sheet(wb, ws, `Sheet${i}`);
      }
      const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

      expect(() => safeReadSpreadsheet(buf, { fileName: "test.xlsx", maxSheets: 3 })).toThrow(
        "exceeding maximum allowed of 3",
      );
    });

    it("enforces row limits in safeSheetToJson", () => {
      const data: any[][] = [["ID", "Name"]];
      for (let i = 0; i < 50; i++) {
        data.push([i, `User ${i}`]);
      }
      const ws = xlsx.utils.aoa_to_sheet(data);

      expect(() => safeSheetToJson(ws, { maxRows: 20 })).toThrow(
        "exceeds maximum allowed of 20",
      );
    });

    it("enforces column limits in safeSheetToJson", () => {
      const headers = Array.from({ length: 30 }, (_, i) => `Col_${i}`);
      const row = Array.from({ length: 30 }, (_, i) => i);
      const ws = xlsx.utils.aoa_to_sheet([headers, row]);

      expect(() => safeSheetToJson(ws, { maxCols: 15 })).toThrow(
        "exceeds maximum allowed of 15",
      );
    });

    it("strips prototype pollution keys (__proto__, constructor, prototype)", () => {
      const ws = xlsx.utils.aoa_to_sheet([
        ["__proto__", "constructor", "prototype", "safe_field"],
        ["polluted_proto", "polluted_ctor", "polluted_proto_ref", "legitimate_val"],
      ]);

      const rows = safeSheetToJson<any>(ws);
      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(row.safe_field).toBe("legitimate_val");
      expect(Object.prototype.hasOwnProperty.call(row, "__proto__")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(row, "constructor")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(row, "prototype")).toBe(false);
      // Ensure global Object prototype was not polluted
      expect(({} as any).polluted_proto).toBeUndefined();
    });

    it("neutralizes formulas during safeSheetToJson conversion", () => {
      const ws = xlsx.utils.aoa_to_sheet([
        ["FormulaCol", "ValidNumber"],
        ["=HYPERLINK(\"http://evil.com\")", "-500"],
      ]);

      const rows = safeSheetToJson<any>(ws, { sanitizeFormulas: true });
      expect(rows).toHaveLength(1);
      expect(rows[0].FormulaCol).toBe("'=HYPERLINK(\"http://evil.com\")");
      expect(rows[0].ValidNumber).toBe("-500");
    });
  });
});

