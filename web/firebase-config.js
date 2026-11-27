/**
 * FixMechanic Web Admin Console Firebase & Spark Backend Configuration.
 * Uses the unified `(default)` Firestore database on project `fixmechanic-firebase`.
 * Never hardcode live API keys here; configure production Web SDK values via
 * runtime `window.__FIXMECHANIC_CONFIG__` or the Console Settings modal.
 */
(function () {
  const isLocal =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem("fixmechanic_web_cfg") || "{}");
  } catch (_) {
    saved = {};
  }

  const runtimeOverride = window.__FIXMECHANIC_CONFIG__ || {};

  window.FIXMECHANIC_CFG = {
    firebase: {
      apiKey: runtimeOverride.apiKey || saved.apiKey || (isLocal ? "emulator-local-key" : ""),
      authDomain: runtimeOverride.authDomain || saved.authDomain || "fixmechanic-firebase.firebaseapp.com",
      projectId: runtimeOverride.projectId || saved.projectId || "fixmechanic-firebase",
      appId: runtimeOverride.appId || saved.appId || "",
    },
    databaseId: "(default)",
    useEmulators:
      typeof runtimeOverride.useEmulators === "boolean"
        ? runtimeOverride.useEmulators
        : typeof saved.useEmulators === "boolean"
          ? saved.useEmulators
          : isLocal,
    authEmulatorUrl: runtimeOverride.authEmulatorUrl || saved.authEmulatorUrl || "http://127.0.0.1:9099",
    firestoreEmulatorHost: runtimeOverride.firestoreEmulatorHost || saved.firestoreEmulatorHost || "127.0.0.1",
    firestoreEmulatorPort: Number(runtimeOverride.firestoreEmulatorPort || saved.firestoreEmulatorPort || 8085),
    sparkBackendUrl: runtimeOverride.sparkBackendUrl || saved.sparkBackendUrl || "http://127.0.0.1:5055",
  };
})();
