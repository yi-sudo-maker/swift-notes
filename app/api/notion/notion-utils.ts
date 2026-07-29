import { NextRequest } from "next/server";

export const NOTION_VERSION = "2026-03-11";

type DataSourceSchema = {
  id: string;
  properties?: Record<string, { type?: string }>;
};

type ProgressProperty = {
  name: string;
  type: "status" | "select";
};

type DatabaseSchema = {
  data_sources?: Array<{ id?: string; name?: string }>;
};

type NotionErrorBody = {
  code?: string;
  message?: string;
};

async function readNotionError(response: Response) {
  try {
    const body = (await response.json()) as NotionErrorBody;
    return [body.code, body.message].filter(Boolean).join(": ");
  } catch {
    return response.statusText;
  }
}

export function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return null;

  const token = authorization.slice("Bearer ".length).trim();
  if (!token || token.length > 512) return null;

  return token;
}

function getOptionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value || "";
}

export function getNotionConfig() {
  return {
    token: getOptionalEnv("NOTION_TOKEN"),
    dataSourceId: sanitizeNotionId(getOptionalEnv("NOTION_DATA_SOURCE_ID")),
    titleProperty: getOptionalEnv("NOTION_TITLE_PROPERTY") || "Name",
    accessKey: getOptionalEnv("APP_ACCESS_KEY"),
  };
}

export function getNotionToken(request: NextRequest) {
  return getBearerToken(request) ?? getNotionConfig().token;
}

export function getRequestAccessKey(request: NextRequest) {
  return request.headers.get("x-app-access-key")?.trim() ?? "";
}

export function isAccessAllowed(request: NextRequest) {
  const { accessKey } = getNotionConfig();
  if (!accessKey) return true;

  return getRequestAccessKey(request) === accessKey;
}

export function sanitizeNotionId(value: unknown) {
  if (typeof value !== "string") return "";

  const trimmed = value.trim();
  const fromUrl = trimmed.match(/[0-9a-f]{32}/i)?.[0];
  const candidate = fromUrl ?? trimmed.replaceAll("-", "");

  return /^[0-9a-f]{32}$/i.test(candidate) ? candidate : "";
}

export function getNotionHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Notion-Version": NOTION_VERSION,
  };
}

export function findTitleProperty(
  properties: DataSourceSchema["properties"],
  fallback = "Name",
) {
  return (
    Object.entries(properties ?? {}).find(([, property]) => property.type === "title")
      ?.[0] ?? fallback
  );
}

export function findDateProperty(properties: DataSourceSchema["properties"]) {
  return Object.entries(properties ?? {}).find(([, property]) => property.type === "date")
    ?.[0];
}

export function findCategoryProperty(properties: DataSourceSchema["properties"]) {
  const preferredNames = ["種別", "種類", "カテゴリ", "カテゴリー", "タイプ", "Category", "Type"];
  const entries = Object.entries(properties ?? {});
  const preferred = preferredNames.find((name) => properties?.[name]?.type === "select");

  return preferred ?? entries.find(([, property]) => property.type === "select")?.[0];
}

function normalizePropertyName(name: string) {
  return name.replace(/\s+/g, "").toLowerCase();
}

function findPropertyByAliases(
  properties: DataSourceSchema["properties"],
  type: string,
  aliases: string[],
) {
  const normalizedAliases = aliases.map(normalizePropertyName);

  return Object.entries(properties ?? {}).find(
    ([name, property]) =>
      property.type === type &&
      normalizedAliases.includes(normalizePropertyName(name)),
  )?.[0];
}

export function findCheckboxProperties(properties: DataSourceSchema["properties"]) {
  return {
    memoProperty: findPropertyByAliases(properties, "checkbox", ["メモ", "めも", "memo"]),
    ideaProperty: findPropertyByAliases(properties, "checkbox", [
      "アイデア",
      "アイディア",
      "idea",
      "ideas",
    ]),
  };
}

export function findProgressProperty(
  properties: DataSourceSchema["properties"],
): ProgressProperty | undefined {
  const progressName = findPropertyByAliases(properties, "status", ["進捗", "status"]) ??
    findPropertyByAliases(properties, "select", ["進捗", "status"]);
  const progress = progressName ? properties?.[progressName] : undefined;
  if (progress?.type === "status" || progress?.type === "select") {
    return {
      name: progressName,
      type: progress.type,
    };
  }

  return undefined;
}

export async function resolveDataSource(
  token: string,
  databaseOrDataSourceId: string,
) {
  const dataSourceResponse = await fetch(
    `https://api.notion.com/v1/data_sources/${databaseOrDataSourceId}`,
    {
      headers: getNotionHeaders(token),
    },
  );

  if (dataSourceResponse.ok) {
    const dataSource = (await dataSourceResponse.json()) as DataSourceSchema;
    return {
      id: dataSource.id,
      titleProperty: findTitleProperty(dataSource.properties),
      dateProperty: findDateProperty(dataSource.properties),
      categoryProperty: findCategoryProperty(dataSource.properties),
      progressProperty: findProgressProperty(dataSource.properties),
      ...findCheckboxProperties(dataSource.properties),
    };
  }
  const dataSourceError = await readNotionError(dataSourceResponse);

  const databaseResponse = await fetch(
    `https://api.notion.com/v1/databases/${databaseOrDataSourceId}`,
    {
      headers: getNotionHeaders(token),
    },
  );

  if (!databaseResponse.ok) {
    return {
      errorStatus: databaseResponse.status,
      errorDetail: await readNotionError(databaseResponse),
      attemptedId: databaseOrDataSourceId,
      dataSourceError,
    };
  }

  const database = (await databaseResponse.json()) as DatabaseSchema;
  const dataSourceId = database.data_sources?.find((source) => source.id)?.id;

  if (!dataSourceId) {
    return {
      errorStatus: 404,
      errorDetail: "データベースから送信用IDを取得できませんでした",
      attemptedId: databaseOrDataSourceId,
      dataSourceError,
    };
  }

  const schemaResponse = await fetch(
    `https://api.notion.com/v1/data_sources/${dataSourceId}`,
    {
      headers: getNotionHeaders(token),
    },
  );

  if (!schemaResponse.ok) {
    return {
      errorStatus: schemaResponse.status,
      errorDetail: await readNotionError(schemaResponse),
      attemptedId: dataSourceId,
      dataSourceError,
    };
  }

  const schema = (await schemaResponse.json()) as DataSourceSchema;
  return {
    id: dataSourceId,
    titleProperty: findTitleProperty(schema.properties),
    dateProperty: findDateProperty(schema.properties),
    categoryProperty: findCategoryProperty(schema.properties),
    progressProperty: findProgressProperty(schema.properties),
    ...findCheckboxProperties(schema.properties),
  };
}

export async function notionError(status: number, response?: Response) {
  const detail = response ? await readNotionError(response) : "";
  const suffix = detail ? `（Notion: ${detail}）` : "";

  if (status === 401) return "Notionトークンを確認してください";
  if (status === 403 || status === 404) {
    return `Notion側でデータベース共有と権限を確認してください${suffix}`;
  }
  if (status === 429) return "Notion APIの制限中です。少し待ってください";
  return `Notionデータベースに接続できませんでした${suffix}`;
}

export function resolvedErrorMessage(resolved: {
  errorStatus?: number;
  errorDetail?: string;
  attemptedId?: string;
  dataSourceError?: string;
}) {
  const base =
    resolved.errorStatus === 401
      ? "Notionトークンを確認してください"
      : resolved.errorStatus === 403 || resolved.errorStatus === 404
        ? "Notion側でデータベース共有と権限を確認してください"
        : "Notionデータベースに接続できませんでした";

  const details = [
    resolved.errorDetail && `Notion: ${resolved.errorDetail}`,
    resolved.attemptedId && `ID: ${resolved.attemptedId}`,
    resolved.dataSourceError && `data source確認: ${resolved.dataSourceError}`,
  ].filter(Boolean);

  return details.length > 0 ? `${base}（${details.join(" / ")}）` : base;
}
