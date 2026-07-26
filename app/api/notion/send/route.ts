import { NextRequest, NextResponse } from "next/server";
import {
  getBearerToken,
  getNotionHeaders,
  notionError,
  resolvedErrorMessage,
  resolveDataSource,
  sanitizeNotionId,
} from "../notion-utils";

const MAX_TITLE_LENGTH = 180;
const MAX_BLOCK_TEXT_LENGTH = 1800;

type BlockType = "text" | "heading" | "todo";

type SwiftBlock = {
  type?: BlockType;
  text?: string;
  checked?: boolean;
};

type SwiftPage = {
  title?: string;
  blocks?: SwiftBlock[];
  category?: string;
  memo?: boolean;
  idea?: boolean;
  progress?: string;
};

type NotionBlock =
  | {
      object: "block";
      type: "heading_2";
      heading_2: { rich_text: Array<{ text: { content: string } }> };
    }
  | {
      object: "block";
      type: "paragraph";
      paragraph: { rich_text: Array<{ text: { content: string } }> };
    }
  | {
      object: "block";
      type: "to_do";
      to_do: {
        checked: boolean;
        rich_text: Array<{ text: { content: string } }>;
      };
    };

function sanitizeTitleProperty(value: unknown) {
  if (typeof value !== "string") return "Name";
  return value.trim().slice(0, 80) || "Name";
}

function sanitizeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\u0000/g, "").trim().slice(0, maxLength);
}

function richText(content: string) {
  return content ? [{ text: { content } }] : [];
}

function todayInTokyo() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function createProperties(
  titleProperty: string,
  title: string,
  dateProperty?: string,
  categoryProperty?: string,
  category?: string,
  memoProperty?: string,
  memo?: boolean,
  ideaProperty?: string,
  idea?: boolean,
  progressProperty?: { name: string; type: "status" | "select" },
  progress?: string,
) {
  return {
    [titleProperty]: {
      title: [{ text: { content: title } }],
    },
    ...(dateProperty
      ? {
          [dateProperty]: {
            date: {
              start: todayInTokyo(),
            },
          },
        }
      : {}),
    ...(categoryProperty && category
      ? {
          [categoryProperty]: {
            select: {
              name: category,
            },
          },
        }
      : {}),
    ...(memoProperty && memo
      ? {
          [memoProperty]: {
            checkbox: true,
          },
        }
      : {}),
    ...(ideaProperty && idea
      ? {
          [ideaProperty]: {
            checkbox: true,
          },
        }
      : {}),
    ...(progressProperty && progress
      ? {
          [progressProperty.name]:
            progressProperty.type === "status"
              ? {
                  status: {
                    name: progress,
                  },
                }
              : {
                  select: {
                    name: progress,
                  },
                },
        }
      : {}),
  };
}

function toNotionBlocks(page: SwiftPage) {
  const blocks = (page.blocks ?? [])
    .slice(0, 80)
    .map((block): NotionBlock | null => {
      const text = sanitizeText(block.text, MAX_BLOCK_TEXT_LENGTH);
      if (!text) return null;

      if (block.type === "heading") {
        return {
          object: "block",
          type: "heading_2",
          heading_2: {
            rich_text: richText(text),
          },
        };
      }

      if (block.type === "todo") {
        return {
          object: "block",
          type: "to_do",
          to_do: {
            checked: Boolean(block.checked),
            rich_text: richText(text),
          },
        };
      }

      return {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: richText(text),
        },
      };
    })
    .filter((block): block is NotionBlock => block !== null);

  return blocks;
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
  let titleProperty = "Name";
  let page: SwiftPage = {};

  try {
    const body = (await request.json()) as {
      dataSourceId?: unknown;
      titleProperty?: unknown;
      page?: SwiftPage;
    };
    dataSourceId = sanitizeNotionId(body.dataSourceId);
    titleProperty = sanitizeTitleProperty(body.titleProperty);
    page = body.page ?? {};
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

  const title = sanitizeText(page.title, MAX_TITLE_LENGTH) || "無題";
  const category = sanitizeText(page.category, 40);
  const progress = sanitizeText(page.progress, 40);
  const resolvedTitleProperty =
    titleProperty === "Name" ? resolved.titleProperty : titleProperty;
  const children = toNotionBlocks(page);

  const notionResponse = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: getNotionHeaders(token),
    body: JSON.stringify({
      parent: {
        type: "data_source_id",
        data_source_id: resolved.id,
      },
      properties: {
        ...createProperties(
          resolvedTitleProperty,
          title,
          resolved.dateProperty,
          resolved.categoryProperty,
          category,
          resolved.memoProperty,
          Boolean(page.memo),
          resolved.ideaProperty,
          Boolean(page.idea),
          resolved.progressProperty,
          progress,
        ),
      },
      ...(children.length > 0 ? { children } : {}),
    }),
  });

  if (!notionResponse.ok) {
    return NextResponse.json(
      { error: await notionError(notionResponse.status, notionResponse) },
      { status: notionResponse.status },
    );
  }

  const data = (await notionResponse.json()) as {
    id: string;
    url?: string;
    last_edited_time?: string;
  };

  return NextResponse.json({
    dataSourceId: resolved.id,
    titleProperty: resolvedTitleProperty,
    page: {
      id: data.id,
      title,
      url: data.url ?? `https://www.notion.so/${data.id.replaceAll("-", "")}`,
      editedAt: data.last_edited_time ?? null,
    },
  });
}
