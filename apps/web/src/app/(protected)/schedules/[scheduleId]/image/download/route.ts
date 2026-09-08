import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { NextRequest } from "next/server";
import { z } from "zod";

import { getDatabase } from "@school-timetable/database";

import { verifySession } from "@/lib/auth/dal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paramsSchema = z.object({ scheduleId: z.uuid() });
const imageNavigationTimeoutMs = 120_000;

function localChromePath(): string | undefined {
  const path = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  return existsSync(path) ? path : undefined;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ scheduleId: string }> },
) {
  const user = await verifySession();
  const { scheduleId } = paramsSchema.parse(await params);
  const schedule = await getDatabase().schedule.findFirst({
    where: { id: scheduleId, schoolId: user.schoolId },
    select: { version: true },
  });

  if (!schedule) {
    return Response.json({ code: "SCHEDULE_NOT_FOUND" }, { status: 404 });
  }

  const imageUrl = new URL(`/schedules/${scheduleId}/pdf`, request.url);
  imageUrl.searchParams.set("type", "school");

  const browser = await chromium.launch({
    args: ["--no-sandbox"],
    executablePath: localChromePath(),
  });
  try {
    const context = await browser.newContext({
      deviceScaleFactor: 2,
      viewport: { width: 1800, height: 1200 },
    });
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
    page.setDefaultNavigationTimeout(imageNavigationTimeoutMs);
    await page.goto(imageUrl.toString(), {
      timeout: imageNavigationTimeoutMs,
      waitUntil: "domcontentloaded",
    });
    await page
      .waitForLoadState("networkidle", { timeout: 10_000 })
      .catch(() => {
        // Large reports can keep the dev server busy; font/image readiness below
        // is the important rendering signal for the screenshot.
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

    const screenshot = await page.screenshot({
      animations: "disabled",
      fullPage: true,
      type: "png",
    });

    return new Response(new Uint8Array(screenshot), {
      headers: {
        "Content-Disposition": `attachment; filename="the_best_image_v${String(
          schedule.version,
        )}.png"`,
        "Content-Type": "image/png",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } finally {
    await browser.close();
  }
}
