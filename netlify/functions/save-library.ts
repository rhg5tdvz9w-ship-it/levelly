import type { Handler } from "@netlify/functions";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
const GITHUB_REPO  = process.env.GITHUB_REPO!;   // e.g. "rhg5tdvz9w-ship-it/levelly"
const FILE_PATH    = "library/library.json";       // where the file lives in your repo
const BRANCH       = "main";

const API = "https://api.github.com";

// Get the current file's SHA (GitHub needs this to update an existing file)
async function getFileSha(): Promise<string | null> {
  const res = await fetch(
    `${API}/repos/${GITHUB_REPO}/contents/${FILE_PATH}?ref=${BRANCH}`,
    {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
    }
  );
  if (res.status === 404) return null;          // file doesn't exist yet — that's fine
  if (!res.ok) throw new Error(`GitHub GET failed: ${res.status}`);
  const data = await res.json();
  return data.sha as string;
}

// Save (create or update) the file
async function saveFile(content: string, sha: string | null) {
  const body: Record<string, string> = {
    message: `chore: auto-save library ${new Date().toISOString()}`,
    content: Buffer.from(content).toString("base64"),
    branch:  BRANCH,
  };
  if (sha) body.sha = sha;                      // required when updating an existing file

  const res = await fetch(
    `${API}/repos/${GITHUB_REPO}/contents/${FILE_PATH}`,
    {
      method:  "PUT",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept:        "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub PUT failed: ${res.status} — ${err}`);
  }
  return res.json();
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const library = event.body ?? "[]";

    // Validate it's actually JSON before saving
    JSON.parse(library);

    const sha    = await getFileSha();
    await saveFile(library, sha);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true }),
    };
  } catch (err: any) {
    console.error("GitHub save error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
