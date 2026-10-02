// Generates the screenshot-driven handout:
// "Trade Forecasting — a Bob + Confluent Cloud Lab"
// Merges the upstream Confluent lab (steps + screenshots) with a granular IBM Bob
// prompt per step. Payment steps removed. Follows the upstream screenshots
// (Standard cluster, catalog `default`, database `cluster_0`).
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, LevelFormat, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, PageBreak, Header, Footer, ImageRun,
  ExternalHyperlink,
} = require("docx");

// ---------- palette ----------
const CONFLUENT = "1A5FB4";
const BOB = "0F62FE";
const CODE_BG = "F3F4F6";
const TIP_BG = "FFF7E0", TIP_BAR = "E0A800";
const BOB_BG = "E8F0FE", BOB_BAR = "0F62FE";
const WARN_BG = "FDECEA", WARN_BAR = "D93025";
const HDR_FILL = "1A5FB4";
const ZEBRA = "F2F6FC";
const MONO = "Consolas";
const CONTENT_W = 9360; // US Letter, 1" margins

const SHOTS = path.join(__dirname, "..", "screenshots");

// ---------- helpers ----------
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const H3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(t)] });

function P(text, opts = {}) {
  const runs = Array.isArray(text) ? text : [new TextRun({ text, ...opts })];
  return new Paragraph({ spacing: { after: 120 }, children: runs });
}
function run(text, opts = {}) { return new TextRun({ text, ...opts }); }
function bullet(text, level = 0) {
  const runs = Array.isArray(text) ? text : [new TextRun(text)];
  return new Paragraph({ numbering: { reference: "bullets", level }, spacing: { after: 60 }, children: runs });
}
function numN(ref, text) {
  const runs = Array.isArray(text) ? text : [new TextRun(text)];
  return new Paragraph({ numbering: { reference: ref, level: 0 }, spacing: { after: 100 }, children: runs });
}
function code(src) {
  const lines = src.replace(/\t/g, "  ").split("\n");
  return lines.map((ln, i) => new Paragraph({
    shading: { fill: CODE_BG, type: ShadingType.CLEAR },
    spacing: { before: i === 0 ? 60 : 0, after: i === lines.length - 1 ? 120 : 0, line: 264 },
    indent: { left: 120, right: 120 },
    children: [new TextRun({ text: ln.length ? ln : " ", font: MONO, size: 18 })],
  }));
}
function callout(label, bodyParas, bg, bar) {
  const kids = [
    new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: label, bold: true, size: 20 })] }),
    ...bodyParas,
  ];
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    rows: [new TableRow({ children: [new TableCell({
      width: { size: CONTENT_W, type: WidthType.DXA },
      shading: { fill: bg, type: ShadingType.CLEAR },
      margins: { top: 120, bottom: 120, left: 200, right: 160 },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 2, color: bg },
        bottom: { style: BorderStyle.SINGLE, size: 2, color: bg },
        right: { style: BorderStyle.SINGLE, size: 2, color: bg },
        left: { style: BorderStyle.SINGLE, size: 24, color: bar },
      },
      children: kids,
    })] })],
  });
}
const tip = (label, lines) => callout(label, lines.map((l) => P(l)), TIP_BG, TIP_BAR);
const warn = (label, lines) => callout(label, lines.map((l) => P(l)), WARN_BG, WARN_BAR);

// "Ask Bob" box: intro + the prompt as code, optionally an "expected" line
function askBob(intro, prompt, expected) {
  const body = [ P([run(intro, {})]) ];
  body.push(P([run("Prompt to give Bob:", { italics: true, size: 20, color: "555555" })]));
  body.push(...code(prompt));
  if (expected) body.push(P([run("Expected: ", { italics: true, bold: true, size: 20, color: "555555" }), run(expected, { italics: true, size: 20, color: "555555" })]));
  return callout("🤖  Ask Bob", body, BOB_BG, BOB_BAR);
}
function spacer(h = 80) { return new Paragraph({ spacing: { after: h }, children: [] }); }

// PNG pixel dims (IHDR)
function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
// image, scaled to a target display width in px (height from aspect ratio)
function img(name, widthPx) {
  const file = path.join(SHOTS, name);
  const { w, h } = pngSize(file);
  const dispW = Math.min(widthPx, 624); // 6.5" @ 96dpi
  const dispH = Math.round(dispW * (h / w));
  return new Paragraph({
    spacing: { before: 60, after: 160 },
    alignment: AlignmentType.CENTER,
    children: [new ImageRun({
      type: "png",
      data: fs.readFileSync(file),
      transformation: { width: dispW, height: dispH },
      altText: { title: name, description: name, name },
    })],
  });
}
function table(headers, rows, widths) {
  const border = { style: BorderStyle.SINGLE, size: 1, color: "C9D3E0" };
  const borders = { top: border, bottom: border, left: border, right: border };
  const headRow = new TableRow({
    tableHeader: true,
    children: headers.map((hh, i) => new TableCell({
      width: { size: widths[i], type: WidthType.DXA }, borders,
      shading: { fill: HDR_FILL, type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text: hh, bold: true, color: "FFFFFF", size: 20 })] })],
    })),
  });
  const bodyRows = rows.map((r, ri) => new TableRow({
    children: r.map((c, i) => new TableCell({
      width: { size: widths[i], type: WidthType.DXA }, borders,
      shading: { fill: ri % 2 ? ZEBRA : "FFFFFF", type: ShadingType.CLEAR },
      margins: { top: 70, bottom: 70, left: 120, right: 120 },
      children: (Array.isArray(c) ? c : [c]).map((line) =>
        new Paragraph({ children: [new TextRun({ text: String(line), size: 19 })] })),
    })),
  }));
  return new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: widths, rows: [headRow, ...bodyRows] });
}

// ================= CONTENT =================
const children = [];

// ---- Cover ----
children.push(new Paragraph({ spacing: { before: 1500, after: 60 }, alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: "Trade Forecasting", bold: true, size: 56, color: CONFLUENT })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 },
  children: [new TextRun({ text: "a Bob + Confluent Cloud Lab", bold: true, size: 36, color: BOB })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 },
  children: [new TextRun({ text: "Illustrated Hands-On Manual  ·  ~45–50 Minutes", size: 26, color: "444444" })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 500 },
  children: [new TextRun({ text: "Stream · Enrich · Forecast — with IBM Bob writing the Flink SQL alongside you.", italics: true, size: 22, color: "666666" })] }));
children.push(img("architecture.png", 560));
children.push(new Paragraph({ children: [new PageBreak()] }));

// ---- Intro ----
children.push(H1("The use case"));
children.push(P("Picture an online trading platform. Stock trades are streaming in constantly, and the team wants two things live: who's trading and where they're from (a join), and which stocks are surging in activity so they can spot momentum as it builds (a forecast). In this lab you'll build exactly that — entirely inside Confluent Cloud, no Terraform, no local setup."));
children.push(P("Why it matters: forecasting lets the platform get ahead of a surge — provision capacity, alert users, or flag manipulation before it peaks — instead of reacting once it's already over."));
children.push(P([run("What makes this a Bob lab: ", { bold: true }), run("at every step you first tell IBM Bob, in plain English, what you want — Bob writes the Flink SQL and explains the tricky parts — then you run it in Confluent Cloud and confirm the result. You stay in control; Bob is your pair-programmer.")]));
children.push(tip("Source", ["Adapted from Confluent's confluent-intelligence-trade-forecasting lab (steps + screenshots), rewoven as an AI-assisted Bob + Confluent workshop. The verified reference build is in LAB.md; the pass/fail checklist is in VALIDATE_OUTPUT.md."]));

// ---- Meet Bob ----
children.push(H1("Before you start — meet Bob and load the skill"));
children.push(P("IBM Bob is an agentic AI assistant for the software lifecycle. In this lab Bob plays one focused role: you describe the pipeline in plain English, and Bob produces the Flink SQL, explains it, and helps you debug."));
children.push(P([run("Bob writes sharper Confluent SQL when it has ", {}), run("this lab's skill", { bold: true }), run(" loaded. It ships inside this repo at ", {}), run(".bob/skills/trade-forecasting-flink/SKILL.md", { font: MONO }), run(":", {})]));
children.push(...code("git clone https://github.com/EdySamaha/IBM-confluent-bob-lab.git"));
children.push(bullet([run("Open the cloned repo folder as your Bob workspace so Bob discovers the skill at ", {}), run(".bob/skills/trade-forecasting-flink/SKILL.md", { font: MONO }), run(", or", {})]));
children.push(bullet("copy the repo's .bob/skills/ folder into your own Bob workspace."));
children.push(askBob(
  "Paste this first to set Bob up as your pair-programmer for the whole lab:",
  `You are my pair-programmer for a Confluent Cloud Flink SQL lab. We will build a
real-time stock-trade forecasting pipeline:
  1. ingest two streams - users and stock trades (Datagen, AVRO)
  2. keep a keyed lookup of users
  3. enrich each trade with its user's region/gender via a temporal join
  4. count trades per stock symbol in 10-second tumbling windows
  5. forecast each symbol's next-window count with the built-in ML_FORECAST
For each step I describe the intent; you reply with the exact Flink SQL for
Confluent Cloud (not open-source Flink), then explain it in two or three lines.
Keep statements runnable as-is. Confirm the plan and we'll start.`,
  "Bob restates the five steps and confirms it will target Confluent Cloud Flink SQL. No skill loaded? Bob can still produce correct SQL from the prompts below."));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ================= 1. SIGN UP =================
children.push(H1("1. Sign up"));
children.push(numN("s1", "Go to confluent.cloud/signup (or the workshop link cnfl.io/devday2026) and create an account with your email."));
children.push(numN("s1", "Verify your email and log in to the Confluent Cloud console."));
children.push(tip("Skip the wizard cluster", ["During signup it may prompt you to create a cluster — skip that; we'll create it in the next section."]));

// ================= 2. CREATE A CLUSTER =================
children.push(H1("2. Create a cluster"));
children.push(numN("s2", [run("On the Environments page, open the ", {}), run("default", { font: MONO }), run(" environment that came with your account. This lands you on the Environment overview — your home base, where clusters, topics, and Flink compute pools all live.", {})]));
children.push(img("02a-environment-overview.png", 600));
children.push(numN("s2", "Open Clusters from the left nav (or the Clusters card). The environment is brand new, so it has none yet — click Add new cluster."));
children.push(img("02b-clusters-empty.png", 520));
children.push(numN("s2", [run("On the Create cluster page, keep the default configuration — ", {}), run("Standard", { bold: true }), run(" cluster, AWS, region us-east-2 — click Continue, then Launch cluster. It shows Running once ready.", {})]));
children.push(img("03-cluster-create.png", 600));
children.push(img("04c-cluster-running.png", 600));
children.push(askBob(
  "Before you commit to a cluster type, let Bob size the whole lab and weigh the cost tradeoff:",
  `What Confluent Cloud resources does this lab need (cluster, Flink compute pool,
Schema Registry)? I'll create everything and tear it down the same day. Briefly
compare a Standard vs a Basic Kafka cluster for this lab - which is cheaper to
leave idle, and does Basic still support Datagen connectors, Flink, and ML_FORECAST?`,
  "A Kafka cluster + a Flink compute pool + Schema Registry. Basic has no hourly base fee (cheapest to leave idle) and supports everything here; Standard (shown in these screenshots) adds a base rate. This manual follows the Standard default so the screenshots match."));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ================= 3. GENERATE DATA SOURCES =================
children.push(H1("3. Generate data sources"));
children.push(P([run("You'll stand up two ", {}), run("Sample Data", { bold: true }), run(" (Datagen) connectors that stream mock records into Kafka topics: ", {}), run("Users", { bold: true }), run(" (customer profiles — userid, regionid, gender) and ", {}), run("Stock trades", { bold: true }), run(" (live trades — symbol, side, quantity, price, and the trader's userid).", {})]));
children.push(askBob(
  "Ask Bob why the connector format matters before you create them:",
  `I'll add two Datagen Source (Sample Data) connectors: the "Users" template to
topic sample_data_users, and "Stock trades" to sample_data_stock_trades. Why
should the output value format be AVRO instead of JSON, and what exactly breaks
in Flink later if I pick schemaless JSON?`,
  "AVRO registers a schema in Schema Registry, so Flink sees typed columns (userid, symbol, price, ...); schemaless JSON leaves Flink with one opaque blob and nothing to join on. Choose AVRO."));
children.push(numN("s3", "From your cluster, open Connectors and click Add Connector."));
children.push(img("05a-connectors-page.png", 600));
children.push(numN("s3", "Choose the Sample Data (Datagen Source) connector and click Get started."));
children.push(img("05b-sample-data-plugin.png", 600));
children.push(numN("s3", [run("Select the Users template — it writes to the ", {}), run("sample_data_users", { font: MONO }), run(" topic — set the output format to ", {}), run("AVRO", { bold: true }), run(", then click Launch.", {})]));
children.push(img("05-connector-users.png", 360));
children.push(numN("s3", [run("Add another connector the same way, select the Stock trades template — it writes to ", {}), run("sample_data_stock_trades", { font: MONO }), run(", output format ", {}), run("AVRO", { bold: true }), run(" — then click Launch.", {})]));
children.push(img("06-connector-stock-trades.png", 360));
children.push(numN("s3", "Wait until both connectors show Running."));
children.push(img("06b-connectors-running.png", 520));
children.push(numN("s3", "From the left nav, open Topics."));
children.push(img("06c-topics-nav.png", 150));
children.push(numN("s3", [run("Click ", {}), run("sample_data_users", { font: MONO }), run(", then open the Messages tab to view live user records.", {})]));
children.push(img("07-topic-users.png", 600));
children.push(numN("s3", [run("Click ", {}), run("sample_data_stock_trades", { font: MONO }), run(", open the Messages tab, and note the shared userid field.", {})]));
children.push(img("08-topic-stock-trades.png", 600));
children.push(askBob(
  "Have Bob tell you what to expect in the records:",
  `I'm viewing live messages in sample_data_users and sample_data_stock_trades.
What fields should each record carry, and which field do the two topics share
so I can join trades to the user who made them?`,
  "Users carry userid/regionid/gender; trades carry userid/symbol/side/quantity/price; the shared key is userid."));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ================= LAB 2 =================
children.push(H1("Lab 2: Enrich & forecast live trades with Flink"));
children.push(P("With trades and customer data now streaming, use Flink SQL to answer the two business questions: who is trading and from where (enrichment), and which stocks are heating up (forecast) — both computed continuously on the live streams."));

children.push(H2("Step 1: Enrich live trades with customer context"));
children.push(numN("l1", [run("Open Flink, select the ", {}), run("default", { font: MONO }), run(" environment, and click Continue.", {})]));
children.push(img("09-flink-navigate.png", 360));
children.push(numN("l1", "Flink runs your SQL on a compute pool, and a brand-new environment has none. On the Compute pools tab, click Add compute pool."));
children.push(img("09a-compute-pool-empty.png", 600));
children.push(numN("l1", "Choose AWS and region Ohio (us-east-2) — a compute pool must be in the same cloud and region as the cluster it processes — then click Continue."));
children.push(img("09b-compute-pool-region.png", 440));
children.push(numN("l1", "Review the pool — the defaults (max 10 CFU, no base cost) are plenty — and click Create."));
children.push(img("09c-compute-pool-review.png", 440));
children.push(numN("l1", "Once the pool is ready, click SQL Workspace on it to open a query editor."));
children.push(img("09d-compute-pool-ready.png", 600));
children.push(askBob(
  "Ask Bob why the region has to match:",
  `Why must my Flink compute pool be in the same cloud and region as my Kafka
cluster (AWS us-east-2)? What breaks if they differ, and how would I tell?`,
  "A pool can only process clusters in its own cloud/region; a mismatch means your statements won't see your cluster's topics at all."));
children.push(numN("l1", [run("In the workspace, set ", {}), run("Use catalog", { bold: true }), run(" to ", {}), run("default", { font: MONO }), run(" and ", {}), run("Use database", { bold: true }), run(" to ", {}), run("cluster_0", { font: MONO }), run(" so your topics resolve as tables.", {})]));
children.push(img("09e-workspace-catalog.png", 560));
children.push(askBob(
  "This is the #1 gotcha in the whole lab — ask Bob to explain the mapping:",
  `In Confluent Cloud Flink SQL, what do "catalog" and "database" actually map to?
My environment is named "default" and my cluster is "cluster_0". What should I
set the current catalog and database to, and give me a one-line query to confirm
my two source topics are visible.`,
  "catalog = environment name, database = cluster name (here default / cluster_0; in your own account they'd be YOUR env and cluster names, not these defaults). Confirm with SHOW TABLES; — you should see sample_data_users and sample_data_stock_trades."));
children.push(numN("l1", [run("sample_data_users from Datagen is an append-only stream, so first key it into a lookup table that keeps the latest row per user, using a ", {}), run("materialized table", { bold: true }), run(".", {})]));
children.push(askBob(
  "Let Bob generate the lookup table:",
  `Create a Confluent Cloud Flink MATERIALIZED TABLE called users_keyed from
sample_data_users. It should hold userid (primary key, never null), regionid,
and gender, so I can join trades to the latest profile per user. Give me the
exact CREATE MATERIALIZED TABLE statement.`,
  null));
children.push(P([run("Run Bob's statement:", { italics: true, size: 20, color: "555555" })]));
children.push(...code(`CREATE MATERIALIZED TABLE users_keyed (
  userid STRING NOT NULL,
  regionid STRING,
  gender STRING,
  PRIMARY KEY (userid) NOT ENFORCED
) AS
SELECT COALESCE(userid, '') AS userid, regionid, gender FROM sample_data_users;`));
children.push(tip("What a materialized table is", ["It bundles a table and its continuous query into one object — define it once, with no separate INSERT INTO to manage. You can even evolve it in place with CREATE OR ALTER MATERIALIZED TABLE."]));
children.push(numN("l1", "Enrich each trade with its user's region and gender using a temporal join, storing the result in a trades_enriched table the next step forecasts on."));
children.push(askBob(
  "Let Bob generate the temporal join:",
  `Create a MATERIALIZED TABLE trades_enriched that joins sample_data_stock_trades
(fields: userid, symbol, side, quantity, price) to my users_keyed table,
attaching each user's regionid and gender as of the trade's event time. Use a
temporal join on the trade's $rowtime.`,
  null));
children.push(P([run("Run Bob's statement:", { italics: true, size: 20, color: "555555" })]));
children.push(...code("CREATE MATERIALIZED TABLE trades_enriched AS\n" +
  "SELECT t.userid, t.symbol, t.side, t.quantity, t.price, u.regionid, u.gender\n" +
  "FROM sample_data_stock_trades t\n" +
  "JOIN users_keyed FOR SYSTEM_TIME AS OF t.`$rowtime` AS u\n" +
  "  ON t.userid = u.userid;"));
children.push(numN("l1", "Query the enriched stream to confirm each trade now carries its customer's region and gender:"));
children.push(...code("SELECT * FROM trades_enriched;"));
children.push(img("10b-trades-enriched-query.png", 600));
children.push(askBob(
  "Zero rows at first? Don't panic — ask Bob:",
  `My Flink temporal join trades_enriched returns 0 rows even though both source
topics have data. Explain the watermark warm-up, list the other usual causes
(key mismatch, catalog/database), and tell me how long to wait before deciding
something is actually wrong.`,
  "A temporal join emits nothing during watermark warm-up — wait ~30-60s and re-run before troubleshooting."));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ---- Lab 2 Step 2 ----
children.push(H2("Step 2: Forecast trades per stock"));
children.push(P([run("ML_FORECAST needs a real time series (a numeric value per timestamp), so window trades_enriched into a per-stock trade count every 10 seconds and forecast each symbol on its own — in one statement.", {})]));
children.push(askBob(
  "Let Bob generate the forecast table:",
  `Create a MATERIALIZED TABLE trades_forecast that, per stock symbol, counts
trades in 10-second tumbling windows over trades_enriched, then applies
ML_FORECAST over that count ordered by window time (minTrainingSize 10,
horizon 5). Output symbol, the window end as ts, the current count, and the
next forecast value and its upper bound. Use the TUMBLE table-valued function
on $rowtime.`,
  null));
children.push(numN("l2", [run("Create the forecast as a materialized table. The inner query tumbles trades into trade_count per symbol; ML_FORECAST — partitioned by symbol — returns an ", {}), run("array", { bold: true }), run(" of forecast points, so index the first (forecast[1]) for the next-window prediction and its bounds (minTrainingSize is 10 per symbol, so a stock forecasts once it has ~10 windows of history):", {})]));
children.push(...code(`CREATE MATERIALIZED TABLE trades_forecast AS
SELECT
  symbol,
  ts,
  trade_count                AS current_count,
  forecast[1].forecast_value AS forecast_count,
  forecast[1].upper_bound    AS upper_bound
FROM (
  SELECT
    symbol,
    window_end AS ts,
    trade_count,
    ML_FORECAST(
      CAST(trade_count AS DOUBLE),
      window_end,
      JSON_OBJECT('minTrainingSize' VALUE 10, 'horizon' VALUE 5)
    ) OVER (
      PARTITION BY symbol
      ORDER BY window_time
    ) AS forecast
  FROM (
    SELECT symbol, window_end, window_time, COUNT(*) AS trade_count
    FROM TABLE(
      TUMBLE(TABLE trades_enriched, DESCRIPTOR(\`$rowtime\`), INTERVAL '10' SECONDS)
    )
    GROUP BY symbol, window_start, window_end, window_time
  )
)
WHERE CARDINALITY(forecast) >= 1;`));
children.push(askBob(
  "Have Bob explain it so you can teach it back:",
  `Explain in plain terms what this ML_FORECAST is doing: what do
minTrainingSize=10 and horizon=5 mean, why do we read forecast[1], and why
won't a stock produce a forecast until it has about 10 closed windows?`,
  "ML_FORECAST returns an array of future predictions; forecast[1] is the next window; a symbol needs ~10 closed 10s windows (~100s) before it forecasts; horizon=5 projects up to 5 windows ahead."));
children.push(numN("l2", [run("Inspect the ", {}), run("latest", { bold: true }), run(" forecast for each stock. trades_forecast has one row per stock per window, so deduplicate to the most recent window per symbol:", {})]));
children.push(askBob(
  "Let Bob write the result query:",
  `Give me a Flink SQL query over trades_forecast that returns only the most recent
row per symbol (latest by $rowtime), showing symbol, current_count,
forecast_count, and upper_bound.`,
  null));
children.push(P([run("Run Bob's statement:", { italics: true, size: 20, color: "555555" })]));
children.push(...code("SELECT symbol, current_count, forecast_count, upper_bound\n" +
  "FROM (\n" +
  "  SELECT *,\n" +
  "    ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY `$rowtime` DESC) AS row_num\n" +
  "  FROM trades_forecast\n" +
  ")\n" +
  "WHERE row_num = 1;"));
children.push(P("You get one row per stock — its latest window — where count means trades in a 10-second window:"));
children.push(bullet([run("current_count", { bold: true, font: MONO }), run(" — trades that stock had in the latest window (what just happened).", {})]));
children.push(bullet([run("forecast_count", { bold: true, font: MONO }), run(" — trades the model predicts for its next window.", {})]));
children.push(bullet([run("upper_bound", { bold: true, font: MONO }), run(" — top of the confidence range on that prediction.", {})]));
children.push(P([run("A forecast_count above current_count means that stock is ", {}), run("heating up", { bold: true }), run(".", {})]));
children.push(img("12-flink-forecast-result.png", 600));

children.push(new Paragraph({ children: [new PageBreak()] }));

// ---- Iterate ----
children.push(H1("Iterate with Bob (the AI-SDLC loop)"));
children.push(P("The point of a Bob lab is that you change the requirement, not the syntax — Bob regenerates the SQL. Pick one:"));
children.push(askBob(
  "Break the forecast down by region:",
  `Extend the pipeline: I want the trade-surge forecast per stock AND per regionid
(from trades_enriched). Give me the modified trades_forecast definition and tell
me what I must drop/recreate to apply it.`,
  null));
children.push(askBob(
  "Turn it into an always-on alert feed:",
  `Turn the heating-up watch list into its own always-on MATERIALIZED TABLE -
trades_alerts - that continuously holds only the symbols whose forecast_count is
at least 25% above current_count, so a downstream consumer could subscribe to it.
Give me the CREATE MATERIALIZED TABLE statement over trades_forecast.`,
  null));

// ---- Cleanup ----
children.push(H1("Cleanup"));
children.push(P("Tear everything down so nothing keeps running."));
children.push(askBob(
  "Ask Bob for both options — full teardown or just park it:",
  `Give me two options to finish: (a) the DROP statements to fully tear down the
three materialized tables, and (b) the steps to just PARK everything at about
$0/hour WITHOUT deleting - suspend the three materialized tables and pause both
Datagen connectors - plus how to resume later.`,
  null));
children.push(H3("Option A — full teardown (deletes)"));
children.push(numN("cu", "In the SQL workspace, drop the Flink materialized tables (this stops their continuous statements):"));
children.push(...code("DROP MATERIALIZED TABLE trades_forecast;\nDROP MATERIALIZED TABLE trades_enriched;\nDROP MATERIALIZED TABLE users_keyed;"));
children.push(numN("cu", "Delete both Sample Data connectors: cluster → Connectors → each connector → Settings → Delete connector."));
children.push(numN("cu", "Delete the cluster (Cluster → Settings → Delete cluster). This removes all remaining topics."));
children.push(H3("Option B — park it without deleting (≈ $0/hour, resume any time)"));
children.push(...code("ALTER MATERIALIZED TABLE trades_forecast SUSPEND;\nALTER MATERIALIZED TABLE trades_enriched SUSPEND;\nALTER MATERIALIZED TABLE users_keyed SUSPEND;"));
children.push(P("Then pause both Datagen connectors in the Connectors UI. The Flink pool idles to 0 CFU; on a Basic cluster that's ≈ $0/hour with nothing deleted. Resume = resume connectors + ALTER MATERIALIZED TABLE <name> RESUME; on all three (users_keyed first), then wait ~2 minutes."));

// ================= DOCUMENT =================
const mkRefs = (names) => names.map((reference) => ({
  reference,
  levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 520, hanging: 300 } } } }],
}));

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, color: CONFLUENT, font: "Arial" },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, color: "222222", font: "Arial" },
        paragraph: { spacing: { before: 220, after: 120 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 23, bold: true, color: "444444", font: "Arial" },
        paragraph: { spacing: { before: 160, after: 80 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 520, hanging: 280 } } } }] },
      ...mkRefs(["s1", "s2", "s3", "l1", "l2", "cu"]),
    ],
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    headers: { default: new Header({ children: [new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "D5DEEA", space: 2 } },
      children: [new TextRun({ text: "Trade Forecasting · Bob + Confluent Cloud Lab", size: 16, color: "8A94A6" })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "Page ", size: 16, color: "8A94A6" }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "8A94A6" })] })] }) },
    children,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  const out = path.join(__dirname, "Trade-Forecasting-Bob-Confluent-Lab-Manual.docx");
  fs.writeFileSync(out, buf);
  console.log("wrote", path.basename(out));
});
