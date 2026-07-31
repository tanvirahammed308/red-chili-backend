
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";



import productRoutes from "./routes/product.routes.js";
import cartRoutes from "./routes/cart.routes.js"; 

 import authRouter from "./routes/user.routes.js";
import orderRouter from "./routes/order.routes.js";
 
const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);

app.use("/api/auth", authRouter);
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);
 
 app.use("/api/orders", orderRouter);
 
app.get("/", (req, res) => {
  res.send("Red Chili Restaurant API Running");
});

export default app;