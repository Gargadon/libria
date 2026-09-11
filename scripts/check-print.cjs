// Exercise the application's actual PDF handler with isolated user data.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const directory = process.argv[2];
app.setPath('userData', path.join(directory, 'electron-profile'));
app.whenReady().then(async () => {
  const handlers = new Map();
  const sender = {};
  const root = path.resolve(__dirname, '..');
  const fakeApp = { setName() {}, setDesktopName() {}, requestSingleInstanceLock: () => true,
    on() {}, whenReady: () => ({ then() {} }), commandLine: app.commandLine,
    getPath: () => directory };
  const context = vm.createContext({
    require: name => name === 'electron' ? { app: fakeApp, BrowserWindow,
      ipcMain: { handle: (key, fn) => handlers.set(key, fn), on() {} } } : require(name),
    __dirname: root, process, Buffer, console, setTimeout, sender,
  });
  try {
    vm.runInContext(
      fs.readFileSync(path.join(root, 'main.js'), 'utf8') + '\nmainWindow = { webContents: sender };',
      context,
      { importModuleDynamically: specifier => import(specifier) },
    );
    const pdf = await handlers.get('pdf:printFromHTML')({ sender }, fs.readFileSync(path.join(directory, 'print.html'), 'utf8'), JSON.parse(fs.readFileSync(path.join(directory, 'options.json'))));
    fs.writeFileSync(path.join(directory, 'book.pdf'), Buffer.from(pdf));
    console.log('PDF:', path.join(directory, 'book.pdf'));
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { app.quit(); }
});
