import { NextResponse } from "next/server";
import { auth } from "@/auth";
import * as xlsx from "xlsx";
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
    const workbook = xlsx.read(Buffer.from(bytes), { type: "buffer" });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];

    const rawData = xlsx.utils.sheet_to_json(worksheet, { header: 1, raw: false }) as any[];
    if (rawData.length === 0) {
      return NextResponse.json({ error: "Empty file" }, { status: 400 });
    }

    const columns = rawData[0] as string[];
    const preview = rawData.slice(1, 6);
    const totalRows = rawData.length - 1;

    return NextResponse.json({ columns, preview, totalRows });
  } catch (error) {
    console.error("Sales Order Import Parse Error:", error);
    return NextResponse.json({ error: "Failed to parse file" }, { status: 500 });
  }
}
