<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SAC Finder AI Copilot</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <div class="page-shell"></div>
  <main class="app">
    <section class="hero card">
      <div class="hero-copy">
        <div class="eyebrow">SAC Finder • AI Copilot</div>
        <h1>Find SAC codes with <span>flexible reasoning</span>, not only exact string matching.</h1>
        <p>
          Hybrid workflow: local retrieval from your embedded SAC / MPD / APL data + optional AI agent
          that reasons over the task card, access wording, operation type, evidence, and likely bundle combinations.
        </p>
        <div class="hero-pills">
          <span class="chip">Core vs Access split</span>
          <span class="chip">Task card / PDF input</span>
          <span class="chip">Top evidence trace</span>
          <span class="chip chip-gold">AI reasoning layer</span>
        </div>
      </div>
      <div class="hero-side">
        <div class="hero-stat">
          <strong id="dbStats">Loading…</strong>
          <span>rows available inside the local knowledge base</span>
        </div>
        <div class="hero-box">
          <div class="hero-box-title">How it thinks</div>
          <ol>
            <li>Reads task card text and planning comments</li>
            <li>Splits operations and detects remove / install / inspect / repair / replace</li>
            <li>Separates access wording from probable core work</li>
            <li>Searches definitions, MPD, APL, and Sheet1 rows</li>
            <li>Lets AI reason over the retrieved evidence</li>
          </ol>
        </div>
      </div>
    </section>

    <section class="workspace">
      <div class="left-col">
        <section class="card input-card">
          <div class="section-head">
            <div>
              <h2>Input</h2>
              <p>Paste a task description, planning comments, or a whole task card.</p>
            </div>
            <div class="button-row">
              <label class="upload-btn">
                <input id="fileInput" type="file" accept=".txt,.pdf" hidden />
                Load TXT / PDF
              </label>
              <button id="clearBtn" class="btn btn-secondary">Clear</button>
            </div>
          </div>

          <div class="grid-2">
            <label>
              <span>Description</span>
              <textarea id="description" placeholder="Example: remove damaged sidewall panel around door 1L frame and reinstall insulation after inspection"></textarea>
            </label>
            <label>
              <span>Planning comments</span>
              <textarea id="planning" placeholder="Example: gain access via lining removal, sidewall trim open, inspect surrounding frame"></textarea>
            </label>
          </div>

          <label>
            <span>Task card / extracted file text</span>
            <textarea id="taskCard" class="large" placeholder="Paste the raw task card here for best results"></textarea>
          </label>

          <div class="preview-box">
            <div class="preview-title">Combined source</div>
            <div id="combinedPreview" class="preview-text">No input yet.</div>
          </div>

          <div class="button-row top-gap">
            <button id="runLocalBtn" class="btn btn-primary">Run local engine</button>
            <button id="runAiBtn" class="btn btn-gold">Run AI copilot</button>
          </div>

          <div id="messageBox" class="message" hidden></div>
        </section>

        <section class="card result-card">
          <div class="section-head">
            <div>
              <h2>Best local match / bundle</h2>
              <p>Fast deterministic result from your embedded workbook data.</p>
            </div>
            <div id="statusPill" class="pill">Idle</div>
          </div>

          <div class="best-grid">
            <div class="metric">
              <span>Best SAC</span>
              <strong id="bestSac">—</strong>
            </div>
            <div class="metric">
              <span>Confidence</span>
              <strong id="bestConfidence">—</strong>
            </div>
            <div class="metric">
              <span>Core hours</span>
              <strong id="coreHours">—</strong>
            </div>
            <div class="metric">
              <span>Access hours</span>
              <strong id="accessHours">—</strong>
            </div>
          </div>

          <div class="details-grid">
            <article class="detail-box">
              <h3>Definition</h3>
              <p id="definitionText">—</p>
            </article>
            <article class="detail-box">
              <h3>Main evidence</h3>
              <p id="bestSource">—</p>
            </article>
            <article class="detail-box">
              <h3>Core matched segment</h3>
              <p id="bestMatchText">—</p>
            </article>
            <article class="detail-box">
              <h3>Access reasoning</h3>
              <p id="accessText">—</p>
            </article>
          </div>
        </section>

        <section class="card candidates-card">
          <div class="section-head">
            <div>
              <h2>Top candidates</h2>
              <p>Best ranked candidates from the local retrieval engine.</p>
            </div>
          </div>
          <div id="candidateList" class="candidate-list"></div>
        </section>
      </div>

      <div class="right-col">
        <section class="card ai-card">
          <div class="section-head">
            <div>
              <h2>AI copilot</h2>
              <p>Uses the local evidence first, then reasons more flexibly about bundle choice, ambiguity, and checks.</p>
            </div>
            <div id="aiModePill" class="pill pill-gold">Ready</div>
          </div>

          <div class="agent-steps" id="agentSteps">
            <div class="agent-step active"><span></span>Read task text</div>
            <div class="agent-step"><span></span>Retrieve evidence</div>
            <div class="agent-step"><span></span>Reason like planner</div>
            <div class="agent-step"><span></span>Return recommendation</div>
          </div>

          <div class="ai-output-grid">
            <article class="detail-box tall">
              <h3>Recommendation</h3>
              <div id="aiRecommendation" class="ai-text muted">Run AI copilot to get a more flexible recommendation.</div>
            </article>
            <article class="detail-box">
              <h3>Why</h3>
              <ul id="aiWhy" class="ai-list"></ul>
            </article>
            <article class="detail-box">
              <h3>Checks before finalizing</h3>
              <ul id="aiChecks" class="ai-list"></ul>
            </article>
            <article class="detail-box">
              <h3>Candidate bundle</h3>
              <ul id="aiCodes" class="ai-list"></ul>
            </article>
          </div>

          <div class="detail-box">
            <h3>Agent trace</h3>
            <div id="aiTrace" class="trace-box">No AI activity yet.</div>
          </div>
        </section>

        <section class="card operations-card">
          <div class="section-head">
            <div>
              <h2>Detected operations</h2>
              <p>Each line is classified as core or access-like.</p>
            </div>
          </div>
          <div id="operationsList" class="operations-list"></div>
        </section>
      </div>
    </section>
  </main>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  <script src="/engine.js"></script>
  <script src="/app.js"></script>
</body>
</html>
