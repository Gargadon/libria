/** Called after document handlers so Libria's own shortcuts keep their actions. */
export function preventBrowserShortcut(event: KeyboardEvent): void {
  const key = event.key.toLowerCase();
  // Let Windows request a normal close, including Libria's unsaved-changes guard.
  if (key === 'f4' && event.altKey && !event.ctrlKey && !event.metaKey) return;
  const command = event.ctrlKey || event.metaKey;
  const functionKey = /^f(?:[1-9]|1[0-2])$/.test(key) && !['f7', 'f11'].includes(key);
  const browserKey = ['browserback', 'browserforward', 'browserrefresh', 'browserhome', 'browsersearch', 'browserfavorites'].includes(key);
  const navigation = event.altKey && ['arrowleft', 'arrowright', 'home', 'd'].includes(key);
  // Allow native text editing; application formatting and menu actions already ran.
  const nativeEditing = (!event.shiftKey && ['a', 'c', 'x', 'v', 'z', 'y', 'insert'].includes(key)) ||
    (event.shiftKey && ['v', 'z'].includes(key)) ||
    ['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'home', 'end', 'backspace', 'enter', ' '].includes(key) ||
    (key === 'delete' && !event.shiftKey);
  // AltGr is needed to type on many keyboard layouts.
  const altGr = event.getModifierState('AltGraph') ||
    (event.ctrlKey && event.altKey && !event.metaKey && key.length === 1);
  const browserCommand = command && !nativeEditing && !altGr;
  if (functionKey || browserKey || navigation || browserCommand) event.preventDefault();
}
