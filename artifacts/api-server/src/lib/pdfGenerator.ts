import PDFDocument from "pdfkit";
import { contractsTable, invoicesTable } from "@workspace/db";

function pdfBuffer(fn: (doc: InstanceType<typeof PDFDocument>) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "LETTER" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      fn(doc);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

const CONTRACT_TEMPLATES: Record<string, { title: string; body: string }> = {
  lesson_package: {
    title: "Lesson Package Agreement",
    body: `This Lesson Package Agreement is entered into between {{teacherName}} ("Teacher") and {{clientName}} ("Student").

SERVICES: Teacher agrees to provide {{lessonCount}} private music lessons of {{durationMinutes}} minutes each in {{instrument}}.

FEES: The total fee for this package is {{fee}}. Payment is due {{paymentTerms}}.

CANCELLATION POLICY: Cancellations must be made at least {{cancellationHours}} hours in advance. {{cancellationTerms}}

SCHEDULING: Lessons will be scheduled by mutual agreement between Teacher and Student.

LESSON CONDUCT: Student agrees to arrive prepared for each lesson. Teacher reserves the right to end a lesson early if the student is disruptive.

This agreement is effective as of {{date}}.`,
  },
  single_event: {
    title: "Performance Agreement",
    body: `This Performance Agreement is entered into between {{teacherName}} ("Performer") and {{clientName}} ("Client").

EVENT DETAILS:
- Event: {{eventName}}
- Date: {{eventDate}}
- Venue: {{venue}}
- Performance Duration: {{durationMinutes}} minutes

FEES: The performance fee is {{fee}}. A deposit of {{depositAmount}} is due upon signing. The remaining balance is due {{balanceDueDate}}.

CANCELLATION POLICY: If cancelled by Client within {{cancellationHours}} hours of the event, the deposit is non-refundable. {{cancellationTerms}}

TRAVEL & ACCOMMODATION: {{travelTerms}}

EQUIPMENT: Performer will provide {{performerEquipment}}. Client will provide {{clientEquipment}}.

This agreement is effective as of {{date}}.`,
  },
  masterclass: {
    title: "Masterclass Agreement",
    body: `This Masterclass Agreement is entered into between {{teacherName}} ("Instructor") and {{clientName}} ("Participant").

MASTERCLASS DETAILS:
- Topic: {{masterclassTitle}}
- Date: {{eventDate}}
- Location / Platform: {{venue}}
- Duration: {{durationMinutes}} minutes

FEES: The participation fee is {{fee}}, due by {{paymentDueDate}}.

PARTICIPATION: Participant agrees to {{participationRole}} (performer / observer). Performers must prepare {{repertoire}} for the session.

RECORDING CONSENT: {{recordingConsent}}

CANCELLATION POLICY: Cancellations made less than {{cancellationHours}} hours before the masterclass {{cancellationTerms}}.

This agreement is effective as of {{date}}.`,
  },
};

export async function generateContractPdf(
  contract: typeof contractsTable.$inferSelect,
): Promise<Buffer> {
  return pdfBuffer((doc) => {
    const template = CONTRACT_TEMPLATES[contract.templateType];
    const fields = contract.fields as Record<string, string>;
    let body = template?.body ?? "";
    for (const [k, v] of Object.entries(fields)) {
      body = body.replaceAll(`{{${k}}}`, v || `[${k}]`);
    }
    body = body.replace(/\{\{[^}]+\}\}/g, (m) => `[${m.replace(/{{|}}/g, "")}]`);

    doc
      .font("Helvetica-Bold")
      .fontSize(18)
      .text(contract.title, { align: "center" })
      .moveDown(0.5);

    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#555555");

    doc.text(`Client: ${contract.clientName ?? "—"}`);
    doc.text(`Status: ${contract.status.charAt(0).toUpperCase() + contract.status.slice(1)}`);
    doc.text(`Date: ${new Date(contract.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`);
    doc.moveDown(1);

    doc
      .moveTo(50, doc.y)
      .lineTo(doc.page.width - 50, doc.y)
      .strokeColor("#cccccc")
      .stroke()
      .moveDown(0.5);

    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor("#1a1a2e")
      .text(body, { lineGap: 4 });

    doc.moveDown(2);

    doc
      .moveTo(50, doc.y)
      .lineTo(doc.page.width - 50, doc.y)
      .strokeColor("#cccccc")
      .stroke()
      .moveDown(1);

    doc.font("Helvetica-Bold").fontSize(11).text("Signatures");
    doc.moveDown(0.5);

    if (contract.status === "signed" && contract.signerName) {
      doc.font("Helvetica").fontSize(10);
      doc.text(`Client: ${contract.signerName} (signed ${contract.signedAt ? new Date(contract.signedAt).toLocaleDateString() : ""})`);
      doc.moveDown(0.5);
      doc
        .rect(50, doc.y, 200, 25)
        .fillAndStroke("#f0fdf4", "#bbf7d0");
      doc.fillColor("#16a34a").text("  ✓ Electronically Signed", 55, doc.y - 18);
    } else {
      doc.font("Helvetica").fontSize(10).fillColor("#555555");
      doc.text("Client Signature: _______________________________");
      doc.moveDown(0.5);
      doc.text("Date: _______________");
    }

    doc.moveDown(2);
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#999999")
      .text("Generated by Harmonia Business Suite", { align: "center" });
  });
}

export async function generateInvoicePdf(
  invoice: typeof invoicesTable.$inferSelect,
  teacherName: string,
): Promise<Buffer> {
  return pdfBuffer((doc) => {
    const lineItems = (invoice.lineItems ?? []) as Array<{ description: string; amountInCents: number }>;
    const total = lineItems.length > 0
      ? lineItems.reduce((s, i) => s + i.amountInCents, 0)
      : invoice.amountInCents;

    doc
      .font("Helvetica-Bold")
      .fontSize(24)
      .fillColor("#b8860b")
      .text("INVOICE", { align: "right" })
      .moveDown(0.2);

    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#555555")
      .text(`#${String(invoice.id).padStart(4, "0")}`, { align: "right" });

    doc.text(`Date: ${new Date(invoice.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, { align: "right" });

    if (invoice.dueDate) {
      doc.text(`Due: ${new Date(invoice.dueDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, { align: "right" });
    }

    doc.moveDown(0.3);
    const statusColor = invoice.status === "paid" ? "#16a34a" : invoice.status === "sent" ? "#b8860b" : "#555555";
    doc.font("Helvetica-Bold").fontSize(10).fillColor(statusColor).text(invoice.status.toUpperCase(), { align: "right" });

    doc.moveDown(1.5);
    doc
      .moveTo(50, doc.y)
      .lineTo(doc.page.width - 50, doc.y)
      .strokeColor("#e5e5d0")
      .stroke()
      .moveDown(0.5);

    const colX = 300;
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#333333");
    doc.text("FROM", 50, doc.y);
    doc.text("BILL TO", colX, doc.y - 12);
    doc.moveDown(0.3);
    doc.font("Helvetica").fillColor("#555555");
    doc.text(teacherName, 50, doc.y);
    doc.text(invoice.clientName, colX, doc.y - 12);
    doc.moveDown(0.2);
    doc.text(invoice.clientEmail, colX, doc.y);

    doc.moveDown(1.5);
    doc
      .moveTo(50, doc.y)
      .lineTo(doc.page.width - 50, doc.y)
      .strokeColor("#e5e5d0")
      .stroke()
      .moveDown(0.5);

    doc.font("Helvetica-Bold").fontSize(10).fillColor("#ffffff");
    doc.rect(50, doc.y, doc.page.width - 100, 20).fill("#1a1a2e");
    doc.text("DESCRIPTION", 55, doc.y - 15);
    doc.text("AMOUNT", doc.page.width - 120, doc.y - 15);
    doc.fillColor("#333333");
    doc.moveDown(0.3);

    if (lineItems.length > 0) {
      for (const item of lineItems) {
        const y = doc.y;
        doc.font("Helvetica").fontSize(10).fillColor("#333333");
        doc.text(item.description, 55, y, { width: 350 });
        doc.text(`$${(item.amountInCents / 100).toFixed(2)}`, doc.page.width - 120, y, { align: "right", width: 70 });
        doc.moveDown(0.4);
        doc
          .moveTo(50, doc.y)
          .lineTo(doc.page.width - 50, doc.y)
          .strokeColor("#f0f0e8")
          .stroke()
          .moveDown(0.2);
      }
    } else {
      const y = doc.y;
      doc.font("Helvetica").fontSize(10).fillColor("#333333");
      doc.text("Services", 55, y);
      doc.text(`$${(invoice.amountInCents / 100).toFixed(2)}`, doc.page.width - 120, y, { align: "right", width: 70 });
      doc.moveDown(0.8);
    }

    doc.moveDown(0.5);
    doc
      .moveTo(doc.page.width - 200, doc.y)
      .lineTo(doc.page.width - 50, doc.y)
      .strokeColor("#b8860b")
      .stroke()
      .moveDown(0.3);

    doc.font("Helvetica-Bold").fontSize(12).fillColor("#1a1a2e");
    doc.text("TOTAL", doc.page.width - 200, doc.y, { continued: true });
    doc.text(`  $${(total / 100).toFixed(2)} ${invoice.currency ?? "USD"}`, { align: "right" });

    if (invoice.paymentNote) {
      doc.moveDown(1);
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#333333").text("Payment Instructions:");
      doc.font("Helvetica").fontSize(10).fillColor("#555555").text(invoice.paymentNote);
    }

    if (invoice.notes) {
      doc.moveDown(0.5);
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#333333").text("Notes:");
      doc.font("Helvetica").fontSize(10).fillColor("#555555").text(invoice.notes);
    }

    doc.moveDown(2);
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#999999")
      .text("Generated by Harmonia Business Suite", { align: "center" });
  });
}
