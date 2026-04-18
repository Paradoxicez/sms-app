"use client"

import { AuditLogDataTable } from "@/components/audit/audit-log-data-table"

export default function AdminAuditLogRoute() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Platform Audit Log</h1>
      <AuditLogDataTable
        apiUrl="/api/admin/audit-log"
        showOrganization
      />
    </div>
  )
}
