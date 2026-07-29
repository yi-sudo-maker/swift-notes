import { NextResponse } from "next/server";
import { getNotionConfig } from "../notion-utils";

export async function GET() {
  const config = getNotionConfig();

  return NextResponse.json({
    hasServerToken: Boolean(config.token),
    hasServerDataSource: Boolean(config.dataSourceId),
    hasAccessKey: Boolean(config.accessKey),
    titleProperty: config.titleProperty,
  });
}
