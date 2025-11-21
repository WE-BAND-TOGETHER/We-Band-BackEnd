import express from "express";

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello from Express + TypeScript + Yarn Berry!");
});

app.listen(4000, () => {
  console.log("Server running at http://localhost:4000");
});
