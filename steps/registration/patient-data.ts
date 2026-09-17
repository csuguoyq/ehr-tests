// steps/registration/patient-data.ts — test-data generators for patient
// creation (naming convention from skills/ehr-workflow/registration).
//
// Last Name = Testbot_<YYMMDDHHmm> (unique per minute).
// SSN = <digit sum of YY><MMDD><4 random digits> grouped 3-2-4 (user
// convention 2026-09-16, tail randomized 2026-09-17): first digit = two-digit
// year digits summed (2026 → "26" → 2+6 = 8), then month/day MMDD, then a
// RANDOM 4-digit tail — same-minute runs collided on the old HHmm tail.

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
  const yy = String(now.getFullYear()).slice(2);
  const yearSum = Number(yy[0]) + Number(yy[1]);
  // Collapse to one digit; dodge head "9" (EHR rejects 9XX areas).
  let head = String(yearSum % 10);
  if (head === "9") head = "8";
  // Random 4-digit tail: same-minute runs collided on the old HHmm tail
  // (user instruction 2026-09-17). 0000-0999 avoided to keep the tail
  // nonzero and 4 digits wide.
  const tail = String(1000 + Math.floor(Math.random() * 9000));
  const mmdd = p2(now.getMonth() + 1) + p2(now.getDate());
  const digits = head + mmdd + tail;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function p2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Random D.O.B. as MM/DD/YYYY: current month/day, random year 1980-2005. */
export function generateDob(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const year = 1980 + Math.floor(Math.random() * 26);
  return `${p(now.getMonth() + 1)}/${p(now.getDate())}/${year}`;
}
