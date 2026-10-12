import JSZip from 'jszip';

function escapeCsvCell(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function recordsToCsv(rows: Record<string, string>[]): string {
  if (rows.length === 0) return '';
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escapeCsvCell(row[h])).join(',')),
  ];
  return lines.join('\r\n');
}

export interface ExportAssignmentZipData {
  assignmentTitle: string;
  submissionsRows: Record<string, string>[];
  questionnaireRows: Record<string, string>[];
}

export async function exportAssignmentToZip(data: ExportAssignmentZipData): Promise<Blob> {
  const zip = new JSZip();
  const { assignmentTitle, submissionsRows, questionnaireRows } = data;
  const safeName = assignmentTitle.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').slice(0, 80) || 'assignment';

  zip.file('Submissions.csv', recordsToCsv(submissionsRows));
  zip.file('Questionnaire.csv', recordsToCsv(questionnaireRows));

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
