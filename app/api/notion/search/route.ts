import { NextRequest, NextResponse } from "next/server";

const NOTION_VERSION = "2026-03-11";
const MAX_QUERY_LENGTH = 120;

type NotionRichText = {
  plain_text?: string;
};

type NotionPageResult = {
  object: "page";
  id: string;
  url?: string;
  last_edited_time?: string;
  properties?: Record<
    string,
    {
      type?: string;
      title?: NotionRichText[];
    }
  >;
};

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return null;

  const token = authorization.slice("Bearer ".length).trim();
  if (!token || token.length > 512) return null;

  return token;
}

function getTitle(page: NotionPageResult) {
  const titleProperty = Object.values(page.properties ?? {}).find(
    (property) => property.type === "title" && Array.isArray(property.title),
  );

  const title = titleProperty?.title
    ?.map((item) => item.plain_text ?? "")
    .join("")
    .trim();

  return title || "無題のNotionページ";
}

function sanitizeQuery(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, MAX_QUERY_LENGTH);
}

export async function POST(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Notionトークンが必要です" },
      { status: 401 },
    );
  }

  let query = "";
  try {
    const body = (await request.json()) as { query?: unknown };
    query = sanitizeQuery(body.query);
  } catch {
    return NextResponse.json(
      { error: "リクエストの形式が正しくありません" },
      { status: 400 },
    );
  }

  const notionResponse = await fetch("https://api.notion.com/v1/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_VERSION,
    },
    body: JSON.stringify({
      query,
      filter: {
        property: "object",
        value: "page",
      },
      page_size: 10,
    }),
  });

  if (!notionResponse.ok) {
    const status = notionResponse.status;
    const error =
      status === 401
        ? "Notionトークンを確認してください"
        : status === 403 || status === 404
          ? "Notion側でページ権限を確認してください"
          : status === 429
            ? "Notion APIの制限中です。少し待ってください"
            : "Notionに接続できませんでした";

    return NextResponse.json({ error }, { status });
  }

  const data = (await notionResponse.json()) as {
    results?: Array<NotionPageResult | { object?: string }>;
  };

  const pages = (data.results ?? [])
    .filter((result): result is NotionPageResult => result.object === "page")
    .map((page) => ({
      id: page.id,
      title: getTitle(page),
      url: page.url ?? `https://www.notion.so/${page.id.replaceAll("-", "")}`,
      editedAt: page.last_edited_time ?? null,
    }));

  return NextResponse.json({ pages });
}
