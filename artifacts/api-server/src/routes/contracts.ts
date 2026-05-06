import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and } from "drizzle-orm";
import { db, contractsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { isProSubscriber } from "./subscriptions";
import { randomBytes } from "crypto";

const router: IRouter = Router();

function escapeHtml(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

function generateHtmlDocument(contract: typeof contractsTable.$inferSelect, teacherName: string): string {
  const template = CONTRACT_TEMPLATES[contract.templateType];
  const fields = contract.fields as Record<string, string>;

  let body = template?.body ?? "";
  for (const [k, v] of Object.entries(fields)) {
    body = body.replaceAll(`{{${k}}}`, v || `[${k}]`);
  }
  body = body.replace(/\{\{[^}]+\}\}/g, (m) => `[${m.replace(/{{|}}/g, "")}]`);

  const escapedBody = escapeHtml(body);
  const signedLine = contract.status === "signed"
    ? escapeHtml(contract.signerName ?? "")
    : "";
  const signedBadge = contract.status === "signed"
    ? `<div class="signed-badge">&#10003; Signed by ${escapeHtml(contract.signerName)} on ${contract.signedAt ? new Date(contract.signedAt).toLocaleDateString() : ""}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(contract.title)}</title>
<style>
  body { font-family: Georgia, serif; max-width: 700px; margin: 40px auto; padding: 0 20px; color: #1a1a2e; line-height: 1.7; }
  h1 { font-size: 22px; border-bottom: 2px solid #b8860b; padding-bottom: 10px; margin-bottom: 30px; }
  .meta { background: #fafaf5; border: 1px solid #e5e5d0; border-radius: 6px; padding: 16px; margin-bottom: 30px; font-size: 13px; }
  .meta p { margin: 4px 0; }
  pre { white-space: pre-wrap; font-family: Georgia, serif; font-size: 14px; }
  .signature-block { margin-top: 50px; border-top: 1px solid #ccc; padding-top: 20px; }
  .sig-row { display: flex; gap: 60px; }
  .sig-col { flex: 1; }
  .sig-line { border-bottom: 1px solid #333; min-height: 36px; margin-bottom: 4px; }
  .sig-label { font-size: 12px; color: #666; }
  .signed-badge { background: #16a34a; color: white; padding: 6px 14px; border-radius: 4px; font-size: 13px; display: inline-block; margin-top: 10px; }
  @media print { body { margin: 20px; } }
</style>
</head>
<body>
<h1>${escapeHtml(contract.title)}</h1>
<div class="meta">
  <p><strong>Prepared by:</strong> ${escapeHtml(teacherName)}</p>
  <p><strong>Client:</strong> ${escapeHtml(contract.clientName ?? "—")}</p>
  <p><strong>Status:</strong> ${escapeHtml(contract.status.charAt(0).toUpperCase() + contract.status.slice(1))}</p>
  <p><strong>Date:</strong> ${new Date(contract.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
</div>
<pre>${escapedBody}</pre>
<div class="signature-block">
  <div class="sig-row">
    <div class="sig-col">
      <div class="sig-line">${signedLine}</div>
      <div class="sig-label">Client Signature — ${escapeHtml(contract.clientName ?? "")}</div>
    </div>
    <div class="sig-col">
      <div class="sig-line"></div>
      <div class="sig-label">Date</div>
    </div>
  </div>
  ${signedBadge}
</div>
<p style="font-size:12px; color:#999; margin-top:40px;">Generated by Harmonia Business Suite</p>
</body>
</html>`;
}

router.get("/contracts", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  if (!await isProSubscriber(userId)) {
    res.status(403).json({ error: "Business Suite subscription required" });
    return;
  }

  const contracts = await db
    .select()
    .from(contractsTable)
    .where(eq(contractsTable.teacherId, userId))
    .orderBy(contractsTable.createdAt);

  res.json({ contracts });
});

router.post("/contracts", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  if (!await isProSubscriber(userId)) {
    res.status(403).json({ error: "Business Suite subscription required" });
    return;
  }

  const { templateType, title, fields, clientEmail, clientName } = req.body as {
    templateType: "lesson_package" | "single_event" | "masterclass";
    title?: string;
    fields?: Record<string, string>;
    clientEmail?: string;
    clientName?: string;
  };

  if (!templateType || !CONTRACT_TEMPLATES[templateType]) {
    res.status(400).json({ error: "templateType must be one of: lesson_package, single_event, masterclass" });
    return;
  }

  const resolvedTitle = title || CONTRACT_TEMPLATES[templateType].title;

  const [contract] = await db
    .insert(contractsTable)
    .values({
      teacherId: userId,
      templateType,
      title: resolvedTitle,
      fields: fields ?? {},
      clientEmail,
      clientName,
      status: "draft",
    })
    .returning();

  res.status(201).json({ contract });
});

router.get("/contracts/templates", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  if (!await isProSubscriber(userId)) {
    res.status(403).json({ error: "Business Suite subscription required" });
    return;
  }

  const templates = Object.entries(CONTRACT_TEMPLATES).map(([key, tpl]) => ({
    type: key,
    title: tpl.title,
    previewBody: tpl.body.slice(0, 200) + "…",
  }));

  res.json({ templates });
});

router.get("/contracts/:id", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [contract] = await db
    .select()
    .from(contractsTable)
    .where(and(eq(contractsTable.id, id), eq(contractsTable.teacherId, userId)));

  if (!contract) { res.status(404).json({ error: "Contract not found" }); return; }

  res.json({ contract });
});

router.put("/contracts/:id", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  if (!await isProSubscriber(userId)) {
    res.status(403).json({ error: "Business Suite subscription required" });
    return;
  }

  const { title, fields, clientEmail, clientName } = req.body as {
    title?: string;
    fields?: Record<string, string>;
    clientEmail?: string;
    clientName?: string;
  };

  const [updated] = await db
    .update(contractsTable)
    .set({
      ...(title !== undefined ? { title } : {}),
      ...(fields !== undefined ? { fields } : {}),
      ...(clientEmail !== undefined ? { clientEmail } : {}),
      ...(clientName !== undefined ? { clientName } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(contractsTable.id, id), eq(contractsTable.teacherId, userId)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Contract not found" }); return; }

  res.json({ contract: updated });
});

router.delete("/contracts/:id", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db
    .delete(contractsTable)
    .where(and(eq(contractsTable.id, id), eq(contractsTable.teacherId, userId)));

  res.status(204).end();
});

router.post("/contracts/:id/send", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  if (!await isProSubscriber(userId)) {
    res.status(403).json({ error: "Business Suite subscription required" });
    return;
  }

  const [contract] = await db
    .select()
    .from(contractsTable)
    .where(and(eq(contractsTable.id, id), eq(contractsTable.teacherId, userId)));

  if (!contract) { res.status(404).json({ error: "Contract not found" }); return; }

  if (!contract.clientEmail) {
    res.status(400).json({ error: "clientEmail is required to send a contract" });
    return;
  }

  const signToken = randomBytes(32).toString("hex");

  const [updated] = await db
    .update(contractsTable)
    .set({ status: "sent", signToken, updatedAt: new Date() })
    .where(eq(contractsTable.id, id))
    .returning();

  const baseUrl = process.env.PUBLIC_API_URL ?? process.env.PUBLIC_APP_URL ?? "https://harmonia.app";
  const signUrl = `${baseUrl}/api/contracts/sign/${signToken}`;

  logger.info({ contractId: id, clientEmail: contract.clientEmail, signUrl }, "[NOTIFICATION] Contract sent for signature — email client with sign URL");

  res.json({ contract: updated, signUrl, message: `Contract sent to ${contract.clientEmail}. Signing link: ${signUrl}` });
});

router.get("/contracts/:id/pdf", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [contract] = await db
    .select()
    .from(contractsTable)
    .where(and(eq(contractsTable.id, id), eq(contractsTable.teacherId, userId)));

  if (!contract) { res.status(404).json({ error: "Contract not found" }); return; }

  const html = generateHtmlDocument(contract, "Teacher");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Disposition", `inline; filename="contract-${contract.id}.html"`);
  res.send(html);
});

router.get("/contracts/sign/:token", async (req, res): Promise<void> => {
  const { token } = req.params;

  const [contract] = await db
    .select()
    .from(contractsTable)
    .where(eq(contractsTable.signToken, token));

  if (!contract) { res.status(404).send("<h1>Contract not found or link expired.</h1>"); return; }

  if (contract.status === "signed") {
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Already Signed</title>
    <style>body{font-family:Georgia,serif;max-width:600px;margin:60px auto;padding:20px;text-align:center;}</style>
    </head><body><h1>Contract Already Signed</h1><p>This contract was signed by <strong>${escapeHtml(contract.signerName)}</strong> on ${contract.signedAt ? new Date(contract.signedAt).toLocaleDateString() : ""}.</p></body></html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
    return;
  }

  const template = CONTRACT_TEMPLATES[contract.templateType];
  const fields = contract.fields as Record<string, string>;
  let body = template?.body ?? "";
  for (const [k, v] of Object.entries(fields)) {
    body = body.replaceAll(`{{${k}}}`, v || `[${k}]`);
  }
  body = body.replace(/\{\{[^}]+\}\}/g, (m) => `[${m.replace(/{{|}}/g, "")}]`);
  const escapedBody = escapeHtml(body);
  const safeToken = escapeHtml(token);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sign Contract: ${escapeHtml(contract.title)}</title>
<style>
  body { font-family: Georgia, serif; max-width: 700px; margin: 40px auto; padding: 0 20px; color: #1a1a2e; line-height: 1.7; }
  h1 { font-size: 22px; border-bottom: 2px solid #b8860b; padding-bottom: 10px; margin-bottom: 20px; }
  pre { white-space: pre-wrap; font-family: Georgia, serif; font-size: 14px; background: #fafaf5; border: 1px solid #e5e5d0; border-radius: 6px; padding: 20px; }
  .sign-form { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 24px; margin-top: 32px; }
  .sign-form h2 { font-size: 18px; margin-top: 0; }
  input[type=text] { width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 15px; margin: 8px 0 16px; box-sizing: border-box; }
  label { font-size: 14px; display: flex; align-items: flex-start; gap: 10px; margin-bottom: 16px; }
  button { background: #16a34a; color: white; border: none; padding: 12px 28px; border-radius: 6px; font-size: 15px; cursor: pointer; font-family: Georgia, serif; }
  button:hover { background: #15803d; }
</style>
</head>
<body>
<h1>${escapeHtml(contract.title)}</h1>
<p><strong>Client:</strong> ${escapeHtml(contract.clientName ?? "—")}</p>
<pre>${escapedBody}</pre>
<div class="sign-form">
  <h2>Sign This Contract</h2>
  <p>By signing below, you acknowledge that you have read and agree to the terms of this contract.</p>
  <form method="POST" action="/api/contracts/sign/${safeToken}">
    <div>
      <label for="signerName">Full Name</label>
      <input type="text" id="signerName" name="signerName" required placeholder="Enter your full legal name" autocomplete="name" />
    </div>
    <label>
      <input type="checkbox" name="agreed" required />
      <span>I have read and agree to the terms of this contract.</span>
    </label>
    <button type="submit">Sign Contract</button>
  </form>
</div>
<p style="font-size:12px; color:#999; margin-top:30px;">Powered by Harmonia Business Suite</p>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

router.post("/contracts/sign/:token", async (req, res): Promise<void> => {
  const { token } = req.params;
  const rawSignerName = (req.body as { signerName?: string }).signerName;
  const signerName = rawSignerName?.trim().slice(0, 200) ?? "";

  if (!signerName) {
    res.status(400).send("<!DOCTYPE html><html><body><h1>Error: Full name is required.</h1></body></html>");
    return;
  }

  const [contract] = await db
    .select()
    .from(contractsTable)
    .where(eq(contractsTable.signToken, token));

  if (!contract) { res.status(404).send("<!DOCTYPE html><html><body><h1>Contract not found or link expired.</h1></body></html>"); return; }

  if (contract.status === "signed") {
    res.send(`<!DOCTYPE html><html><body><h1>Already signed by ${escapeHtml(contract.signerName)}</h1></body></html>`);
    return;
  }

  await db
    .update(contractsTable)
    .set({ status: "signed", signerName: signerName.trim(), signedAt: new Date(), updatedAt: new Date() })
    .where(eq(contractsTable.id, contract.id));

  logger.info({ contractId: contract.id, signerName }, "[NOTIFICATION] Contract signed — notify teacher");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Contract Signed</title>
<style>
  body { font-family: Georgia, serif; max-width: 600px; margin: 80px auto; padding: 20px; text-align: center; }
  .badge { background: #16a34a; color: white; display: inline-block; padding: 12px 30px; border-radius: 8px; font-size: 20px; margin-bottom: 20px; }
</style>
</head>
<body>
<div class="badge">&#10003; Contract Signed</div>
<h2>${escapeHtml(contract.title)}</h2>
<p>Signed by <strong>${escapeHtml(signerName)}</strong> on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.</p>
<p>Thank you! The teacher has been notified.</p>
<p style="font-size:12px;color:#999;margin-top:40px;">Powered by Harmonia Business Suite</p>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

export default router;
