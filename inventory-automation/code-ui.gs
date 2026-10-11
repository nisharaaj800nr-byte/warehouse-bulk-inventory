/* ============================================================
   Code-UI.gs — Google-native UI entry point
   ============================================================
   Serves the UI directly from Apps Script via HtmlService.
   The browser talks ONLY to google.script.run →
   runApi() in Code-API.gs → Google Sheets.

   NO third-party hosting. NO API URL. NO external service.
   Everything lives inside your Google account.

   v1.1+: the React portal (built as the single-file "App.html") is the
   default UI. The legacy single-file UI (Index.html) is still served
   when "App" is missing, or explicitly with ?ui=classic.

   SETUP:
   1. Add Code.js, Code-API.gs, Code-Auth.gs, Code-UI.gs AND
      Index.html to the same Apps Script project.
   2. React portal: + → HTML → name it "App" → paste the contents
      of dist-gas/App.html from the portal build (folder: app/).
   3. Run setupAutomationSystem() once, then seedUserPassword(...) once.
   4. Deploy → New deployment → Web app
        Execute as: Me
        Who has access: Anyone with link
   5. Open the deployment URL — the portal loads from Google.

   IMPORTANT: doGet lives HERE (serves the UI). doPost and runApi
   live in Code-API.gs. No duplicate handler functions.
   ============================================================ */

function doGet(e) {
  var useClassic = !!(e && e.parameter && e.parameter.ui === 'classic');
  if (!useClassic) {
    try {
      return HtmlService.createHtmlOutputFromFile('App')
        .setTitle(ORS.APP_NAME + ' — Portal')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    } catch (err) {
      /* "App" file missing or failed to load — fall back to the legacy
         UI below so the deployment never breaks. */
    }
  }
  var html;
  try {
    html = HtmlService.createHtmlOutputFromFile('Index');
  } catch (e2) {
    // Clear error instead of a blank screen if Index.html is missing from the project
    return HtmlService.createHtmlOutput(
      '<div style="font-family:Segoe UI,Arial,sans-serif;padding:28px;max-width:640px">' +
      '<h2 style="color:#C5221F">UI file not found</h2>' +
      '<p>The Apps Script project must include an <strong>Index.html</strong> file' +
      ' (in the editor: <strong>+ &rarr; HTML</strong>, file name: <strong>Index</strong>).</p>' +
      '<p style="color:#666">Error: ' + String(e2 && e2.message || e2) + '</p></div>')
      .setTitle('Bulk Repair - Setup needed');
  }
  return html
    .setTitle(ORS.APP_NAME + ' - Control Center')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
