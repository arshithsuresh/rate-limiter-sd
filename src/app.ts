import express from "express";
import itemRoutes from "./routes/item.routes";

const app = express();

app.use(express.json());

app.use("/items", itemRoutes);

export default app;
