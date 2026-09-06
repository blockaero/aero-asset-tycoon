import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { evolve, type EvolveRequest } from "../experiment/evolve.ts";
import { runSequence } from "../experiment/sequence.ts";
import { LiveCampaignManager } from "../live/runner.ts";
import { SaveStore } from "../live/save-store.ts";
import { defaultConfig, runCampaign } from "../sim/campaign.ts";
import { inspectSnippet } from "../sim/tick.ts";
import type { CampaignConfig, LivePace } from "../sim/types.ts";
import { DEFAULT_POLICY } from "../sim/world.ts";

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk) => {
      const buffer = chunk as Buffer;
      size += buffer.length;
      if (size > 1_000_000) {
        reject(new Error("request_too_large"));
        req.destroy();
        return;
      }
      chunks.push(buffer);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    ...corsHeaders(),
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(data);
}

function parseJson(text: string): Record<string, unknown> {
  if (!text) return {};
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_json_body");
  return parsed as Record<string, unknown>;
}

export function startServer(port = 8787, manager = new LiveCampaignManager(new SaveStore())): Server {
  const server = createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        res.writeHead(204, corsHeaders());
        res.end();
        return;
      }
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
      if (req.method === "GET" && url.pathname === "/health") {
        json(res, 200, { ok: true, service: "aero-asset-tycoon-sim" });
        return;
      }

      if (req.method === "POST" && url.pathname === "/v1/campaigns") {
        const body = parseJson(await readBody(req));
        const ticks = boundedInteger(body.ticks, 24, 1, 260, "ticks");
        const defaults = defaultConfig({
          seed: boundedInteger(body.seed, 1, 0, 2_147_483_647, "seed"),
          ticks,
          scenario: body.scenario === "full" ? "full" : "prototype",
        });
        const campaign = manager.create(
          {
            ...defaults,
            rivalCount: boundedInteger(body.rivalCount, defaults.rivalCount, 0, 5, "rivalCount"),
            airlineCount: boundedInteger(body.airlineCount, defaults.airlineCount, 1, 50, "airlineCount"),
            partCount: boundedInteger(body.partCount, defaults.partCount, 1, 100, "partCount"),
          },
          paceValue(body.pace),
          body.autoStart !== false,
        );
        json(res, 201, campaign.snapshot());
        return;
      }
      if (req.method === "GET" && url.pathname === "/v1/campaigns") {
        json(res, 200, manager.list());
        return;
      }

      const campaignMatch = url.pathname.match(/^\/v1\/campaigns\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?$/);
      if (campaignMatch) {
        const campaignId = decodeURIComponent(campaignMatch[1]!);
        const action = campaignMatch[2];
        const tail = campaignMatch[3];
        const campaign = manager.get(campaignId);
        if (!campaign) {
          json(res, 404, { error: "campaign_not_found" });
          return;
        }
        if (req.method === "GET" && !action) {
          json(res, 200, campaign.snapshot());
          return;
        }
        if (req.method === "GET" && action === "events") {
          res.writeHead(200, {
            ...corsHeaders(),
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
          });
          const unsubscribe = campaign.subscribe((snapshot) => {
            res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
          });
          const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15_000);
          heartbeat.unref?.();
          req.on("close", () => {
            clearInterval(heartbeat);
            unsubscribe();
          });
          return;
        }
        if (req.method === "POST" && action === "commands") {
          const body = parseJson(await readBody(req));
          const envelope = campaign.queue("firm-0", body.command);
          json(res, 202, { accepted: true, envelope });
          return;
        }
        if (req.method === "DELETE" && action === "commands" && tail) {
          const cancelled = campaign.cancelCommand(Number(tail));
          json(res, cancelled ? 200 : 404, { cancelled });
          return;
        }
        if (req.method === "POST" && action === "pause") {
          campaign.pause();
          const saved = await manager.saveCampaign(campaign.id, `autosave-${campaign.id}`);
          json(res, 200, { ...campaign.snapshot(), autosave: saved });
          return;
        }
        if (req.method === "POST" && action === "resume") {
          campaign.resume();
          json(res, 200, campaign.snapshot());
          return;
        }
        if (req.method === "POST" && action === "step") {
          campaign.step();
          json(res, 200, campaign.snapshot());
          return;
        }
        if (req.method === "POST" && action === "pace") {
          const body = parseJson(await readBody(req));
          campaign.setPace(paceValue(body.pace));
          json(res, 200, campaign.snapshot());
          return;
        }
        if (req.method === "POST" && action === "save") {
          const body = parseJson(await readBody(req));
          const saved = await manager.saveCampaign(
            campaign.id,
            typeof body.id === "string" ? body.id : undefined,
          );
          json(res, 201, saved);
          return;
        }
      }

      if (req.method === "GET" && url.pathname === "/v1/saves") {
        json(res, 200, await manager.saves.list());
        return;
      }
      const saveMatch = url.pathname.match(/^\/v1\/saves\/([^/]+)\/load$/);
      if (req.method === "POST" && saveMatch) {
        const body = parseJson(await readBody(req));
        const campaign = await manager.load(
          decodeURIComponent(saveMatch[1]!),
          paceValue(body.pace),
          body.autoStart === true,
        );
        json(res, 201, campaign.snapshot());
        return;
      }

      if (req.method === "POST" && url.pathname === "/v1/runs") {
        const body = parseJson(await readBody(req));
        const result = runCampaign(
          defaultConfig({
            seed: numberValue(body.seed, 1),
            ticks: numberValue(body.ticks, 100),
          }),
          DEFAULT_POLICY,
        );
        json(res, 200, {
          seed: result.seed,
          ticks: result.ticks,
          nav: result.nav,
          accBalance: result.accBalance,
          fillRate: result.fillRate,
          insolvent: result.insolvent,
          events: result.events,
          inspect: {
            firm: inspectSnippet(result.world, { kind: "firm", id: "firm-0" }),
            samplePart: inspectSnippet(result.world, { kind: "part", id: result.world.parts[0]!.id }),
          },
        });
        return;
      }
      if (req.method === "POST" && url.pathname === "/v1/evolve") {
        const body = parseJson(await readBody(req)) as unknown as EvolveRequest;
        json(res, 200, evolve({
          seed: body.seed ?? 1,
          campaign: body.campaign ?? {},
          generation: body.generation ?? {},
          genome: body.genome ?? {},
          fitness: body.fitness ?? {},
        }));
        return;
      }
      if (req.method === "POST" && url.pathname === "/v1/sequences") {
        const body = parseJson(await readBody(req));
        json(res, 200, runSequence(numberValue(body.seed, 1), DEFAULT_POLICY));
        return;
      }

      if (req.method === "GET" && await serveStatic(url.pathname, res)) return;
      json(res, 404, { error: "not_found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed";
      json(res, message.includes("not found") ? 404 : 400, { error: message });
    }
  });
  server.on("close", () => manager.dispose());
  server.listen(port, () => {
    process.stdout.write(`Aero Asset Tycoon listening on http://127.0.0.1:${port}\n`);
  });
  return server;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  if (value === undefined) return fallback;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(`invalid_${name}`);
  }
  return value;
}

function paceValue(value: unknown): LivePace {
  return value === "medium" || value === "slow" ? value : "fast";
}

const CLIENT_ROOT = resolve(process.cwd(), "dist", "client");
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
};

async function serveStatic(pathname: string, res: ServerResponse): Promise<boolean> {
  if (!existsSync(CLIENT_ROOT)) return false;
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const safe = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  let path = join(CLIENT_ROOT, safe);
  if (!path.startsWith(CLIENT_ROOT)) return false;
  if (!existsSync(path) && !extname(path)) path = join(CLIENT_ROOT, "index.html");
  if (!existsSync(path)) return false;
  const data = await readFile(path);
  res.writeHead(200, {
    "content-type": MIME[extname(path)] ?? "application/octet-stream",
    "cache-control": path.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable",
  });
  res.end(data);
  return true;
}
