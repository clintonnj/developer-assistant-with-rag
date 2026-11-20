import express from "express";
import { runIngest } from "./ingest.ts";

const app = express();
app.use(express.json());

app.post("/api/init", async (_req, res) => {
  try {
    const result = await runIngest();
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ingestion failed" });
  }
});

export default app;