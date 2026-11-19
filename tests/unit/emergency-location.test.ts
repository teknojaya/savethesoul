import { describe, expect, it } from "vitest";
import { mapLinks, resolveCoordinates } from "@/features/emergency/location";

describe("Emergency case location → map", () => {
  it("uses exact coordinates written in the location text", () => {
    expect(resolveCoordinates("Device location 24.49012, 54.40655")).toEqual({ lat: 24.49012, lng: 54.40655, precision: "exact" });
  });
  it("falls back to a known area centre, marked approximate", () => {
    expect(resolveCoordinates("Al Reem Island, Abu Dhabi · last known device location")).toMatchObject({ precision: "area", lat: 24.499 });
    expect(resolveCoordinates("Somewhere unknown")).toBeNull();
    expect(resolveCoordinates(null)).toBeNull();
  });
  it("builds Google Maps view, directions and embed links", () => {
    const m = mapLinks({ lat: 24.499, lng: 54.406, precision: "area" });
    expect(m.directions).toBe("https://www.google.com/maps/dir/?api=1&destination=24.49900,54.40600&travelmode=driving");
    expect(m.view).toContain("query=24.49900,54.40600");
    expect(m.embed).toContain("openstreetmap.org/export/embed.html");
    expect(m.embed).toContain("marker=24.49900,54.40600");
  });
});
