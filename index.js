const fs = require("fs");
const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const http = require("http");
const socketIo = require("socket.io");
const multer = require("multer");
const sharp = require("sharp");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const port = 3000;

app.set("view engine", "ejs");

app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.render("index");
});

app.get("/admin/:admin", (req, res) => {
  const admin = req.params.admin;
  const status = JSON.parse(fs.readFileSync("status.json"));
  const isResting = status[admin];

  const adminDir = path.join(__dirname, "uploads", admin);
  let images = [];
  const orderFile = path.join(adminDir, "order.json");
  if (fs.existsSync(orderFile)) {
    images = JSON.parse(fs.readFileSync(orderFile));
  } else if (fs.existsSync(adminDir)) {
    images = fs.readdirSync(adminDir).filter((file) => file !== "order.json");
  }

  res.render("admin", { admin: admin, isResting: isResting, images: images });
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const admin = req.params.admin;
    const dir = `./uploads/${admin}`;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

app.post("/upload/:admin", upload.array("images", 10), async (req, res) => {
  const admin = req.params.admin;
  const adminDir = path.join(__dirname, "uploads", admin);

  for (const file of req.files) {
    const inputPath = file.path;
    const outputPath = path.join(adminDir, "rotated-" + file.filename);

    await sharp(inputPath).rotate(-90).toFile(outputPath);

    fs.unlinkSync(inputPath);
    fs.renameSync(outputPath, inputPath);
  }

  let images = fs.readdirSync(adminDir).filter((file) => file !== "order.json");

  fs.writeFileSync(path.join(adminDir, "order.json"), JSON.stringify(images));
  io.emit("orderUpdate", { admin: admin, images: images });

  res.redirect(`/admin/${admin}`);
});

app.get("/s/:admin", (req, res) => {
  const admin = req.params.admin;
  const dir = path.join(__dirname, "uploads", admin);
  const status = JSON.parse(fs.readFileSync("status.json"));
  const isResting = status[admin];
  const orderFile = path.join(dir, "order.json");

  let images = [];
  if (fs.existsSync(orderFile)) {
    images = JSON.parse(fs.readFileSync(orderFile));
  } else if (fs.existsSync(dir)) {
    images = fs.readdirSync(dir).filter((file) => file !== "order.json");
  }

  if (isResting) {
    res.render(`s/admin`, {
      images: [],
      admin: admin,
      isResting: true,
    });
  } else {
    res.render(`s/admin`, {
      images: images,
      admin: admin,
      isResting: false,
    });
  }
});

app.delete("/delete-image/:admin/:filename", (req, res) => {
  const admin = req.params.admin;
  const filename = req.params.filename;
  const imagePath = path.join(__dirname, "uploads", admin, filename);

  fs.unlink(imagePath, (err) => {
    if (err) {
      console.error("Failed to delete image:", err);
      res.status(500).send("Failed to delete image");
    } else {
      console.log(`Deleted image ${filename}`);

      const orderFile = path.join(__dirname, "uploads", admin, "order.json");
      let images = JSON.parse(fs.readFileSync(orderFile)).filter(
        (file) => file !== filename,
      );
      fs.writeFileSync(orderFile, JSON.stringify(images));
      io.emit("orderUpdate", { admin: admin, images: images });

      res.sendStatus(200);
    }
  });
});

app.post("/rest/:admin", (req, res) => {
  const admin = req.params.admin;
  const status = JSON.parse(fs.readFileSync("status.json"));
  status[admin] = req.body.rest === "on";
  fs.writeFileSync("status.json", JSON.stringify(status));

  io.emit("statusUpdate", { admin: admin, isResting: status[admin] });

  res.redirect(`/admin/${admin}`);
});

app.post("/save-order/:admin", (req, res) => {
  const admin = req.params.admin;
  const order = req.body.order;
  const orderFile = path.join(__dirname, "uploads", admin, "order.json");

  fs.writeFileSync(orderFile, JSON.stringify(order));
  io.emit("orderUpdate", { admin: admin, images: order });

  res.sendStatus(200);
});

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

io.on("connection", (socket) => {
  socket.on("refreshSlideshow", () => {
    io.emit("refreshSlideshow");
  });
});

app.use(function (req, res, next) {
  res.status(404).send("404: Page not Found");
});

server.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

module.exports = app;
