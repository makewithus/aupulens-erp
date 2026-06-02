const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development';

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
    },
    frame: true,
    backgroundColor: '#000000',
    icon: path.join(__dirname, '../public/logo.svg'),
    show: false,
  });

  // Wait for window to be ready before showing
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  const startURL = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '../out/index.html')}`;

  mainWindow.loadURL(startURL).catch((err) => {
    console.error('Failed to load URL:', err);
    
    // Show helpful error message
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Aupulens ERP - Error</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              padding: 20px;
            }
            .container {
              background: rgba(0, 0, 0, 0.3);
              padding: 40px;
              border-radius: 20px;
              max-width: 600px;
              text-align: center;
              backdrop-filter: blur(10px);
            }
            h1 { margin: 0 0 20px 0; font-size: 32px; }
            p { margin: 10px 0; line-height: 1.6; opacity: 0.9; }
            code {
              background: rgba(0, 0, 0, 0.5);
              padding: 4px 8px;
              border-radius: 4px;
              font-family: 'Courier New', monospace;
            }
            .error-code {
              background: rgba(255, 0, 0, 0.2);
              border: 1px solid rgba(255, 0, 0, 0.5);
              padding: 15px;
              border-radius: 10px;
              margin: 20px 0;
              font-size: 14px;
            }
            .solution {
              background: rgba(255, 255, 255, 0.1);
              padding: 20px;
              border-radius: 10px;
              margin-top: 20px;
              text-align: left;
            }
            .solution h3 { margin-top: 0; color: #ffd700; }
            .command {
              background: rgba(0, 0, 0, 0.8);
              color: #00ff00;
              padding: 10px 15px;
              border-radius: 5px;
              margin: 10px 0;
              font-family: 'Courier New', monospace;
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>⚠️ Build Files Not Found</h1>
            <p>The application is running in production mode, but the built files are missing.</p>
            
            <div class="error-code">
              <strong>Error:</strong> ${err.message || 'ERR_FILE_NOT_FOUND'}
            </div>

            <div class="solution">
              <h3>🔧 Solutions:</h3>
              <p><strong>Option 1:</strong> Run in development mode</p>
              <div class="command">npm run electron:dev</div>
              
              <p style="margin-top: 20px;"><strong>Option 2:</strong> Build the application first</p>
              <div class="command">npm run electron:build:win</div>
              
              <p style="margin-top: 20px; opacity: 0.7; font-size: 14px;">
                💡 Tip: Use <code>npm run electron:dev</code> for development
              </p>
            </div>
          </div>
        </body>
      </html>
    `)}`);
  });

  // Open DevTools in development mode
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle window controls for custom title bar (if needed)
  ipcMain.on('minimize-window', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.on('maximize-window', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.on('close-window', () => {
    if (mainWindow) mainWindow.close();
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle any uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});
