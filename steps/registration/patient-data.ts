// steps/registration/patient-data.ts — test-data generators for patient
// creation (naming convention from skills/ehr-workflow/registration).
//
// Last Name = Testbot_<YYMMDDHHmm> (unique per minute).
// SSN = <YY><MM><DD><NNN random> grouped 3-2-4, avoiding the rejected
// patterns (9XX-, 000-, 666-, XX-00-, XX-XX-0000) so duplicate checks pass.

export function generateLastName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    "Testbot_" +
    String(now.getFullYear()).slice(2) +
    p(now.getMonth() + 1) +
    p(now.getDate()) +
    p(now.getHours()) +
    p(now.getMinutes())
  );
}

export function generateSsn(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  for (;;) {
    const nnn = String(Math.floor(100 + Math.random() * 900));
    const digits = String(now.getFullYear()).slice(2) + p(now.getMonth() + 1) + p(now.getDate()) + nnn;
    // Reject the patterns the duplicate check bounces: 9XX-, 000-, 666-,
    // XX-00- (middle pair zeroed), XX-XX-0000 (last four zeroed).
    const bad =
      digits[0] === "9" ||
      digits.startsWith("000") ||
      digits.startsWith("666") ||
      digits.slice(3, 5) === "00" ||
      digits.endsWith("0000");
    if (bad) continue;
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  }
}

/** Random D.O.B. as MM/DD/YYYY: current month/day, random year 1980-2005. */
export function generateDob(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const year = 1980 + Math.floor(Math.random() * 26);
  return `${p(now.getMonth() + 1)}/${p(now.getDate())}/${year}`;
}
