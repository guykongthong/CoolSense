import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { buildGeminiRequestBody, GeminiParseError, parseGeminiPeopleCount, vertexEndpointUrl } from "./geminiOccupancy.ts";

function candidateResponse(text: string) {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

Deno.test("buildGeminiRequestBody embeds the image as inline_data with the given mime type", () => {
  const body = buildGeminiRequestBody("ZmFrZS1pbWFnZQ==", "image/jpeg");
  const imagePart = body.contents[0].parts.find((p) => "inline_data" in p) as
    | { inline_data: { mime_type: string; data: string } }
    | undefined;
  assertEquals(imagePart?.inline_data.mime_type, "image/jpeg");
  assertEquals(imagePart?.inline_data.data, "ZmFrZS1pbWFnZQ==");
  assertEquals(body.generationConfig.responseMimeType, "application/json");
});

Deno.test("vertexEndpointUrl targets the project/location's publisher model", () => {
  const url = vertexEndpointUrl("my-project", "gemini-2.5-flash", "us-central1");
  assertEquals(
    url,
    "https://us-central1-aiplatform.googleapis.com/v1/projects/my-project/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent",
  );
});

Deno.test("parseGeminiPeopleCount extracts a valid integer count", () => {
  const count = parseGeminiPeopleCount(candidateResponse(JSON.stringify({ people_count: 7 })));
  assertEquals(count, 7);
});

Deno.test("parseGeminiPeopleCount accepts zero", () => {
  const count = parseGeminiPeopleCount(candidateResponse(JSON.stringify({ people_count: 0 })));
  assertEquals(count, 0);
});

Deno.test("parseGeminiPeopleCount rejects a negative count", () => {
  assertThrows(
    () => parseGeminiPeopleCount(candidateResponse(JSON.stringify({ people_count: -1 }))),
    GeminiParseError,
  );
});

Deno.test("parseGeminiPeopleCount rejects a non-integer count", () => {
  assertThrows(
    () => parseGeminiPeopleCount(candidateResponse(JSON.stringify({ people_count: 3.5 }))),
    GeminiParseError,
  );
});

Deno.test("parseGeminiPeopleCount rejects malformed JSON text", () => {
  assertThrows(() => parseGeminiPeopleCount(candidateResponse("not json")), GeminiParseError);
});

Deno.test("parseGeminiPeopleCount rejects a response with no candidates", () => {
  assertThrows(() => parseGeminiPeopleCount({ candidates: [] }), GeminiParseError);
});

Deno.test("parseGeminiPeopleCount rejects a response missing text parts entirely", () => {
  assertThrows(() => parseGeminiPeopleCount({ candidates: [{ content: { parts: [] } }] }), GeminiParseError);
});
