/**
 * Preference options offered in the trip builder and package enquiry form.
 * These are customer preferences passed to staff, not priced products.
 */

export const ACCOMMODATION_OPTIONS = [
  { value: "no-preference", label: "No preference" },
  { value: "budget", label: "Budget" },
  { value: "standard", label: "Standard (3-star or similar)" },
  { value: "deluxe", label: "Deluxe (4-star or similar)" },
  { value: "luxury", label: "Luxury (5-star or similar)" },
  { value: "houseboat", label: "Include a houseboat stay" },
] as const;

export const TRANSPORT_OPTIONS = [
  { value: "no-preference", label: "No preference" },
  { value: "sedan", label: "Private car (sedan)" },
  { value: "suv", label: "Private SUV" },
  { value: "tempo-traveller", label: "Tempo Traveller for larger groups" },
  { value: "own", label: "I will arrange my own transport" },
] as const;

export const INTEREST_OPTIONS = [
  { value: "shikara-houseboats", label: "Shikara rides & houseboats" },
  { value: "gardens-heritage", label: "Mughal gardens & heritage" },
  { value: "snow", label: "Snow, gondola & skiing" },
  { value: "meadows-treks", label: "Meadows & easy treks" },
  { value: "rafting", label: "River rafting" },
  { value: "family", label: "Family-friendly pace" },
  { value: "honeymoon", label: "Honeymoon" },
  { value: "photography", label: "Photography" },
  { value: "food-crafts", label: "Local food & crafts" },
] as const;

type OptionValue<T extends readonly { value: string }[]> = T[number]["value"];
export type AccommodationValue = OptionValue<typeof ACCOMMODATION_OPTIONS>;
export type TransportValue = OptionValue<typeof TRANSPORT_OPTIONS>;
export type InterestValue = OptionValue<typeof INTEREST_OPTIONS>;

function labelFor(options: readonly { value: string; label: string }[], value: string | null | undefined): string | null {
  if (!value) return null;
  return options.find((o) => o.value === value)?.label ?? value;
}

export const accommodationLabel = (v: string | null | undefined) => labelFor(ACCOMMODATION_OPTIONS, v);
export const transportLabel = (v: string | null | undefined) => labelFor(TRANSPORT_OPTIONS, v);
export const interestLabel = (v: string) => labelFor(INTEREST_OPTIONS, v) ?? v;

export const LIMITS = {
  maxLegs: 8,
  maxDaysPerLeg: 30,
  maxTotalDays: 30,
  maxAdults: 20,
  maxChildren: 10,
  maxAdvanceMonths: 24,
} as const;
