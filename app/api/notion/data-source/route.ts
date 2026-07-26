import { NextRequest, NextResponse } from "next/server";
import {
  getBearerToken,
  getNotionHeaders,
  notionError,
  resolvedErrorMessage,
  resolveDataSource,
  sanitizeNotionId,
} from "../notion-utils";

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

export async function POST(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "Notionトークンが必要です" },
      { status: 401 },
    );
  }

  let dataSourceId = "";
  try {
    const body = (await request.json()) as { dataSourceId?: unknown };
    dataSourceId = sanitizeNotionId(body.dataSourceId);
  } catch {
    return NextResponse.json(
      { error: "リクエストの形式が正しくありません" },
      { status: 400 },
    );
  }

  if (!dataSourceId) {
    return NextResponse.json(
      { error: "データベースIDが必要です" },
      { status: 400 },
    );
  }

  const resolved = await resolveDataSource(token, dataSourceId);
  if (!resolved.id) {
    return NextResponse.json(
      { error: resolvedErrorMessage(resolved) },
      { status: resolved.errorStatus ?? 404 },
    );
  }

  const notionResponse = await fetch(
    `https://api.notion.com/v1/data_sources/${resolved.id}/query`,
    {
      method: "POST",
      headers: getNotionHeaders(token),
      body: JSON.stringify({
        page_size: 10,
        sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      }),
    },
  );

  if (!notionResponse.ok) {
    return NextResponse.json(
      { error: await notionError(notionResponse.status, notionResponse) },
      { status: notionResponse.status },
    );
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

  return NextResponse.json({
    dataSourceId: resolved.id,
    titleProperty: resolved.titleProperty,
    pages,
  });
}
