const { app, BrowserWindow } = require('electron');
const fs = require('fs');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadURL(`data:text/html,
    <html><head><style>
      @media print {
        @page { size: 5in 8in; margin-top: 1in; margin-bottom: 1in; }
        @page :left { margin-left: 2in; margin-right: 0.5in; }
        @page :right { margin-left: 0.5in; margin-right: 2in; }
        .page { page-break-after: always; height: 100%; border: 1px solid red; }
      }
    </style></head>
    <body>
      <div class="page">Page 1 (Right)</div>
      <div class="page">Page 2 (Left)</div>
      <div class="page">Page 3 (Right)</div>
    </body></html>
  `);
  
  try {
    const pdf = await win.webContents.printToPDF({
      pageSize: { width: 5, height: 8 },
      printBackground: true,
      margins: { marginType: 'none' } // Test if 'none' allows @page
    });
    fs.writeFileSync('test-margins-none.pdf', pdf);
    console.log('Saved test-margins-none.pdf');
  } catch (e) {
    console.error('PDF Failed:', e.message);
  }

  app.quit();
});
