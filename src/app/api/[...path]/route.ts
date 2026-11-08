import { NextResponse } from "next/server";

/** Unknown API endpoints return JSON 404 instead of an HTML page. */
function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404, headers: { "cache-control": "no-store" } });
}
export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
