// Generates the student-facing Word lab:
// "Real-Time Trade Forecasting with Confluent Cloud & IBM Bob"
const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, LevelFormat, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, PageBreak, Header, Footer, TableOfContents,
  ExternalHyperlink,
} = require("docx");

// ---------- palette ----------
const CONFLUENT = "1A5FB4";   // Confluent blue
const BOB = "0F62FE";         // IBM Carbon blue
const CODE_BG = "F3F4F6";
const TIP_BG = "FFF7E0", TIP_BAR = "E0A800";
const BOB_BG = "E8F0FE", BOB_BAR = "0F62FE";
const WARN_BG = "FDECEA", WARN_BAR = "D93025";
const HDR_FILL = "1A5FB4";
const ZEBRA = "F2F6FC";
const MONO = "Consolas";

const CONTENT_W = 9360; // US Letter, 1" margins

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
function num(text, ref = "steps") {
  const runs = Array.isArray(text) ? text : [new TextRun(text)];
  return new Paragraph({ numbering: { reference: ref, level: 0 }, spacing: { after: 80 }, children: runs });
}

// code block: one shaded monospace paragraph per line
function code(src) {
  const lines = src.replace(/\t/g, "  ").split("\n");
  return lines.map((ln, i) => new Paragraph({
    shading: { fill: CODE_BG, type: ShadingType.CLEAR },
    spacing: { before: i === 0 ? 60 : 0, after: i === lines.length - 1 ? 120 : 0, line: 264 },
    indent: { left: 120, right: 120 },
    children: [new TextRun({ text: ln.length ? ln : " ", font: MONO, size: 18 })],
  }));
}

// callout box (single-cell table with a colored left bar)
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

// "Ask Bob" box: label + intro + the prompt shown as code
function askBob(intro, prompt) {
  const body = [
    P([run(intro, {})]),
    P([run("Prompt to give Bob:", { italics: true, size: 20, color: "555555" })]),
    ...code(prompt),
  ];
  return callout("🤖  Ask Bob", body, BOB_BG, BOB_BAR);
}

function spacer(h = 80) { return new Paragraph({ spacing: { after: h }, children: [] }); }

// table builder
function table(headers, rows, widths) {
  const border = { style: BorderStyle.SINGLE, size: 1, color: "C9D3E0" };
  const borders = { top: border, bottom: border, left: border, right: border };
  const headRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => new TableCell({
      width: { size: widths[i], type: WidthType.DXA }, borders,
      shading: { fill: HDR_FILL, type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: "FFFFFF", size: 20 })] })],
    })),
  });
  const bodyRows = rows.map((r, ri) => new TableRow({
    children: r.map((c, i) => new TableCell({
      width: { size: widths[i], type: WidthType.DXA }, borders,
      shading: { fill: ri % 2 ? ZEBRA : "FFFFFF", type: ShadingType.CLEAR },
      margins: { top: 70, bottom: 70, left: 120, right: 120 },
      children: (Array.isArray(c) ? c : [c]).map((line) =>
        new Paragraph({ children: [new TextRun({ text: String(line), size: 19,
          font: /^`/.test(String(line)) ? MONO : undefined })] })),
    })),
  }));
  return new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: widths, rows: [headRow, ...bodyRows] });
}

function timeChip(t) {
  return new Paragraph({ spacing: { before: 60, after: 120 }, children: [
    new TextRun({ text: `⏱  ${t}`, bold: true, size: 19, color: CONFLUENT }),
  ] });
}

// ================= CONTENT =================
const children = [];

// ---- Cover ----
children.push(new Paragraph({ spacing: { before: 1600, after: 60 }, alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: "Real-Time Trade Forecasting", bold: true, size: 56, color: CONFLUENT })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 },
  children: [new TextRun({ text: "with Confluent Cloud & IBM Bob", bold: true, size: 36, color: BOB })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 },
  children: [new TextRun({ text: "Hands-On Lab  ·  60 Minutes", size: 26, color: "444444" })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 },
  children: [new TextRun({ text: "Stream · Enrich · Forecast — build a live momentum detector for stock trades,", italics: true, size: 22, color: "666666" })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 800 },
  children: [new TextRun({ text: "with an AI SDLC assistant writing the Flink SQL alongside you.", italics: true, size: 22, color: "666666" })] }));
children.push(table(
  ["You will use", "For"],
  [
    ["Confluent Cloud", "Managed Kafka, Datagen connectors, Schema Registry, Flink SQL, ML_FORECAST"],
    ["IBM Bob", "AI SDLC assistant — turns your plain-English intent into Flink SQL, explains it, and debugs with you"],
    ["A web browser only", "No Terraform, no local installs, no watsonx Orchestrate required"],
  ],
  [2600, 6760]));
children.push(new Paragraph({ children: [new PageBreak()] }));

// ---- TOC ----
children.push(H1("Contents"));
children.push(new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-2" }));
children.push(new Paragraph({ children: [new PageBreak()] }));

// ---- Overview ----
children.push(H1("1. What you will build"));
children.push(P("Picture an online trading platform. Stock trades stream in constantly, and the team wants two live insights: who is trading and where they are from (an enrichment join), and which stocks are surging in activity so momentum can be spotted as it builds (a forecast)."));
children.push(P("In this lab you build that pipeline end-to-end inside Confluent Cloud using Flink SQL — and you do it with IBM Bob as your pair-programmer. Instead of hand-writing every statement, you will describe what you want in plain English, let Bob generate the Flink SQL, then run it in Confluent Cloud and watch the results stream in."));
children.push(H2("The data flow"));
children.push(...code(
`Datagen: Users ─────────►  sample_data_users ──┐
(AVRO + Schema Registry)                        │   temporal join
                                                ▼   (latest user per trade)
                            users_keyed  ──►  trades_enriched
Datagen: Stock trades ─►  sample_data_stock_trades ▲
(AVRO + Schema Registry) ───────────────────────────┘
                                                │   TUMBLE 10s + COUNT per symbol
                                                ▼
                                         trades_forecast  ◄── ML_FORECAST()
                                                │
                                                ▼
                             "latest forecast per stock"  ← the payoff`));
children.push(P([
  run("Three of these artifacts — ", {}),
  run("users_keyed", { font: MONO }), run(", ", {}),
  run("trades_enriched", { font: MONO }), run(", and ", {}),
  run("trades_forecast", { font: MONO }),
  run(" — are ", {}), run("materialized tables", { bold: true }),
  run(": a table plus its always-on refresh query, in a single object.", {}),
]));
children.push(H2("What each tool does in this lab"));
children.push(table(["Step", "Confluent Cloud does…", "Bob does…"],
  [
    ["Provision", "Runs the Kafka cluster, Flink pool, Schema Registry", "Explains Basic vs Standard and the cost trade-off"],
    ["Ingest", "Datagen connectors emit AVRO users + trades", "Explains why AVRO (typed columns) beats raw JSON"],
    ["Enrich", "Executes the temporal-join materialized table", "Writes the join SQL from your description; explains warm-up"],
    ["Forecast", "Runs ML_FORECAST over 10-second windows", "Writes the windowed forecast SQL; explains the parameters"],
    ["Iterate", "Re-runs the changed statement live", "Regenerates SQL for a new requirement (the AI-SDLC loop)"],
  ],
  [1500, 3930, 3930]));

// ---- Agenda ----
children.push(H1("2. Agenda (60 minutes)"));
children.push(table(["Time", "Part", "Focus"],
  [
    ["0:00–0:05", "1 · Orientation", "Concept, architecture, what Bob is"],
    ["0:05–0:10", "2 · Prerequisites & meet Bob", "Confirm access; load Bob's Confluent skill"],
    ["0:10–0:18", "3 · Cluster + compute pool", "Create Kafka cluster and Flink pool"],
    ["0:18–0:26", "4 · Stream the data", "Two Datagen connectors (AVRO); verify topics"],
    ["0:26–0:30", "5 · Open Flink SQL", "Workspace; the catalog/database mapping"],
    ["0:30–0:36", "6 · Build with Bob #1", "users_keyed lookup table"],
    ["0:36–0:44", "7 · Build with Bob #2", "trades_enriched temporal join"],
    ["0:44–0:54", "8 · Build with Bob #3", "trades_forecast with ML_FORECAST"],
    ["0:54–0:58", "9 · Iterate with Bob", "Add a new requirement, re-run live"],
    ["0:58–1:00", "10 · Interpret & save resources", "Read the forecast; stop without deleting"],
  ],
  [1700, 3160, 4500]));

// ---- Prereqs ----
children.push(H1("3. Prerequisites & meet Bob"));
children.push(timeChip("0:05–0:10  ·  Part 2"));
children.push(H2("Before the session (do this ahead of time)"));
children.push(num("Create a Confluent Cloud account at confluent.cloud/signup. New sign-ups get $400 of free credit for 30 days."));
children.push(num("Add a payment card under Billing & payment. It is required even with credits; credit is spent first, so you will not be charged during the lab."));
children.push(num("Confirm you can open IBM Bob and start a chat/workspace."));
children.push(num("Use a Chromium-based browser (Chrome or Edge) for the Confluent Cloud console."));
children.push(warn("⚠  Cost & safety", [
  "Everything here fits inside the free credit. The only real risk is leaving resources running after the lab. Part 10 shows how to stop everything to roughly $0/hour without deleting your work.",
]));

children.push(H2("Meet Bob — your AI SDLC assistant"));
children.push(P("IBM Bob is an agentic AI assistant for the software lifecycle. In this lab Bob plays one focused role: you tell it, in plain English, what the pipeline should do, and it produces the Flink SQL, explains the tricky parts, and helps you debug. You stay in control — you read what Bob writes, run it in Confluent Cloud, and confirm the result."));
children.push(P([
  run("Bob works best when it has a ", {}), run("skill", { bold: true }),
  run(" — a file that teaches it this lab's Confluent + Flink patterns. One ships inside this lab's repo:", {}),
]));
children.push(...code(`git clone https://github.com/EdySamaha/IBM-confluent-bob-lab.git`));
children.push(bullet([run("Open the cloned repo folder as your Bob workspace so Bob discovers the skill at ", {}), run(".bob/skills/trade-forecasting-flink/SKILL.md", { font: MONO }), run(", or", {})]));
children.push(bullet("copy that .bob/skills/ folder into your own Bob workspace."));
children.push(tip("💡  If you don't have the skill loaded", [
  "Bob can still write correct Flink SQL from the prompts in this lab — the skill mainly sharpens its Confluent-specific conventions. Load it if you can; proceed either way.",
]));

// ---- Part 3 cluster ----
children.push(H1("4. Create the cluster and compute pool"));
children.push(timeChip("0:10–0:18  ·  Part 3"));
children.push(H2("4.1  Kafka cluster"));
children.push(num("In the Confluent Cloud console, open the Environments page and click your default environment."));
children.push(num("Go to Clusters → Add cluster (or Create cluster on first use)."));
children.push(num([run("Choose a ", {}), run("Basic", { bold: true }), run(" cluster, cloud ", {}), run("AWS", { bold: true }), run(", region ", {}), run("us-east-2 (Ohio)", { bold: true }), run(", then Continue.", {})]));
children.push(num("Give it a name such as trade-forecasting, review, and Launch. Wait for status Running."));
children.push(askBob(
  "Not sure why this lab uses Basic when the original walkthrough says Standard? Ask Bob to make the call for you.",
  `For the Confluent trade-forecasting lab (Datagen connectors + Flink
ML_FORECAST, a few MB of data, torn down same day), should I use a
Basic or Standard Kafka cluster? Explain the cost difference and
confirm Basic supports connectors, Flink, and Schema Registry.`));
children.push(tip("💡  Expected answer", [
  "Basic has no hourly base fee and fully supports Datagen connectors, Flink, Schema Registry and ML_FORECAST for this workload; Standard adds an hourly base charge you don't need here. Using Basic keeps a stopped-but-not-deleted environment near $0/hour.",
]));

children.push(H2("4.2  Flink compute pool"));
children.push(num("Open Flink from the left nav; select your environment → Continue."));
children.push(num("On the Compute pools tab, click Add compute pool."));
children.push(num([run("Choose ", {}), run("AWS", { bold: true }), run(", region ", {}), run("us-east-2 (Ohio)", { bold: true }), run(" — it must match the cluster — then Continue.", {})]));
children.push(num("Keep the defaults (max 10 CFU; an idle pool costs nothing) and Create."));
children.push(tip("💡  Why the pool is cheap at rest", [
  "A Flink compute pool bills only for the capacity (CFU) actually in use. With no statements running it auto-scales to 0 CFU = $0/hour.",
]));

// ---- Part 4 connectors ----
children.push(H1("5. Stream the data with Datagen connectors"));
children.push(timeChip("0:18–0:26  ·  Part 4"));
children.push(P("You need two live data streams. Confluent's Sample Data (Datagen) connector generates them for you — no producer to write."));
children.push(H2("5.1  Users connector"));
children.push(num("From your cluster, open Connectors → Add connector."));
children.push(num("Search for and select Sample Data (Datagen Source) → Get started."));
children.push(num([run("Choose the ", {}), run("Users", { bold: true }), run(" template. Set the topic to ", {}), run("sample_data_users", { font: MONO }), run(".", {})]));
children.push(num([run("Set the output record value format to ", {}), run("AVRO", { bold: true }), run(", then Launch.", {})]));
children.push(H2("5.2  Stock trades connector"));
children.push(num([run("Add another connector, choose the ", {}), run("Stock trades", { bold: true }), run(" template, topic ", {}), run("sample_data_stock_trades", { font: MONO }), run(", format ", {}), run("AVRO", { bold: true }), run(", Launch.", {})]));
children.push(num("Wait until both connectors show Running."));
children.push(num("Verify data: open Topics, click each topic's Messages tab, and watch live records arrive."));
children.push(askBob(
  "Why does the format matter? Ask Bob.",
  `In Confluent Cloud, I'm sending Datagen sample data into topics that
Flink SQL will read. Why should I pick AVRO instead of JSON for the
output format, and what breaks in Flink if I choose schemaless JSON?`));
children.push(warn("⚠  AVRO is not optional here", [
  "AVRO registers a schema in Schema Registry, so Flink sees typed columns (userid, symbol, price, …). Schemaless JSON leaves Flink with an opaque blob and nothing to join on. If your connectors used JSON, delete and recreate them as AVRO before continuing.",
]));

// ---- Part 5 flink workspace ----
children.push(H1("6. Open the Flink SQL workspace"));
children.push(timeChip("0:26–0:30  ·  Part 5"));
children.push(num("In Flink, once the pool is ready, click Open SQL workspace."));
children.push(num([run("Set ", {}), run("Use catalog", { bold: true }), run(" to your environment's name, and ", {}), run("Use database", { bold: true }), run(" to your cluster's name (", {}), run("trade-forecasting", { font: MONO }), run(").", {})]));
children.push(warn("⚠  The #1 thing people get wrong", [
  "In Confluent Cloud Flink, the catalog IS your environment name and the database IS your cluster name. Tutorials that show default / cluster_0 are just using their own names. Pick YOUR environment and YOUR cluster, or every table reference will fail to resolve.",
]));
children.push(askBob(
  "Confused by catalog vs database? Ask Bob to map it to your names.",
  `In Confluent Cloud Flink SQL, what do "catalog" and "database"
correspond to? My environment is named "bob-workshop-test-env" and my
cluster is "trade-forecasting". What should I set sql.current-catalog
and sql.current-database to?`));

// ---- Part 6 users_keyed ----
children.push(H1("7. Build with Bob #1 — the users lookup table"));
children.push(timeChip("0:30–0:36  ·  Part 6"));
children.push(P([
  run("From here on, the pattern repeats: ", {}), run("describe → generate → run → verify.", { bold: true }),
  run(" You describe the intent, Bob writes the Flink SQL, you paste it into the SQL workspace and run it, then you confirm the result.", {}),
]));
children.push(askBob(
  "Ask Bob to build a keyed lookup table from the users stream.",
  `Using Confluent Cloud Flink SQL, create a MATERIALIZED TABLE called
users_keyed from the topic sample_data_users. It should hold userid
(primary key, never null), regionid, and gender, so I can join trades
to the latest profile per user. Give me the CREATE MATERIALIZED TABLE
statement.`));
children.push(P("Bob should produce something equivalent to this. Run it in the SQL workspace:"));
children.push(...code(
`CREATE MATERIALIZED TABLE users_keyed (
  userid STRING NOT NULL,
  regionid STRING,
  gender STRING,
  PRIMARY KEY (userid) NOT ENFORCED
) AS
SELECT COALESCE(userid, '') AS userid, regionid, gender
FROM sample_data_users;`));
children.push(P([run("Verify: run ", {}), run("SELECT * FROM users_keyed;", { font: MONO }), run(" — you should see rows accumulate (User_1 … User_9).", {})]));

// ---- Part 7 trades_enriched ----
children.push(H1("8. Build with Bob #2 — enrich trades (temporal join)"));
children.push(timeChip("0:36–0:44  ·  Part 7"));
children.push(askBob(
  "Ask Bob to join each trade to the matching user profile as of the trade's time.",
  `In Confluent Cloud Flink SQL, create a MATERIALIZED TABLE
trades_enriched that joins sample_data_stock_trades (fields: userid,
symbol, side, quantity, price) to my users_keyed table, attaching each
user's regionid and gender as of the trade's event time. Use a
temporal join on the trade's $rowtime.`));
children.push(P("Expected statement:"));
children.push(...code(
`CREATE MATERIALIZED TABLE trades_enriched AS
SELECT
  t.userid, t.symbol, t.side, t.quantity, t.price,
  u.regionid, u.gender
FROM sample_data_stock_trades t
JOIN users_keyed FOR SYSTEM_TIME AS OF t.\`$rowtime\` AS u
  ON t.userid = u.userid;`));
children.push(P([run("Verify with ", {}), run("SELECT * FROM trades_enriched;", { font: MONO }), run(".", {})]));
children.push(warn("⚠  Seeing zero rows at first? That's normal.", [
  "A temporal join emits nothing for the first few seconds while watermarks warm up. Once users_keyed has committed rows at or behind the trades' timestamps, rows flow. Wait ~30–60 seconds and re-run the SELECT before assuming anything is broken.",
]));
children.push(askBob(
  "If it stays empty, let Bob debug it with you.",
  `My Flink temporal join trades_enriched returns 0 rows even though both
source topics have data. What are the usual causes (watermarks, key
mismatch, catalog/database) and how do I check each one?`));

// ---- Part 8 forecast ----
children.push(H1("9. Build with Bob #3 — forecast the surge (ML_FORECAST)"));
children.push(timeChip("0:44–0:54  ·  Part 8"));
children.push(P("This is the payoff. You will count trades per stock in 10-second windows, then use Confluent Intelligence's built-in ML_FORECAST to predict each stock's next-window activity."));
children.push(askBob(
  "Ask Bob for the windowed forecast.",
  `In Confluent Cloud Flink SQL, create a MATERIALIZED TABLE
trades_forecast that, per stock symbol, counts trades in 10-second
tumbling windows over trades_enriched, then applies ML_FORECAST over
that count ordered by window time (minTrainingSize 10, horizon 5).
Output symbol, window end as ts, the current count, and the next
forecast value and its upper bound. Use the TUMBLE table-valued
function on $rowtime.`));
children.push(P("Expected statement:"));
children.push(...code(
`CREATE MATERIALIZED TABLE trades_forecast AS
SELECT
  symbol, ts,
  trade_count                AS current_count,
  forecast[1].forecast_value AS forecast_count,
  forecast[1].upper_bound    AS upper_bound
FROM (
  SELECT
    symbol, window_end AS ts, trade_count,
    ML_FORECAST(
      CAST(trade_count AS DOUBLE),
      window_end,
      JSON_OBJECT('minTrainingSize' VALUE 10, 'horizon' VALUE 5)
    ) OVER (PARTITION BY symbol ORDER BY window_time) AS forecast
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
  "Have Bob explain the forecast so you can teach it back.",
  `Explain, in plain terms, what ML_FORECAST is doing here: what do
minTrainingSize=10 and horizon=5 mean, why do we read forecast[1],
and why won't a stock produce a forecast until it has ~10 closed
windows of history?`));
children.push(tip("💡  Expected explanation", [
  "ML_FORECAST returns an array of future predictions; forecast[1] is the very next window. minTrainingSize=10 means a symbol needs ~10 closed 10-second windows (~100 seconds) of its own history before it forecasts; horizon=5 means it projects up to 5 windows ahead. Give it a couple of minutes to warm up.",
]));
children.push(H2("9.1  The result query"));
children.push(askBob(
  "Ask Bob for a query that shows only the latest forecast per stock.",
  `Give me a Flink SQL query over trades_forecast that returns only the
most recent row per symbol (latest by $rowtime), showing symbol,
current_count, forecast_count, and upper_bound.`));
children.push(P("Expected query:"));
children.push(...code(
`SELECT symbol, current_count, forecast_count, upper_bound
FROM (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY \`$rowtime\` DESC) AS row_num
  FROM trades_forecast
)
WHERE row_num = 1;`));
children.push(P([
  run("Read it like this: ", {}),
  run("current_count", { font: MONO }), run(" = trades in the latest 10s window; ", {}),
  run("forecast_count", { font: MONO }), run(" = predicted trades next window; ", {}),
  run("upper_bound", { font: MONO }), run(" = top of the confidence range. When ", {}),
  run("forecast_count > current_count", { font: MONO }), run(", the stock is heating up.", {}),
]));
children.push(H2("9.2  A reference result"));
children.push(P("Your symbols and numbers will differ, but a healthy run looks like this:"));
children.push(table(["symbol", "current", "forecast", "upper", "trend"],
  [
    ["ZJZZT", "13", "15.0", "23.0", "heating up"],
    ["ZTEST", "18", "19.0", "35.0", "heating up"],
    ["ZVV", "16", "20.0", "34.0", "heating up"],
    ["ZVZZT", "11", "12.0", "32.0", "heating up"],
    ["ZWZZT", "13", "15.0", "34.0", "heating up"],
    ["ZXZZT", "13", "15.0", "34.0", "heating up"],
  ],
  [1900, 1700, 1800, 1600, 2360]));

// ---- Part 9 iterate ----
children.push(H1("10. Iterate with Bob (the AI-SDLC loop)"));
children.push(timeChip("0:54–0:58  ·  Part 9"));
children.push(P("Real projects change. This step shows the loop that makes an AI SDLC assistant valuable: new requirement in, working SQL out, re-run live. Pick one of the following and ask Bob for it."));
children.push(askBob(
  "Option A — break the forecast down by region.",
  `Extend my pipeline: I want the trade surge forecast per stock AND per
regionid (from trades_enriched). Give me the modified trades_forecast
definition and note anything I must drop/recreate to apply it.`));
children.push(askBob(
  "Option B — turn it into an alert.",
  `Give me a Flink SQL query over trades_forecast that returns only the
stocks where forecast_count is at least 25% higher than current_count
— i.e. the ones clearly heating up — as a real-time watch list.`));
children.push(num("Take Bob's statement, run it in the SQL workspace, and confirm the new result."));
children.push(num("Notice the loop: you never hand-edited SQL syntax — you changed the requirement and Bob re-derived it."));
children.push(tip("💡  Stretch (bonus, if time allows)", [
  "With the Confluent skill loaded, Bob can also generate the whole environment as Terraform Infrastructure-as-Code (cluster, Schema Registry, Flink pool, API keys, role bindings, and the Flink statements). Ask Bob to \"generate Terraform for this pipeline\" to see the IaC path.",
]));

// ---- Part 10 save resources ----
children.push(H1("11. Interpret, then stop everything (without deleting)"));
children.push(timeChip("0:58–1:00  ·  Part 10"));
children.push(P("You built a live momentum detector: two raw streams became an enriched, windowed, forecasted view that flags stocks about to surge. Now park the resources so they stop billing but nothing is lost."));
children.push(H2("11.1  Stop without deleting  (recommended)"));
children.push(num("Pause both Datagen connectors (Connectors → each connector → Pause). Paused connectors bill $0."));
children.push(num("Suspend each materialized table's refresh so it stops computing but keeps its data:"));
children.push(...code(
`ALTER MATERIALIZED TABLE trades_forecast SUSPEND;
ALTER MATERIALIZED TABLE trades_enriched SUSPEND;
ALTER MATERIALIZED TABLE users_keyed SUSPEND;`));
children.push(num("With no statements running, the Flink pool auto-scales to 0 CFU. A Basic cluster has no hourly base fee, so ongoing cost is roughly $0/hour (a few MB of storage)."));
children.push(askBob(
  "Let Bob generate your resume steps for next time.",
  `I paused my Datagen connectors and ran ALTER MATERIALIZED TABLE ...
SUSPEND on users_keyed, trades_enriched and trades_forecast in
Confluent Cloud. Give me the exact steps to resume everything later
and how long to wait before the forecast query returns rows again.`));
children.push(tip("💡  Resume later", [
  "Resume both connectors, run ALTER MATERIALIZED TABLE <name> RESUME; on all three tables (users_keyed first), wait ~2 minutes for windows to refill, then re-run the result query from 9.1.",
]));
children.push(H2("11.2  Full teardown  (only if you want zero footprint — this deletes)"));
children.push(...code(
`DROP MATERIALIZED TABLE trades_forecast;
DROP MATERIALIZED TABLE trades_enriched;
DROP MATERIALIZED TABLE users_keyed;`));
children.push(num("Delete both connectors (Connectors → each → Settings → Delete)."));
children.push(num("Delete the compute pool, then the cluster (Cluster → Settings → Delete cluster). The environment can stay."));

// ---- Appendix ----
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(H1("Appendix A — Full Flink SQL, in order"));
children.push(...code(
`-- 1. Users lookup
CREATE MATERIALIZED TABLE users_keyed (
  userid STRING NOT NULL,
  regionid STRING,
  gender STRING,
  PRIMARY KEY (userid) NOT ENFORCED
) AS
SELECT COALESCE(userid, '') AS userid, regionid, gender
FROM sample_data_users;

-- 2. Enrich trades (temporal join)
CREATE MATERIALIZED TABLE trades_enriched AS
SELECT t.userid, t.symbol, t.side, t.quantity, t.price, u.regionid, u.gender
FROM sample_data_stock_trades t
JOIN users_keyed FOR SYSTEM_TIME AS OF t.\`$rowtime\` AS u
  ON t.userid = u.userid;

-- 3. Forecast per stock
CREATE MATERIALIZED TABLE trades_forecast AS
SELECT symbol, ts,
  trade_count                AS current_count,
  forecast[1].forecast_value AS forecast_count,
  forecast[1].upper_bound    AS upper_bound
FROM (
  SELECT symbol, window_end AS ts, trade_count,
    ML_FORECAST(
      CAST(trade_count AS DOUBLE),
      window_end,
      JSON_OBJECT('minTrainingSize' VALUE 10, 'horizon' VALUE 5)
    ) OVER (PARTITION BY symbol ORDER BY window_time) AS forecast
  FROM (
    SELECT symbol, window_end, window_time, COUNT(*) AS trade_count
    FROM TABLE(TUMBLE(TABLE trades_enriched, DESCRIPTOR(\`$rowtime\`), INTERVAL '10' SECONDS))
    GROUP BY symbol, window_start, window_end, window_time
  )
)
WHERE CARDINALITY(forecast) >= 1;

-- 4. Latest forecast per stock (the result)
SELECT symbol, current_count, forecast_count, upper_bound
FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY \`$rowtime\` DESC) AS row_num
  FROM trades_forecast
)
WHERE row_num = 1;`));

children.push(H1("Appendix B — Troubleshooting"));
children.push(table(["Symptom", "Likely cause", "Fix"],
  [
    ["Table/column won't resolve", "Wrong catalog/database", "Set catalog = environment name, database = cluster name"],
    ["Flink sees one opaque column", "Topic is schemaless JSON", "Recreate Datagen connectors with AVRO format"],
    ["Join returns 0 rows", "Watermark warm-up or key mismatch", "Wait 30–60s; confirm userid overlaps on both sides"],
    ["No forecast rows yet", "< 10 closed windows per symbol", "Wait ~2 minutes; ML_FORECAST needs history"],
    ["Connector stuck / failed", "Transient schema registration", "Delete and recreate the connector (same config)"],
  ],
  [2500, 3200, 3660]));

children.push(H1("Appendix C — Resource & cost summary"));
children.push(table(["Resource", "State after Part 11.1", "Cost at rest"],
  [
    ["Basic Kafka cluster", "Running", "No hourly base fee; a few MB storage"],
    ["Flink compute pool", "Idle, 0 CFU", "$0/hour"],
    ["Datagen connectors (2)", "Paused", "$0"],
    ["Materialized tables (3)", "Suspended", "$0; data retained"],
    ["Topics + data", "Retained", "Negligible"],
  ],
  [2900, 3200, 3260]));
children.push(P([run("Net ongoing cost after parking ≈ ", {}), run("$0/hour", { bold: true }), run(". Nothing is deleted; everything resumes on demand.", {})]));

// ================= DOCUMENT =================
const doc = new Document({
  creator: "Confluent + IBM Bob Lab",
  title: "Real-Time Trade Forecasting with Confluent Cloud & IBM Bob",
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 30, bold: true, font: "Arial", color: CONFLUENT },
        paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 0,
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "D5DEEA", space: 4 } } } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 25, bold: true, font: "Arial", color: "222222" },
        paragraph: { spacing: { before: 220, after: 120 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 22, bold: true, font: "Arial", color: "444444" },
        paragraph: { spacing: { before: 160, after: 100 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [
        { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 620, hanging: 300 } } } },
        { level: 1, format: LevelFormat.BULLET, text: "◦", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 1140, hanging: 300 } } } },
      ] },
      { reference: "steps", levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 620, hanging: 320 } } } },
      ] },
    ],
  },
  sections: [{
    properties: { page: {
      size: { width: 12240, height: 15840 },
      margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
    } },
    headers: { default: new Header({ children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "D5DEEA", space: 2 } },
      children: [new TextRun({ text: "Trade Forecasting · Confluent Cloud + IBM Bob", size: 16, color: "8A94A6" })],
    })] }) },
    footers: { default: new Footer({ children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "Page ", size: 16, color: "8A94A6" }),
        new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "8A94A6" }),
        new TextRun({ text: " · Hands-On Lab (60 min)", size: 16, color: "8A94A6" })],
    })] }) },
    children,
  }],
});

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync("Trade-Forecasting-Confluent-Bob-Lab.docx", buffer);
  console.log("wrote Trade-Forecasting-Confluent-Bob-Lab.docx");
});
