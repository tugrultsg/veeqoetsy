const MAX_RETRIES = 3;

export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = MAX_RETRIES
): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const resp = await fetch(url, options);

    // Rate limited
    if (resp.status === 429) {
      const retryAfter = parseInt(resp.headers.get("retry-after") || "5", 10);
      console.warn(`Rate limited on ${url}, waiting ${retryAfter}s`);
      await sleep(retryAfter * 1000);
      continue;
    }

    // Server error - retry
    if (resp.status >= 500) {
      console.warn(`Server error ${resp.status} on ${url} (attempt ${attempt}/${retries})`);
      if (attempt < retries) {
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }
    }

    return resp;
  }

  throw new Error(`Failed after ${retries} retries: ${url}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
