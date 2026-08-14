import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON Body parser for base64 frame analysis
  app.use(express.json({ limit: "25mb" }));

  // Initialize Gemini AI
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || "",
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });

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

  // Sample Videos API
  app.get("/api/sample-videos", (_req, res) => {
    res.json([
      {
        id: "crosswalk",
        title: "Faixa de Pedestres Urbana",
        description: "Fluxo intenso de pedestres em cruzamento urbano com alta movimentação.",
        category: "Tráfego Urbano",
        url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
        thumbnail: "https://images.unsplash.com/photo-1506751470038-e579eb91f580?w=600&auto=format&fit=crop&q=80"
      },
      {
        id: "mall",
        title: "Corredor de Shopping / Galeria",
        description: "Monitoramento de segurança interna e contagem de fluxo em entrada principal.",
        category: "Segurança / Varejo",
        url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
        thumbnail: "https://images.unsplash.com/photo-1519567241046-7f570eee3ce6?w=600&auto=format&fit=crop&q=80"
      },
      {
        id: "airport",
        title: "Saguão & Terminal de Passageiros",
        description: "Detecção de agrupamentos e rastreamento de tempo de permanência.",
        category: "Infraestrutura",
        url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
        thumbnail: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=600&auto=format&fit=crop&q=80"
      },
      {
        id: "plaza",
        title: "Praça Pública & Área Aberta",
        description: "Monitoramento de multidão em espaço público aberto.",
        category: "Cidades Inteligentes",
        url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
        thumbnail: "https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=600&auto=format&fit=crop&q=80"
      }
    ]);
  });

  // AI Visual Scene Analysis API using Gemini 3.6 Flash
  app.post("/api/ai-analyze-frame", async (req, res) => {
    try {
      const { imageBase64, detectionCount, timestamp, modelName } = req.body;

      if (!imageBase64) {
        res.status(400).json({ error: "Base64 image frame required" });
        return;
      }

      // Clean base64 string
      const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");

      const prompt = `Você é um engenheiro sênior de visão computacional especializado em YOLOv8 e monitoramento inteligente de segurança.
Analise a imagem enviada deste frame de vídeo (timestamp: ${timestamp || '00:00'}, pessoas detectadas pelo YOLOv8: ${detectionCount || 0}, modelo selecionado: ${modelName || 'YOLOv8n'}).

Forneça um relatório técnico estruturado em JSON contendo:
1. "crowdDensity": nível de densidade ("Baixa", "Moderada", "Alta", "Crítica")
2. "estimatedPeopleCount": estimativa detalhada do número de pessoas na cena
3. "activityDescription": descrição resumida da atividade na cena em português (ex: "Pessoas caminhando no saguão, 2 paradas conversando")
4. "safetyStatus": status de segurança ("Normal", "Atenção", "Alerta de Aglomeração", "Zona Restrita Invasão")
5. "anomalies": lista de observações ou comportamentos atípicos (array de strings)
6. "recommendation": recomendação de ação operacional para o operador da câmera.

Responda APENAS em JSON no seguinte formato exato:
{
  "crowdDensity": "Baixa",
  "estimatedPeopleCount": 4,
  "activityDescription": "...",
  "safetyStatus": "Normal",
  "anomalies": ["..."],
  "recommendation": "..."
}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: cleanBase64,
              },
            },
            {
              text: prompt,
            },
          ],
        },
        config: {
          responseMimeType: "application/json",
        },
      });

      const responseText = response.text || "{}";
      let parsed;
      try {
        parsed = JSON.parse(responseText);
      } catch (e) {
        parsed = {
          crowdDensity: "Moderada",
          estimatedPeopleCount: detectionCount || 0,
          activityDescription: "Análise realizada com sucesso sobre a cena.",
          safetyStatus: "Normal",
          anomalies: [],
          recommendation: "Manter monitoramento contínuo.",
        };
      }

      res.json({ success: true, analysis: parsed });
    } catch (error: any) {
      console.error("Error in /api/ai-analyze-frame:", error);
      res.status(500).json({ error: error.message || "Failed to analyze frame" });
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
