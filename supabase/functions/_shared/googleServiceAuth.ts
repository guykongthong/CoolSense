// Exchanges a GCP service account key for a short-lived OAuth access token
// by signing a JWT assertion (RS256, via Web Crypto) and trading it at
// Google's token endpoint — no external Google Auth library needed.
//
// Used by occupancy-vision to call Vertex AI's generateContent, since the
// Gemini Developer API's own prepay credit wallet doesn't accept this
// project's GCP billing credit (see CLAUDE.md's occupancy-vision section).

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GRANT_TYPE = "urn:ietf:params:oauth:grant-type:jwt-bearer";
const DEFAULT_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

export interface ServiceAccountCredentials {
  project_id: string;
  client_email: string;
  private_key: string;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let cached: CachedToken | null = null;

function base64url(bytes: Uint8Array): string {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlFromString(s: string): string {
  return base64url(new TextEncoder().encode(s));
}

/** Builds the unsigned "header.claims" JWT segment — pure, testable without touching crypto. */
export function buildJwtSigningInput(clientEmail: string, scope: string, nowSeconds: number): string {
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: clientEmail,
    scope,
    aud: TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  };
  return `${base64urlFromString(JSON.stringify(header))}.${base64urlFromString(JSON.stringify(claims))}`;
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const der = Uint8Array.from(
    atob(pem.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s+/g, "")),
    (c) => c.charCodeAt(0),
  );
  return await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

async function signJwt(credentials: ServiceAccountCredentials, scope: string): Promise<string> {
  const signingInput = buildJwtSigningInput(credentials.client_email, scope, Math.floor(Date.now() / 1000));
  const key = await importPrivateKey(credentials.private_key);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64url(new Uint8Array(signature))}`;
}

/** Returns a cached access token when it still has >60s of life, otherwise mints a fresh one. */
export async function getAccessToken(
  credentials: ServiceAccountCredentials,
  scope: string = DEFAULT_SCOPE,
): Promise<string> {
  if (cached && cached.expiresAt - Date.now() > 60_000) {
    return cached.accessToken;
  }

  const assertion = await signJwt(credentials, scope);
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: GRANT_TYPE, assertion }),
  });

  if (!res.ok) {
    throw new Error(`Failed to exchange service account JWT for an access token (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cached = { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cached.accessToken;
}
