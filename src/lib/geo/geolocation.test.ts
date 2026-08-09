import { describe, expect, it } from "vitest";
import { distanceKm, findNearestPlace } from "./geolocation";

describe("distanceKm", () => {
  it("returns 0 for identical positions", () => {
    expect(distanceKm({ lat: 60.4, lon: 5.3 }, { lat: 60.4, lon: 5.3 })).toBe(0);
  });

  it("computes a realistic distance between two known points", () => {
    // Bergen (ENBR) to Oslo (ENGM), roughly 300 km apart.
    const bergen = { lat: 60.2934, lon: 5.2181 };
    const oslo = { lat: 60.1939, lon: 11.1004 };
    const d = distanceKm(bergen, oslo);
    expect(d).toBeGreaterThan(280);
    expect(d).toBeLessThan(350);
  });
});

describe("findNearestPlace", () => {
  const places = [
    { name: "FEDJE", lat: 60.7784, lon: 4.6997 },
    { name: "BERGEN", lat: 60.2934, lon: 5.2181 },
    { name: "OSLO", lat: 60.1939, lon: 11.1004 },
  ];

  it("finds the closest place within range", () => {
    const nearFedje = { lat: 60.78, lon: 4.7 };
    const result = findNearestPlace(nearFedje, places);
    expect(result?.name).toBe("FEDJE");
    expect(result?.distanceKm).toBeLessThan(1);
  });

  it("returns null when nothing is within maxDistanceKm", () => {
    const middleOfNowhere = { lat: 70, lon: 20 };
    expect(findNearestPlace(middleOfNowhere, places, 15)).toBeNull();
  });
});
