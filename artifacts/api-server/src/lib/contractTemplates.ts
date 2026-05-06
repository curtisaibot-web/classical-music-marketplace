export const CONTRACT_TEMPLATES: Record<string, { title: string; body: string }> = {
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
