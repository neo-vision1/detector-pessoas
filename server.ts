import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { Cam } from "onvif/promises";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON Body parser for base64 frame analysis
  app.use(express.json({ limit: "25mb" }));

  // Health check API
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Proxy apenas o HLS do MediaMTX local. Isso elimina bloqueios de CORS no
  // detector sem transformar o servidor em um proxy aberto para a rede.
  const isAllowedLocalHlsUrl = (url: URL) => {
    const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      localHosts.has(url.hostname) &&
      (url.port === "8888" || url.port === "")
    );
  };

  const asProxyUrl = (url: URL) => `/api/hls-proxy?url=${encodeURIComponent(url.toString())}`;

  const rewriteHlsPlaylist = (playlist: string, sourceUrl: URL) =>
    playlist
      .split(/\r?\n/)
      .map((line) => {
        const rewriteUri = (uri: string) => asProxyUrl(new URL(uri, sourceUrl));
        if (!line) return line;
        if (!line.startsWith("#")) return rewriteUri(line);
        return line.replace(/URI="([^"]+)"/g, (_match, uri) => `URI="${rewriteUri(uri)}"`);
      })
      .join("\n");

  app.get("/api/hls-proxy", async (req, res) => {
    const target = typeof req.query.url === "string" ? req.query.url : "";
    let sourceUrl: URL;

    try {
      sourceUrl = new URL(target);
    } catch {
      res.status(400).json({ error: "URL HLS inválida." });
      return;
    }

    if (!isAllowedLocalHlsUrl(sourceUrl)) {
      res.status(403).json({ error: "O proxy aceita somente o HLS local do MediaMTX." });
      return;
    }

    try {
      const headers: Record<string, string> = {};
      if (typeof req.headers.range === "string") headers.range = req.headers.range;

      const upstream = await fetch(sourceUrl, {
        headers,
        signal: AbortSignal.timeout(15_000),
      });

      if (!upstream.ok) {
        res.status(upstream.status).json({ error: `MediaMTX respondeu ${upstream.status}.` });
        return;
      }

      const contentType = upstream.headers.get("content-type") || "application/octet-stream";
      const isPlaylist = contentType.includes("mpegurl") || sourceUrl.pathname.endsWith(".m3u8");

      res.status(upstream.status);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", isPlaylist ? "application/vnd.apple.mpegurl" : contentType);
      const contentRange = upstream.headers.get("content-range");
      if (contentRange) res.setHeader("Content-Range", contentRange);

      if (isPlaylist) {
        const playlist = await upstream.text();
        res.send(rewriteHlsPlaylist(playlist, sourceUrl));
        return;
      }

      res.send(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      console.error("Erro no proxy HLS local:", error);
      res.status(502).json({ error: "Não foi possível ler o HLS local do MediaMTX." });
    }
  });

  type PtzDirection = "up" | "down" | "left" | "right";

  let cachedPtzCamera: Cam | null = null;
  let cachedPtzConfigKey = "";
  let pendingPtzConnection: Promise<Cam> | null = null;
  let activePtzTimer: ReturnType<typeof setTimeout> | null = null;
  let ptzCommandVersion = 0;

  const getPtzCamera = async () => {
    if (process.env.CAMERA_PTZ_ENABLED !== "true") {
      throw new Error("O controle PTZ está desativado no servidor.");
    }

    const hostname = process.env.CAMERA_ONVIF_HOST;
    const username = process.env.CAMERA_ONVIF_USERNAME;
    const password = process.env.CAMERA_ONVIF_PASSWORD;
    const port = Number(process.env.CAMERA_ONVIF_PORT || 80);

    if (!hostname || !username || !password || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("A configuração ONVIF da câmera está incompleta no arquivo .env.");
    }

    const configKey = `${hostname}:${port}:${username}:${password}`;
    if (cachedPtzCamera && cachedPtzConfigKey === configKey) return cachedPtzCamera;
    if (pendingPtzConnection) return pendingPtzConnection;

    pendingPtzConnection = (async () => {
      const camera = new Cam({ hostname, username, password, port, timeout: 8000 });
      await camera.connect();
      cachedPtzCamera = camera;
      cachedPtzConfigKey = configKey;
      return camera;
    })();

    try {
      return await pendingPtzConnection;
    } catch (error) {
      cachedPtzCamera = null;
      cachedPtzConfigKey = "";
      throw error;
    } finally {
      pendingPtzConnection = null;
    }
  };

  const clearScheduledPtzStop = () => {
    if (!activePtzTimer) return;
    clearTimeout(activePtzTimer);
    activePtzTimer = null;
  };

  const stopPtzMotion = async (camera?: Cam) => {
    clearScheduledPtzStop();
    ptzCommandVersion += 1;
    const activeCamera = camera || await getPtzCamera();
    await activeCamera.stop({ panTilt: true, zoom: true });
    return activeCamera;
  };

  const sendPtzError = (res: express.Response, error: unknown) => {
    const message = error instanceof Error ? error.message : "Falha desconhecida no controle PTZ.";
    console.error("Erro ONVIF/PTZ:", message);
    res.status(message.includes("desativado") || message.includes("incompleta") ? 503 : 502).json({ error: message });
  };

  app.get("/api/camera/ptz/status", async (_req, res) => {
    try {
      const camera = await getPtzCamera();
      const [device, ptz] = await Promise.all([camera.getDeviceInformation(), camera.getStatus()]);
      res.json({
        connected: true,
        device: {
          manufacturer: device?.manufacturer || "Intelbras",
          model: device?.model || "Câmera ONVIF",
          firmwareVersion: device?.firmwareVersion || "",
        },
        position: ptz?.position || null,
        moveStatus: ptz?.moveStatus || null,
      });
    } catch (error) {
      sendPtzError(res, error);
    }
  });

  app.post("/api/camera/ptz/move", async (req, res) => {
    const direction = req.body?.direction as PtzDirection;
    // Pulsos pequenos facilitam o enquadramento fino. A parada abaixo não depende
    // do suporte da câmera ao Timeout informado no comando ContinuousMove.
    const durationMs = Math.min(Math.max(Number(req.body?.durationMs) || 180, 80), 700);
    const vectors: Record<PtzDirection, { x: number; y: number }> = {
      up: { x: 0, y: 0.2 },
      down: { x: 0, y: -0.2 },
      left: { x: -0.2, y: 0 },
      right: { x: 0.2, y: 0 },
    };

    if (!vectors[direction]) {
      res.status(400).json({ error: "Direção PTZ inválida." });
      return;
    }

    const commandVersion = ++ptzCommandVersion;
    clearScheduledPtzStop();

    try {
      const camera = await getPtzCamera();
      if (commandVersion !== ptzCommandVersion) {
        res.json({ ok: false, cancelled: true });
        return;
      }

      // Interrompe o movimento anterior antes de iniciar o próximo pulso.
      await camera.stop({ panTilt: true, zoom: true });
      if (commandVersion !== ptzCommandVersion) {
        res.json({ ok: false, cancelled: true });
        return;
      }

      await camera.continuousMove({
        ...vectors[direction],
        timeout: durationMs,
        onlySendPanTilt: true,
      });
      if (commandVersion !== ptzCommandVersion) {
        await camera.stop({ panTilt: true, zoom: true });
        res.json({ ok: false, cancelled: true });
        return;
      }

      // Algumas câmeras aceitam ContinuousMove, mas ignoram o Timeout. Por isso,
      // o servidor sempre envia Stop depois do pulso solicitado.
      activePtzTimer = setTimeout(() => {
        if (commandVersion !== ptzCommandVersion) return;
        activePtzTimer = null;
        void camera.stop({ panTilt: true, zoom: true }).catch((error) => {
          console.error("Erro ao parar pulso PTZ automaticamente:", error);
        });
      }, durationMs);

      res.json({ ok: true, direction, durationMs, speed: 0.2 });
    } catch (error) {
      sendPtzError(res, error);
    }
  });

  app.post("/api/camera/ptz/stop", async (_req, res) => {
    try {
      await stopPtzMotion();
      res.json({ ok: true });
    } catch (error) {
      sendPtzError(res, error);
    }
  });

  app.post("/api/camera/ptz/home", async (_req, res) => {
    try {
      const camera = await stopPtzMotion();
      await camera.gotoHomePosition();
      res.json({ ok: true });
    } catch (error) {
      sendPtzError(res, error);
    }
  });

  // Vite Middleware in Dev
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
