import { describe, expect, test } from "vitest";
import { detectDialect } from "../../convex/lib/dialect";

describe("detectDialect", () => {
  test("detects es-LATAM via 'vos' / 'che'", () => {
    expect(detectDialect("Che, no sabés cómo me ayudó")).toBe("es-LATAM");
    expect(detectDialect("vos podés probarlo")).toBe("es-LATAM");
  });

  test("detects es-ES via 'vosotros' / 'tío'", () => {
    expect(detectDialect("vosotros podéis probarlo")).toBe("es-ES");
    expect(detectDialect("Tío, mira esto")).toBe("es-ES");
  });

  test("falls back to es-neutral when ambiguous", () => {
    expect(detectDialect("Hola, busco un programador para mi proyecto")).toBe("es-neutral");
  });

  test("case-insensitive markers", () => {
    expect(detectDialect("VOSOTROS deberíais saberlo")).toBe("es-ES");
    expect(detectDialect("CHE, vení a verlo")).toBe("es-LATAM");
  });

  test("ignores partial-word matches", () => {
    // 'tio' inside 'estudio' should NOT trigger es-ES
    expect(detectDialect("Estudio diseño desde casa")).toBe("es-neutral");
  });
});
