const { app, BrowserWindow } = require('electron')
const http = require('http')
const fs = require('fs')
const path = require('path')

app.setName('Fantasy Studio')

let server = null

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
}

function startServer() {
  const distDirectory = app.isPackaged
  ? path.join(process.resourcesPath, 'dist')
  : path.join(__dirname, '..', 'dist')

  return new Promise((resolve, reject) => {
    server = http.createServer((request, response) => {
      try {
        const requestUrl = new URL(
          request.url,
          'http://127.0.0.1',
        )

        let requestedPath = decodeURIComponent(
          requestUrl.pathname,
        )

        if (requestedPath === '/') {
          requestedPath = '/index.html'
        }

        let filePath = path.join(
          distDirectory,
          requestedPath,
        )

        const normalizedDist =
          path.normalize(distDirectory)

        const normalizedFile =
          path.normalize(filePath)

        if (!normalizedFile.startsWith(normalizedDist)) {
          response.writeHead(403)
          response.end('Verboden')
          return
        }

        if (
          !fs.existsSync(filePath) ||
          fs.statSync(filePath).isDirectory()
        ) {
          filePath = path.join(
            distDirectory,
            'index.html',
          )
        }

        const extension =
          path.extname(filePath).toLowerCase()

        response.writeHead(200, {
          'Content-Type':
            mimeTypes[extension] ||
            'application/octet-stream',
          'Cache-Control': 'no-cache',
        })

        fs.createReadStream(filePath).pipe(response)
      } catch (error) {
        response.writeHead(500)
        response.end('Fantasy Studio kon niet laden.')
      }
    })

    server.once('error', reject)

    server.listen(0, '127.0.0.1', () => {
      const address = server.address()

      resolve(
        `http://127.0.0.1:${address.port}`,
      )
    })
  })
}

async function createWindow() {
  const localUrl = await startServer()

  const windowIcon = app.isPackaged
  ? path.join(process.resourcesPath, 'icon.ico')
  : path.join(__dirname, '..', 'build', 'icon.ico')

const win = new BrowserWindow({
  width: 1700,
  height: 1000,
  minWidth: 1280,
  minHeight: 720,
  icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    autoHideMenuBar: true,
    title: 'Fantasy Studio',
    backgroundColor: '#0b1018',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomFactor(1)
    win.webContents.setVisualZoomLevelLimits(1, 1)
  })

  win.webContents.on('zoom-changed', (event) => {
    event.preventDefault()
    win.webContents.setZoomFactor(1)
  })

  await win.loadURL(localUrl)

  win.maximize()
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (server) {
    server.close()
    server = null
  }

  if (process.platform !== 'darwin') {
    app.quit()
  }
})