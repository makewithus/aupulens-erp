import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmOpportunity from "@/models/crm/Opportunity";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
import { requireRole } from "@/lib/crm/rbac";
import * as xlsx from "xlsx";
import { Parser } from "@json2csv/plainjs";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return new NextResponse("Unauthorized", { status: 401 });
    
    // Check permission strictly per CTO requirements
    const roleCheck = requireRole(session, ['opportunity.export']);
    if (roleCheck) return roleCheck;

    await dbConnect();
    const body = await req.json();
    const { format = 'csv', scope = 'all', reportType = 'standard', selectedIds = [], filters = {}, columns = [] } = body;
    
    // Build query based on scope and filters
    const query: any = { tenantId: session.user.tenantId };
    
    if (scope === 'selected' && selectedIds.length > 0) {
      query._id = { $in: selectedIds };
    } else if (scope === 'filtered') {
      if (filters.search) {
        query.$or = [
          { deal_name: { $regex: filters.search, $options: 'i' } },
          { name: { $regex: filters.search, $options: 'i' } }
        ];
      }
      if (filters.stage && filters.stage !== 'all') query.stage = filters.stage;
      if (filters.risk_level && filters.risk_level !== 'all') query.risk_level = filters.risk_level;
    }
    
    // Fetch opportunities with relations
    const opps = await CrmOpportunity.find(query)
      .populate('account_id', 'company_name')
      .populate('owner_id', 'name email')
      .sort({ createdAt: -1 });
      
    let dataToExport: any[] = [];
    let filename = `Opportunities_${new Date().toISOString().split('T')[0]}`;
    
    // Standard Export
    if (reportType === 'standard') {
      dataToExport = opps.map(opp => {
        const row: any = {
          'Deal Name': opp.deal_name || opp.name,
          'Account': opp.account_id?.company_name || 'N/A',
          'Owner': opp.owner_id?.name || 'Unassigned',
          'Stage': opp.stage,
          'Probability (%)': opp.probability,
          'Amount': opp.amount,
          'Weighted Revenue': (opp.amount || 0) * ((opp.probability || 0) / 100),
          'Forecast Category': opp.forecast_category,
          'Expected Close Date': opp.expected_close_date ? new Date(opp.expected_close_date).toLocaleDateString() : '',
          'Source': opp.source || '',
          'Priority': opp.priority,
          'Risk Level': opp.risk_level,
          'Created Date': new Date(opp.createdAt).toLocaleDateString()
        };
        // Filter requested columns if provided
        if (columns.length > 0) {
          const filteredRow: any = {};
          columns.forEach((c: string) => { if (row[c] !== undefined) filteredRow[c] = row[c]; });
          return filteredRow;
        }
        return row;
      });
      filename = `Opportunities_Export_${new Date().toISOString().split('T')[0]}`;
      if (filters.stage && filters.stage !== 'all') filename = `${filters.stage.replace(' ', '_')}_Deals_${new Date().toISOString().split('T')[0]}`;
    } 
    // Pipeline Report Export
    else if (reportType === 'pipeline') {
      const stageMap: Record<string, any> = {};
      opps.forEach(opp => {
        if (!stageMap[opp.stage]) {
          stageMap[opp.stage] = { Stage: opp.stage, 'Deal Count': 0, 'Pipeline Value': 0, 'Weighted Value': 0 };
        }
        stageMap[opp.stage]['Deal Count']++;
        stageMap[opp.stage]['Pipeline Value'] += opp.amount || 0;
        stageMap[opp.stage]['Weighted Value'] += (opp.amount || 0) * ((opp.probability || 0) / 100);
      });
      dataToExport = Object.values(stageMap);
      filename = `Pipeline_Report_${new Date().toISOString().split('T')[0]}`;
    }
    // Forecast Report Export
    else if (reportType === 'forecast') {
      let bestCase = 0, likely = 0, pipeline = 0, closed = 0;
      opps.forEach(opp => {
        if (opp.forecast_category === 'Best Case') bestCase += opp.amount || 0;
        else if (opp.forecast_category === 'Commit' || opp.probability >= 80) likely += opp.amount || 0;
        else if (opp.forecast_category === 'Closed' || opp.stage === 'Closed Won') closed += opp.amount || 0;
        pipeline += opp.amount || 0;
      });
      dataToExport = [{
        'Pipeline Forecast': pipeline,
        'Best Case Forecast': bestCase + likely + closed,
        'Likely Forecast': likely + closed,
        'Closed Revenue': closed
      }];
      filename = `Forecast_Report_${new Date().toISOString().split('T')[0]}`;
    }
    
    // Format Conversion
    let fileBuffer: Buffer;
    let contentType = '';
    
    if (format === 'csv') {
      const parser = new Parser({});
      const csv = parser.parse(dataToExport);
      fileBuffer = Buffer.from(csv, 'utf8');
      contentType = 'text/csv; charset=utf-8';
      filename += '.csv';
    } else {
      // XLSX
      const worksheet = xlsx.utils.json_to_sheet(dataToExport);
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, "Export");
      const excelBuffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });
      fileBuffer = Buffer.from(excelBuffer);
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      filename += '.xlsx';
    }
    
    // Audit Logging
    await CrmAuditLog.create({
      tenantId: session.user.tenantId,
      user_id: session.user.id,
      action: 'download', // Using valid action from ALLOWED_ACTIONS
      record_type: 'Export',
      record_id: opps.length > 0 ? opps[0]._id : session.user.id, // Just linking something valid
      field_name: reportType,
      new_value: `${opps.length} records exported to ${format}`,
      timestamp: new Date()
    });
    
    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type': contentType,
      }
    });

  } catch (error: any) {
    console.error("Export Error:", error);
    return new NextResponse(JSON.stringify({ success: false, message: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
