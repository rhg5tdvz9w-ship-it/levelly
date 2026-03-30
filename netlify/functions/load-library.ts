import type { Handler } from "@netlify/functions";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
const GITHUB_REPO  = process.env.GITHUB_REPO!;
const FILE_PATH    = "library/library.json";
const BRANCH       = "main";

const API = "https://api.github.com";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const res = await fetch(
      `${API}/repos/${GITHUB_REPO}/contents/${FILE_PATH}?ref=${BRANCH}`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    // File doesn't exist yet — return empty library
    if (res.status === 404) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: "[]",
      };
    }

    if (!res.ok) throw new Error(`GitHub GET failed: ${res.status}`);

    const data = await res.json();

    // GitHub returns file content as base64 — decode it
    const decoded = Buffer.from(data.content, "base64").toString("utf-8");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: decoded,
    };
  } catch (err: any) {
    console.error("GitHub load error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
