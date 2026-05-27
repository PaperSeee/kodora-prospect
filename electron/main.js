const { app, BrowserWindow, shell, Menu } = require("electron")
const { spawn } = require("child_process")
const path = require("path")
const http = require("http")

const PORT = 3000
let mainWindow = null
let nextServer = null

function isPortInUse(port) {
  return new Promise((resolve) => {
    http.get(`http://localhost:${port}`, () => resolve(true)).on("error", () => resolve(false))
  })
}

function waitForServer(url, retries = 60) {
  return new Promise((resolve, reject) => {
    const check = (n) => {
      http
        .get(url, () => resolve())
        .on("error", () => {
          if (n <= 0) return reject(new Error("Server timeout"))
          setTimeout(() => check(n - 1), 500)
        })
    }
    check(retries)
  })
}

function startNextServer() {
  const appDir = app.isPackaged
    ? path.join(process.resourcesPath, "app")
    : path.join(__dirname, "..")

  // Chemin absolu vers npm (Electron n'hérite pas du PATH shell)
  const npmCmd = process.platform === "win32"
    ? "npm.cmd"
    : (["/opt/homebrew/bin/npm", "/usr/local/bin/npm", "/usr/bin/npm"].find(
        (p) => require("fs").existsSync(p)
      ) ?? "npm")

  nextServer = spawn(npmCmd, ["run", "start"], {
    cwd: appDir,
    env: {
      ...process.env,
      PORT: String(PORT),
      DATABASE_URL: `file:${path.join(appDir, "kodora.db")}`,
    },
    stdio: "pipe",
  })

  nextServer.stdout?.on("data", (d) => console.log("[next]", d.toString()))
  nextServer.stderr?.on("data", (d) => console.error("[next]", d.toString()))
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#09090b",
    title: "Kodora Prospect",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, "icon.png"),
  })

  // Splash de chargement depuis fichier local
  mainWindow.loadFile(path.join(__dirname, "splash.html"))

  // Attendre que Next.js soit prêt puis charger l'app
  waitForServer(`http://localhost:${PORT}`)
    .then(() => {
      mainWindow.loadURL(`http://localhost:${PORT}`)
    })
    .catch(() => {
      mainWindow.loadURL(`data:text/html,<body style="background:#09090b;color:white;font-family:sans-serif;padding:40px"><h2>Erreur de démarrage</h2><p>Le serveur n'a pas pu démarrer. Vérifiez que Node.js est installé.</p></body>`)
    })

  // Ouvrir les liens externes dans le navigateur
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: "deny" }
  })

  mainWindow.on("closed", () => { mainWindow = null })
}

// Menu minimal macOS
const menuTemplate = [
  {
    label: "Kodora Prospect",
    submenu: [
      { label: "À propos de Kodora Prospect", role: "about" },
      { type: "separator" },
      { label: "Quitter", accelerator: "Cmd+Q", role: "quit" },
    ],
  },
  {
    label: "Édition",
    submenu: [
      { role: "undo" }, { role: "redo" }, { type: "separator" },
      { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" },
    ],
  },
  {
    label: "Affichage",
    submenu: [
      { role: "reload" },
      { role: "toggleDevTools" },
      { type: "separator" },
      { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
    ],
  },
]

app.whenReady().then(async () => {
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate))
  // Si le serveur tourne déjà (ex: dev), on ne le relance pas
  const alreadyRunning = await isPortInUse(PORT)
  if (!alreadyRunning) startNextServer()
  createWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    nextServer?.kill()
    app.quit()
  }
})

app.on("before-quit", () => {
  nextServer?.kill()
})
