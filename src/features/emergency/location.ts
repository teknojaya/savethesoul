/**
 * Turns a case's location text into map coordinates. Exact coordinates written in the text
 * ("24.4990, 54.4060") are used as-is; otherwise a known Abu Dhabi area resolves to its centre
 * (marked approximate). Returns null when nothing can be located.
 */
export interface CaseCoordinates {
  lat: number;
  lng: number;
  precision: "exact" | "area";
}

const AREAS: [RegExp, number, number][] = [
  [/al reem island/i, 24.499, 54.406],
  [/khalifa city/i, 24.4195, 54.5785],
  [/mussafah/i, 24.355, 54.502],
  [/yas island/i, 24.4889, 54.6084],
  [/al ain/i, 24.2075, 55.7447],
  [/saadiyat/i, 24.5446, 54.4337],
  [/al raha/i, 24.4466, 54.6045],
];

export function resolveCoordinates(text: string | null | undefined): CaseCoordinates | null {
  if (!text) return null;
  const m = text.match(/(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/);
  if (m) {
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng, precision: "exact" };
  }
  for (const [re, lat, lng] of AREAS) if (re.test(text)) return { lat, lng, precision: "area" };
  return null;
}

export const mapLinks = (c: CaseCoordinates) => {
  const q = `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`;
  return {
    label: q,
    view: `https://www.google.com/maps/search/?api=1&query=${q}`,
    directions: `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`,
    // OpenStreetMap allows keyless embedding; Google Maps is used for viewing and turn-by-turn directions.
    embed: (() => {
      const d = c.precision === "exact" ? 0.006 : 0.015;
      const bbox = [c.lng - d, c.lat - d, c.lng + d, c.lat + d].map((n) => n.toFixed(5)).join(",");
      return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${c.lat.toFixed(5)},${c.lng.toFixed(5)}`;
    })(),
  };
};
