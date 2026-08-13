import { assertEquals } from "jsr:@std/assert@1";
import { buildJwtSigningInput } from "./googleServiceAuth.ts";

function decodeSegment(segment: string): unknown {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(padded));
}

Deno.test("buildJwtSigningInput encodes header and claims as base64url JSON segments", () => {
  const input = buildJwtSigningInput("sa@project.iam.gserviceaccount.com", "https://www.googleapis.com/auth/cloud-platform", 1000);
  const [headerSeg, claimsSeg] = input.split(".");

  assertEquals(decodeSegment(headerSeg), { alg: "RS256", typ: "JWT" });
  assertEquals(decodeSegment(claimsSeg), {
    iss: "sa@project.iam.gserviceaccount.com",
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat: 1000,
    exp: 4600,
  });
});
