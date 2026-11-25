// `Intl.supportedValuesOf` omits UTC and returns canonical IANA ids only.
export const TIMEZONES: readonly string[] = ["UTC", ...Intl.supportedValuesOf("timeZone")];

export const TIMEZONE_PLACEHOLDER = "Select timezone";

export function fillTimezoneSelect(doc: Document, select: HTMLSelectElement, current = ""): void {
  const zones = current && !TIMEZONES.includes(current) ? [current, ...TIMEZONES] : TIMEZONES;

  const option = (value: string, label: string) => {
    const element = doc.createElement("option");
    element.value = value;
    element.textContent = label;
    return element;
  };

  select.replaceChildren(option("", TIMEZONE_PLACEHOLDER), ...zones.map((zone) => option(zone, zone)));
  select.value = current;
}
