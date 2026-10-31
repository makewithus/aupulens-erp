import Employee from "@/models/hr/Employee";

/** Allocate the next tenant-scoped, human-readable employee code. */
export async function allocateEmployeeCode(tenantId: string): Promise<string> {
  const codes: string[] = await Employee.find({ tenantId, employeeCode: /^EMP-\d+$/i })
    .distinct("employeeCode");
  const highest = codes.reduce((max, value) => {
    const match = String(value).match(/^EMP-(\d+)$/i);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  let sequence = highest + 1;
  let code = "";
  do {
    code = `EMP-${String(sequence++).padStart(3, "0")}`;
  } while (await Employee.exists({ tenantId, employeeCode: code }));
  return code;
}

