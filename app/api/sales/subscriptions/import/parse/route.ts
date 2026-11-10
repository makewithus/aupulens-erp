import { NextResponse } from "next/server";
import { auth } from "@/auth";
import * as xlsx from "xlsx";
import { safeReadSpreadsheet, safeSheetToJson } from "@/lib/security/safeSpreadsheet";
import { validateSpreadsheetFile } from "@/lib/utils/fileValidation";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const fileError = validateSpreadsheetFile(file);
    if (fileError) return NextResponse.json({ error: fileError }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const workbook = safeReadSpreadsheet(buffer, { fileName: file.name, raw: false });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];

    const rawData = safeSheetToJson<any[]>(worksheet, { header: 1, raw: false });
    if (rawData.length === 0) {
      return NextResponse.json({ error: "Empty file" }, { status: 400 });
    }

    const columns = rawData[0] as string[];
    const preview = rawData.slice(1, 6);
    const totalRows = rawData.length - 1;

    return NextResponse.json({ columns, preview, totalRows });
  } catch (error) {
    console.error("Subscription Import Parse Error:", error);
    return NextResponse.json({ error: "Failed to parse file" }, { status: 500 });
  }
}
