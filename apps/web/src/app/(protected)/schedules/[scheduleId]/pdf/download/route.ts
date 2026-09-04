import { chromium } from "playwright";
import { NextRequest } from "next/server";
import { existsSync } from "node:fs";
import { z } from "zod";

import { verifySession } from "@/lib/auth/dal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paramsSchema = z.object({ scheduleId: z.uuid() });
const searchSchema = z.object({
  type: z
    .enum([
      "school",
      "class",
      "teacher",
      "teacher-full-time",
      "teacher-part-time",
      "subject-counts",
      "restrictions",
      "shared",
    ])
    .default("school"),
  entity: z.uuid().optional(),
});

function fileName(type: z.infer<typeof searchSchema>["type"]): string {
  return `${type.replaceAll("-", "_")}.pdf`;
}

function localChromePath(): string | undefined {
  const path = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  return existsSync(path) ? path : undefined;
}

const pdfNavigationTimeoutMs = 120_000;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ scheduleId: string }> },
) {
  await verifySession();
  const { scheduleId } = paramsSchema.parse(await params);
  const query = searchSchema.parse({
    type: request.nextUrl.searchParams.get("type") ?? undefined,
    entity: request.nextUrl.searchParams.get("entity") ?? undefined,
  });
  const pdfUrl = new URL(`/schedules/${scheduleId}/pdf`, request.url);
  pdfUrl.searchParams.set("type", query.type);
  if (query.entity) pdfUrl.searchParams.set("entity", query.entity);

  const browser = await chromium.launch({
    args: ["--no-sandbox"],
    executablePath: localChromePath(),
  });
  try {
    const context = await browser.newContext();
    const sessionCookie = request.cookies.get("timetable_session");
    if (sessionCookie) {
      await context.addCookies([
        {
          name: sessionCookie.name,
          value: sessionCookie.value,
          url: request.nextUrl.origin,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
    }
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(pdfNavigationTimeoutMs);
    await page.goto(pdfUrl.toString(), {
      timeout: pdfNavigationTimeoutMs,
      waitUntil: "domcontentloaded",
    });
    await page
      .waitForLoadState("networkidle", { timeout: 10_000 })
      .catch(() => {
        // Large multi-page reports can keep the dev server busy enough that
        // networkidle is not a reliable readiness signal. The explicit font/image
        // wait below is what the PDF needs before rendering.
      });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        Array.from(document.images).map(
          (image) =>
            image.complete ||
            new Promise<void>((resolve) => {
              image.addEventListener("load", () => resolve(), { once: true });
              image.addEventListener("error", () => resolve(), { once: true });
            }),
        ),
      );
    });
    const pdf = await page.pdf({
      displayHeaderFooter: false,
      format: "A4",
      landscape: true,
      margin: { top: "8mm", right: "8mm", bottom: "8mm", left: "8mm" },
      printBackground: true,
    });

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Disposition": `attachment; filename="${fileName(query.type)}"`,
        "Content-Type": "application/pdf",
      },
    });
  } finally {
    await browser.close();
  }
}
