
:root {
  --bg: #eef5fb;
  --bg2: #f9fbff;
  --card: rgba(255,255,255,.84);
  --line: #d9e3f0;
  --text: #122348;
  --muted: #5f6f8e;
  --blue: #05164d;
  --blue-2: #10337a;
  --gold: #f7b500;
  --gold-deep: #d79600;
  --shadow: 0 24px 60px rgba(6, 24, 74, .12);
  --radius: 28px;
}
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; }
body {
  font-family: Inter, system-ui, sans-serif;
  color: var(--text);
  background:
    radial-gradient(circle at top left, rgba(255,255,255,.9), rgba(255,255,255,0) 28%),
    linear-gradient(180deg, var(--bg2), var(--bg));
}
.page-shell {
  position: fixed;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at 85% 8%, rgba(247,181,0,.08), rgba(247,181,0,0) 18%),
    radial-gradient(circle at 15% 12%, rgba(16,51,122,.09), rgba(16,51,122,0) 24%);
}
.app { max-width: 1520px; margin: 0 auto; padding: 24px; position: relative; z-index: 1; }
.card {
  background: var(--card);
  border: 1px solid rgba(217,227,240,.9);
  box-shadow: var(--shadow);
  border-radius: var(--radius);
  backdrop-filter: blur(14px);
}
.hero {
  display: grid;
  grid-template-columns: 1.5fr .9fr;
  gap: 22px;
  padding: 30px;
  margin-bottom: 22px;
  background:
    linear-gradient(135deg, rgba(5,22,77,.98), rgba(16,51,122,.94) 50%, rgba(30,90,180,.88));
  color: white;
}
.eyebrow { font-size: 13px; text-transform: uppercase; letter-spacing: .16em; color: rgba(255,255,255,.72); font-weight: 700; }
.hero h1 { font-size: clamp(34px, 4vw, 58px); line-height: .95; margin: 12px 0; max-width: 760px; }
.hero h1 span { color: var(--gold); }
.hero p { max-width: 820px; line-height: 1.75; color: rgba(255,255,255,.9); }
.hero-pills { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; }
.chip {
  border: 1px solid rgba(255,255,255,.18);
  background: rgba(255,255,255,.1);
  border-radius: 999px;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 700;
}
.chip-gold { background: rgba(247,181,0,.14); color: #ffe6a0; border-color: rgba(247,181,0,.35); }
.hero-side { display: flex; flex-direction: column; gap: 16px; }
.hero-stat, .hero-box {
  border: 1px solid rgba(255,255,255,.14);
  background: rgba(255,255,255,.08);
  border-radius: 24px;
  padding: 20px;
}
.hero-stat strong { display: block; font-size: 30px; }
.hero-stat span { display: block; margin-top: 8px; color: rgba(255,255,255,.82); line-height: 1.6; }
.hero-box-title { font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: .12em; color: rgba(255,255,255,.72); margin-bottom: 12px; }
.hero-box ol { margin: 0; padding-left: 18px; color: rgba(255,255,255,.9); line-height: 1.8; }
.workspace {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(360px, .8fr);
  gap: 22px;
}
.left-col, .right-col { display: flex; flex-direction: column; gap: 22px; }
.input-card, .result-card, .candidates-card, .ai-card, .operations-card { padding: 24px; }
.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}
.section-head h2 { margin: 0 0 6px; font-size: 22px; }
.section-head p { margin: 0; color: var(--muted); line-height: 1.55; }
.grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 16px; }
label { display: block; }
label > span { display: block; font-size: 13px; font-weight: 800; margin-bottom: 8px; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }
textarea {
  width: 100%;
  min-height: 138px;
  resize: vertical;
  border-radius: 18px;
  border: 1px solid var(--line);
  background: rgba(248,251,255,.85);
  padding: 16px;
  font: inherit;
  color: var(--text);
  outline: none;
  transition: .15s ease;
}
textarea.large { min-height: 220px; }
textarea:focus { border-color: rgba(16,51,122,.4); box-shadow: 0 0 0 4px rgba(16,51,122,.08); }
.preview-box {
  margin-top: 18px;
  padding: 16px 18px;
  border-radius: 18px;
  background: rgba(245,249,255,.9);
  border: 1px solid var(--line);
}
.preview-title { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin-bottom: 8px; }
.preview-text { color: var(--text); line-height: 1.7; max-height: 180px; overflow: auto; white-space: pre-wrap; }
.button-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.top-gap { margin-top: 18px; }
.btn, .upload-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 46px;
  padding: 0 18px;
  border-radius: 14px;
  font: inherit;
  font-weight: 800;
  border: none;
  cursor: pointer;
  text-decoration: none;
}
.btn-primary { background: var(--blue); color: white; }
.btn-secondary { background: #eaf0f8; color: var(--text); }
.btn-gold, .upload-btn { background: var(--gold); color: #2c2200; }
.btn:hover, .upload-btn:hover { transform: translateY(-1px); }
.message {
  margin-top: 16px;
  padding: 14px 16px;
  border-radius: 14px;
  background: #edf3ff;
  border: 1px solid #cbdaf7;
  color: #26427c;
  line-height: 1.6;
}
.best-grid, .details-grid, .ai-output-grid {
  display: grid;
  gap: 14px;
}
.best-grid { grid-template-columns: repeat(4, minmax(0,1fr)); margin-bottom: 16px; }
.metric, .detail-box {
  border-radius: 20px;
  border: 1px solid var(--line);
  background: rgba(248,251,255,.88);
  padding: 18px;
}
.metric span { display: block; color: var(--muted); font-size: 13px; text-transform: uppercase; letter-spacing: .06em; font-weight: 800; }
.metric strong { display: block; margin-top: 10px; font-size: 24px; line-height: 1.1; }
.details-grid { grid-template-columns: repeat(2, minmax(0,1fr)); }
.detail-box h3 { margin: 0 0 10px; font-size: 15px; }
.detail-box p, .detail-box li, .trace-box { color: var(--text); line-height: 1.7; }
.candidate-list, .operations-list { display: grid; gap: 12px; }
.candidate-item, .operation-item {
  border-radius: 18px;
  border: 1px solid var(--line);
  background: rgba(248,251,255,.92);
  padding: 16px;
}
.candidate-top, .operation-top {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}
.candidate-code { font-size: 18px; font-weight: 900; }
.candidate-meta, .small-muted { color: var(--muted); font-size: 13px; line-height: 1.6; }
.bar {
  margin-top: 12px;
  height: 10px;
  border-radius: 999px;
  background: #e4ebf6;
  overflow: hidden;
}
.bar span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--blue), var(--gold));
  border-radius: inherit;
}
.pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  background: #edf2fb;
  color: #274073;
  font-size: 13px;
  font-weight: 800;
}
.pill-gold { background: rgba(247,181,0,.16); color: #735100; }
.pill-high { background: rgba(29,170,98,.14); color: #0f7340; }
.pill-medium { background: rgba(247,181,0,.18); color: #8a6200; }
.pill-low { background: rgba(214,84,84,.14); color: #8a2e2e; }
.agent-steps {
  display: grid;
  gap: 10px;
  margin-bottom: 18px;
}
.agent-step {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 700;
  color: var(--muted);
}
.agent-step span {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #ced8e7;
  display: inline-block;
}
.agent-step.active span, .agent-step.done span { background: var(--gold); }
.agent-step.done { color: var(--text); }
.ai-output-grid { grid-template-columns: repeat(2, minmax(0,1fr)); }
.detail-box.tall { min-height: 180px; }
.ai-text { white-space: pre-wrap; }
.ai-list { margin: 0; padding-left: 18px; }
.ai-list li { margin-bottom: 8px; }
.trace-box {
  white-space: pre-wrap;
  min-height: 72px;
  max-height: 240px;
  overflow: auto;
}
.muted { color: var(--muted); }
.score-box { font-size: 14px; font-weight: 900; }
@media (max-width: 1200px) {
  .workspace, .hero { grid-template-columns: 1fr; }
}
@media (max-width: 860px) {
  .grid-2, .best-grid, .details-grid, .ai-output-grid { grid-template-columns: 1fr; }
  .app { padding: 16px; }
  .hero, .input-card, .result-card, .candidates-card, .ai-card, .operations-card { padding: 18px; }
}
