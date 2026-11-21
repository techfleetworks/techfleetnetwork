// PUB-ENROLLMENT-001: the enrollment-state logic that drives the public pill + CTA.
// register_now/live = registerable (open + "Register"); a published upcoming cohort
// not yet open = coming_soon ("Opening soon"); nothing = none ("Enrollment not open").
import { describe, it, expect } from "vitest";
import {
  isRegisterable,
  enrollmentStateOf,
  type PublicCohort,
} from "@/hooks/use-public-catalog";

const cohort = (registration_status: PublicCohort["registration_status"]): PublicCohort => ({
  id: "x",
  label: "Jan 2027",
  start_date: "2027-01-18",
  end_date: "2027-02-09",
  registration_url: "https://gum.co/x",
  registration_status,
});

describe("isRegisterable (PUB-ENROLLMENT-001)", () => {
  it("register_now and live are registerable; coming_soon and finished are not", () => {
    expect(isRegisterable(cohort("register_now"))).toBe(true);
    expect(isRegisterable(cohort("live"))).toBe(true);
    expect(isRegisterable(cohort("coming_soon"))).toBe(false);
    expect(isRegisterable(cohort("finished"))).toBe(false);
  });
});

describe("enrollmentStateOf (PUB-ENROLLMENT-001)", () => {
  it("open when any cohort is registerable (even alongside coming_soon)", () => {
    expect(enrollmentStateOf([cohort("coming_soon"), cohort("register_now")])).toBe("open");
    expect(enrollmentStateOf([cohort("live")])).toBe("open");
  });

  it("coming_soon when the only cohorts are upcoming (the real Jan-2027 prod state)", () => {
    expect(enrollmentStateOf([cohort("coming_soon")])).toBe("coming_soon");
  });

  it("none when there are no cohorts, only finished, or null/undefined", () => {
    expect(enrollmentStateOf([])).toBe("none");
    expect(enrollmentStateOf([cohort("finished")])).toBe("none");
    expect(enrollmentStateOf(null)).toBe("none");
    expect(enrollmentStateOf(undefined)).toBe("none");
  });
});
