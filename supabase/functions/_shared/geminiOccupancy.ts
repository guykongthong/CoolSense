// Gemini vision-based people counting for a single camera frame.
// Kept separate from occupancy-vision/index.ts so the request/response
// shaping can be unit tested without a live network call.

export const GEMINI_MODEL = "gemini-2.5-flash";
export const VERTEX_LOCATION = "us-central1";

const COUNT_PROMPT =
  "Count the number of people visible in this image, including people who are only " +
  "partially visible or occluded by others or objects. Respond with your best estimate " +
  "of the total headcount.";

const PEOPLE_COUNT_SCHEMA = {
  type: "object",
  properties: {
    people_count: { type: "integer", minimum: 0 },
  },
  required: ["people_count"],
} as const;

export interface GeminiRequestBody {
  contents: Array<{
    role: "user";
    parts: Array<
      { text: string } | { inline_data: { mime_type: string; data: string } }
    >;
  }>;
  generationConfig: {
    responseMimeType: string;
    responseSchema: typeof PEOPLE_COUNT_SCHEMA;
  };
}

export function buildGeminiRequestBody(base64Image: string, mimeType: string): GeminiRequestBody {
  return {
    contents: [
      {
        role: "user",
        parts: [
          { text: COUNT_PROMPT },
          { inline_data: { mime_type: mimeType, data: base64Image } },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: PEOPLE_COUNT_SCHEMA,
    },
  };
}

/**
 * Vertex AI's generateContent endpoint for a publisher model — same request/response
 * shape as the Gemini Developer API, but authenticated via a service account bearer
 * token (see googleServiceAuth.ts) instead of an API key query param.
 */
export function vertexEndpointUrl(projectId: string, model: string = GEMINI_MODEL, location: string = VERTEX_LOCATION): string {
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;
}

/** Thrown when a Gemini response doesn't contain a usable people_count. */
export class GeminiParseError extends Error {}

export function parseGeminiPeopleCount(responseJson: unknown): number {
  const text = extractResponseText(responseJson);
  if (text === undefined) {
    throw new GeminiParseError("Gemini response contained no candidate text");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GeminiParseError(`Gemini response text was not valid JSON: ${text}`);
  }

  const peopleCount = (parsed as { people_count?: unknown } | null)?.people_count;
  if (typeof peopleCount !== "number" || !Number.isInteger(peopleCount) || peopleCount < 0) {
    throw new GeminiParseError(`Gemini response people_count was not a non-negative integer: ${text}`);
  }

  return peopleCount;
}

function extractResponseText(responseJson: unknown): string | undefined {
  // deno-lint-ignore no-explicit-any
  const candidates = (responseJson as any)?.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return undefined;
  const parts = candidates[0]?.content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) return undefined;
  const textPart = parts.find((part: { text?: unknown }) => typeof part.text === "string");
  return textPart?.text;
}
