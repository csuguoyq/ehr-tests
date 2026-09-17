// steps/registration/patient-data.ts — test-data generators for patient
// creation (naming convention from skills/ehr-workflow/registration).
//
// Last Name = Testbot_<YYMMDDHHmm> (unique per minute).
// SSN = <digit sum of YY><MMDD><HHmm> grouped 3-2-4 (user convention 2026-09-16):
// first digit = two-digit year digits summed (2026 → "26" → 2+6 = 8),
// then month/day MMDD, then clock time HHmm (17:44 → 1744).

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
  const yy = String(now.getFullYear()).slice(2);
  const yearSum = Number(yy[0]) + Number(yy[1]);
  // Collapse to one digit; dodge head "9" (EHR rejects 9XX areas), and the
  // midnight tail "0000", deterministically — no retry loop needed.
  let head = String(yearSum % 10);
  if (head === "9") head = "8";
  const hhmm = p(now.getHours()) + p(now.getMinutes());
  const tail = hhmm === "0000" ? "0001" : hhmm;
  const digits = head + p(now.getMonth() + 1) + p(now.getDate()) + tail;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

/** Random D.O.B. as MM/DD/YYYY: current month/day, random year 1980-2005. */
export function generateDob(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const year = 1980 + Math.floor(Math.random() * 26);
  return `${p(now.getMonth() + 1)}/${p(now.getDate())}/${year}`;
}
