import { COUNTRIES } from "./countries";

/**
 * State / province / region lists for the countries where a subdivision is commonly
 * collected (US, Canada, Australia). The Welcome Flow Profile step and the profile editor
 * show a State select only when the chosen country has a list here; every other country has
 * no subdivision field (data minimization — we add no region we won't use).
 *
 * `profiles.country` stores the country NAME, so lookups go name -> ISO code -> regions.
 * `profiles.state` stores the region NAME (human-readable, like country), not the code.
 */
export interface Region {
  /** Postal/ISO subdivision code (stable key). */
  code: string;
  /** Human-readable name — this is what is stored in `profiles.state`. */
  name: string;
}

const US_STATES: Region[] = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "PR", name: "Puerto Rico" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
];

const CA_PROVINCES: Region[] = [
  { code: "AB", name: "Alberta" },
  { code: "BC", name: "British Columbia" },
  { code: "MB", name: "Manitoba" },
  { code: "NB", name: "New Brunswick" },
  { code: "NL", name: "Newfoundland and Labrador" },
  { code: "NS", name: "Nova Scotia" },
  { code: "NT", name: "Northwest Territories" },
  { code: "NU", name: "Nunavut" },
  { code: "ON", name: "Ontario" },
  { code: "PE", name: "Prince Edward Island" },
  { code: "QC", name: "Quebec" },
  { code: "SK", name: "Saskatchewan" },
  { code: "YT", name: "Yukon" },
];

const AU_STATES: Region[] = [
  { code: "ACT", name: "Australian Capital Territory" },
  { code: "NSW", name: "New South Wales" },
  { code: "NT", name: "Northern Territory" },
  { code: "QLD", name: "Queensland" },
  { code: "SA", name: "South Australia" },
  { code: "TAS", name: "Tasmania" },
  { code: "VIC", name: "Victoria" },
  { code: "WA", name: "Western Australia" },
];

/** Keyed by ISO country code. Add a country here only when its subdivision is collected. */
const REGIONS_BY_COUNTRY_CODE: Record<string, Region[]> = {
  US: US_STATES,
  CA: CA_PROVINCES,
  AU: AU_STATES,
};

const CODE_BY_COUNTRY_NAME = new Map(COUNTRIES.map((c) => [c.name, c.code]));

/** Regions for a country given its NAME (as stored in `profiles.country`); [] if none. */
export function regionsForCountryName(countryName: string | null | undefined): Region[] {
  if (!countryName) return [];
  const code = CODE_BY_COUNTRY_NAME.get(countryName);
  return (code && REGIONS_BY_COUNTRY_CODE[code]) || [];
}

/** True when the country collects a state/province/region. */
export function countryHasRegions(countryName: string | null | undefined): boolean {
  return regionsForCountryName(countryName).length > 0;
}
