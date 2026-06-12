import jsPDF from 'jspdf';
import type { Report } from '@/types';
import { SECTION_KEYS, SECTION_TITLES } from '@/types';

export async function exportReportAsPdf(report: Report, filename: string): Promise<void> {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter',
  });

  const margin = 54; // 0.75 inch
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // Title page
  pdf.setFontSize(24);
  pdf.setFont('helvetica', 'bold');
  pdf.text(report.title, pageWidth / 2, y + 40, { align: 'center' });
  y += 80;

  // Render each section
  for (const sectionKey of SECTION_KEYS) {
    if (sectionKey === 'title_page') continue; // Already rendered above

    const content = report.sections[sectionKey] || '';
    if (!content.trim()) continue;

    // Section heading
    if (y > pageHeight - margin - 60) {
      pdf.addPage();
      y = margin;
    }
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text(SECTION_TITLES[sectionKey], margin, y);
    y += 24;

    // Section body — convert markdown to plain lines
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');
    const lines = pdf.splitTextToSize(stripMarkdown(content), contentWidth);

    for (const line of lines) {
      if (y > pageHeight - margin) {
        pdf.addPage();
        y = margin;
      }
      pdf.text(line, margin, y);
      y += 14;
    }

    // If this is the pinned_insights section, embed chart images
    if (sectionKey === 'pinned_insights' && Object.keys(report.chart_images).length > 0) {
      for (const [, dataUrl] of Object.entries(report.chart_images)) {
        if (y > pageHeight - margin - 200) {
          pdf.addPage();
          y = margin;
        }
        try {
          pdf.addImage(dataUrl, 'PNG', margin, y, contentWidth, 180);
          y += 200;
        } catch (err) {
          console.error('Failed to add chart image:', err);
        }
      }
    }

    y += 20; // spacing after section
  }

  // Trigger download
  pdf.save(filename);
}

function stripMarkdown(md: string): string {
  return md
    .replace(/#{1,6}\s+/g, '') // headings
    .replace(/\*\*(.+?)\*\*/g, '$1') // bold
    .replace(/\*(.+?)\*/g, '$1') // italic
    .replace(/`(.+?)`/g, '$1') // code
    .replace(/^\s*[-*+]\s+/gm, '• ') // bullets
    .replace(/^\s*\d+\.\s+/gm, '') // numbered list markers
    .replace(/\n{3,}/g, '\n\n');
}
