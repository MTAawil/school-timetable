import { readApplicationHealth } from "@/lib/health";

export async function GET(): Promise<Response> {
  const health = await readApplicationHealth();

  return Response.json(health, {
    status: health.status === "ok" ? 200 : 503,
  });
}
