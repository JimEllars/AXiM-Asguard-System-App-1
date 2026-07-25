import re

with open('soc-cockpit/src/components/LiveThreatFeed.tsx', 'r') as f:
    content = f.read()

old_export = """  const handleExportAuditCSV = () => {
    if (!auditLog || auditLog.length === 0) return;
    const header = "Timestamp,Action,Target Key,TTL,Authorized Wallet\\n";
    const rows = auditLog.map(event => {"""

new_export = """  const handleExportAuditCSV = () => {
    const dataToExport = filteredAuditLog && filteredAuditLog.length > 0 ? filteredAuditLog : auditLog;
    if (!dataToExport || dataToExport.length === 0) return;
    const header = "Timestamp,Action,Target Key,TTL,Authorized Wallet\\n";
    const rows = dataToExport.map(event => {"""

content = content.replace(old_export, new_export)

with open('soc-cockpit/src/components/LiveThreatFeed.tsx', 'w') as f:
    f.write(content)
