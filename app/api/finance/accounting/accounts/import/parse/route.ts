import { NextResponse } from "next/server";
import { auth } from "@/auth";
import * as xlsx from "xlsx";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const workbook = xlsx.read(buffer, { type: "buffer" });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // Convert sheet to json (array of arrays)
    const rawData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
    
    if (rawData.length === 0) {
      return NextResponse.json({ error: "Empty file" }, { status: 400 });
    }

    const columns = rawData[0] as string[];
    const rows = rawData.slice(1, 6); // Just preview the first 5 rows

    return NextResponse.json({ columns, preview: rows });
  } catch (error) {
    console.error("Account Parse Error:", error);
    return NextResponse.json({ error: "Failed to parse file" }, { status: 500 });
  }
}
