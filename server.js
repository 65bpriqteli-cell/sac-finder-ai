const http = require("http");

const PORT = process.env.PORT || 3000;

function send(res, status, content, type = "text/html; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type });
  res.end(content);
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) {
        reject(new Error("Request too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

async function callOpenAI(userText) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

  if (!apiKey) {
    return {
      mode: "fallback",
      answer:
        "Няма зададен OPENAI_API_KEY в Render. Добави ключа в Environment Variables, за да работи истинският AI.",
      checks: [
        "Провери дали OPENAI_API_KEY е добавен",
        "Провери дали OPENAI_MODEL е gpt-4.1-mini",
        "Направи redeploy след промяната"
      ]
    };
  }

  const prompt = `
You are an aircraft maintenance SAC planning copilot.
Be practical, concise, and useful.
The user will give task-card text or maintenance text.
Return JSON only in this format:
{
  "answer": "string",
  "checks": ["string", "string", "string"]
}

User text:
${userText}
`;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are a grounded aviation maintenance planning assistant. Return JSON only." },
        { role: "user", content: prompt }
      ]
    })
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`OpenAI error: ${response.status} ${txt}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("No model response content");
  }

  return JSON.parse(content);
}

const html = `<!DOCTYPE html>
<html lang="bg">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SAC Finder AI</title>
  <style>
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: #f4f7fb;
      color: #102040;
    }
    .wrap {
      max-width: 1100px;
      margin: 0 auto;
      padding: 24px;
    }
    .hero {
      background: linear-gradient(135deg, #06184d, #0f3b8a);
      color: white;
      border-radius: 18px;
      padding: 28px;
      margin-bottom: 20px;
    }
    .hero h1 {
      margin: 0 0 10px;
      font-size: 36px;
    }
    .hero h1 span {
      color: #f7b500;
    }
    .card {
      background: white;
      border-radius: 18px;
      padding: 20px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.08);
      margin-bottom: 20px;
    }
    textarea {
      width: 100%;
      min-height: 220px;
      padding: 14px;
      font-size: 15px;
      border-radius: 12px;
      border: 1px solid #ccd6e5;
      box-sizing: border-box;
      resize: vertical;
    }
    .row {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 14px;
    }
    button {
      border: none;
      border-radius: 12px;
      padding: 12px 18px;
      font-size: 15px;
      font-weight: bold;
      cursor: pointer;
    }
    .primary {
      background: #06184d;
      color: white;
    }
    .gold {
      background: #f7b500;
      color: #221700;
    }
    .muted {
      background: #e9eef7;
      color: #102040;
    }
    .out {
      white-space: pre-wrap;
      line-height: 1.6;
      background: #f8fbff;
      border: 1px solid #d9e3f0;
      border-radius: 12px;
      padding: 14px;
      min-height: 120px;
    }
    ul {
      margin-top: 8px;
      line-height: 1.7;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      <h1>SAC Finder <span>AI</span></h1>
      <p>Работещ сайт с AI агент за task-card / maintenance text анализ.</p>
    </div>

    <div class="card">
      <h2>Входен текст</h2>
      <textarea id="taskText" placeholder="Постави task card text, maintenance description или planning comment..."></textarea>
      <div class="row">
        <button class="primary" onclick="runAI()">Run AI</button>
        <button class="muted" onclick="clearAll()">Clear</button>
      </div>
    </div>

    <div class="card">
      <h2>AI отговор</h2>
      <div id="answer" class="out">Тук ще излезе отговорът.</div>
    </div>

    <div class="card">
      <h2>Checks</h2>
      <ul id="checks">
        <li>Още няма резултат.</li>
      </ul>
    </div>
  </div>

  <script>
    async function runAI() {
      const text = document.getElementById("taskText").value.trim();
      if (!text) {
        alert("Постави текст първо.");
        return;
      }

      document.getElementById("answer").textContent = "Мисля...";
      document.getElementById("checks").innerHTML = "<li>Изчакване...</li>";

      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text })
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "AI request failed");
        }

        document.getElementById("answer").textContent = data.answer || "Няма върнат отговор.";
        const checks = Array.isArray(data.checks) ? data.checks : [];
        document.getElementById("checks").innerHTML =
          checks.length ? checks.map(x => "<li>" + x + "</li>").join("") : "<li>Няма checks.</li>";
      } catch (e) {
        document.getElementById("answer").textContent = "Грешка: " + e.message;
        document.getElementById("checks").innerHTML = "<li>Провери Render logs</li>";
      }
    }

    function clearAll() {
      document.getElementById("taskText").value = "";
      document.getElementById("answer").textContent = "Тук ще излезе отговорът.";
      document.getElementById("checks").innerHTML = "<li>Още няма резултат.</li>";
    }
  </script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/") {
    return send(res, 200, html);
  }

  if (req.method === "GET" && req.url === "/api/health") {
    return send(
      res,
      200,
      JSON.stringify({
        ok: true,
        hasKey: Boolean(process.env.OPENAI_API_KEY),
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini"
      }),
      "application/json; charset=utf-8"
    );
  }

  if (req.method === "POST" && req.url === "/api/agent") {
    try {
      const body = await readBody(req);
      const text = String(body.text || "").trim();

      if (!text) {
        return send(
          res,
          400,
          JSON.stringify({ error: "Missing text" }),
          "application/json; charset=utf-8"
        );
      }

      const result = await callOpenAI(text);

      return send(
        res,
        200,
        JSON.stringify({
          answer: result.answer || "Няма отговор.",
          checks: Array.isArray(result.checks) ? result.checks : []
        }),
        "application/json; charset=utf-8"
      );
    } catch (e) {
      return send(
        res,
        500,
        JSON.stringify({ error: e.message || "Server error" }),
        "application/json; charset=utf-8"
      );
    }
  }

  return send(res, 404, "Not found", "text/plain; charset=utf-8");
});

server.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
