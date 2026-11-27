/**
 * FixMechanic Admin Operations Console
 * Live Firestore (`(default)`) + Firebase Auth + Spark HTTP Callable Backend client.
 * Never falls back to silent hardcoded mock arrays.
 */

let firebaseApp = null;
let auth = null;
let db = null;
let currentUser = null;

let mechanicsFleet = [];
let serviceRequests = [];
let auditLogs = [];
let appConfig = {
  defaultSearchRadiusKm: 5.0,
  maxSearchRadiusKm: 15.0,
  initialOfferBatchSize: 3,
  offerTimeoutSeconds: 45,
  maxMechanicDispatchAttempts: 3,
  maxMechanicLocationStalenessMinutes: 20,
  localityName: "Gurugram (Sector 29 Pilot Zone)",
};

let activeMechanicFilter = "ALL";
let activeRequestFilter = "ALL";
let stagedCsvRows = [];
let unsubscribers = [];

document.addEventListener("DOMContentLoaded", () => {
  initNavigation();
  initMechanicsView();
  initRequestsView();
  initCsvImporter();
  initConfigForm();
  initSimulation();
  initAuthAndConnection();
  renderAll();
});

function initAuthAndConnection() {
  const cfg = window.FIXMECHANIC_CFG;
  document.getElementById("cfgSparkUrl").value = cfg.sparkBackendUrl || "http://127.0.0.1:5055";
  document.getElementById("cfgWebApiKey").value = cfg.firebase.apiKey || "";
  document.getElementById("cfgUseEmulators").checked = !!cfg.useEmulators;

  document.getElementById("btnSaveConnectionCfg").addEventListener("click", () => {
    const nextCfg = {
      sparkBackendUrl: document.getElementById("cfgSparkUrl").value.trim() || "http://127.0.0.1:5055",
      apiKey: document.getElementById("cfgWebApiKey").value.trim(),
      useEmulators: document.getElementById("cfgUseEmulators").checked,
    };
    localStorage.setItem("fixmechanic_web_cfg", JSON.stringify(nextCfg));
    window.location.reload();
  });

  if (!window.firebase || !cfg.firebase.apiKey) {
    setAuthError("Firebase Web API key is not configured for production hosting, or enable local emulators.");
    updateConnPill(false, "Config Needed");
    return;
  }

  firebaseApp = firebase.apps.length ? firebase.app() : firebase.initializeApp(cfg.firebase);
  auth = firebase.auth();
  db = firebase.firestore();

  if (cfg.useEmulators) {
    auth.useEmulator(cfg.authEmulatorUrl);
    db.useEmulator(cfg.firestoreEmulatorHost, cfg.firestoreEmulatorPort);
  }

  checkBackendHealth();

  document.getElementById("adminLoginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAuthError();
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    try {
      await auth.signInWithEmailAndPassword(email, password);
    } catch (err) {
      setAuthError(err.message || "Email sign-in failed.");
    }
  });

  document.getElementById("btnGoogleLogin").addEventListener("click", async () => {
    clearAuthError();
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      await auth.signInWithPopup(provider);
    } catch (err) {
      setAuthError(err.message || "Google sign-in failed.");
    }
  });

  document.getElementById("btnAdminSignOut").addEventListener("click", async () => {
    clearListeners();
    if (auth) await auth.signOut();
  });

  auth.onAuthStateChanged(async (user) => {
    clearListeners();
    if (!user) {
      currentUser = null;
      mechanicsFleet = [];
      serviceRequests = [];
      auditLogs = [];
      document.getElementById("authOverlay").classList.remove("hidden");
      document.getElementById("adminEmailLabel").textContent = "Signed Out";
      renderAll();
      return;
    }

    try {
      const userSnap = await db.collection("users").doc(user.uid).get();
      const tokenRes = await user.getIdTokenResult();
      const role = String(userSnap.data()?.role || tokenRes.claims?.role || "").toUpperCase();
      if (role !== "ADMIN" && tokenRes.claims?.admin !== true) {
        await auth.signOut();
        setAuthError("Access denied: this account does not have ADMIN role privileges.");
        return;
      }

      currentUser = user;
      document.getElementById("authOverlay").classList.add("hidden");
      document.getElementById("adminDisplayName").textContent = user.displayName || "Operations Admin";
      document.getElementById("adminEmailLabel").textContent = user.email || user.uid;
      document.getElementById("adminAvatarInitial").textContent = (user.email || "A")[0].toUpperCase();
      subscribeLiveCollections();
    } catch (err) {
      setAuthError(`Failed verifying admin role: ${err.message}`);
    }
  });
}

async function checkBackendHealth() {
  const sparkUrl = window.FIXMECHANIC_CFG.sparkBackendUrl;
  try {
    const res = await fetch(`${sparkUrl}/health`);
    if (res.ok) {
      updateConnPill(true, "Live Spark + Firestore");
      return;
    }
  } catch (_) {}
  updateConnPill(false, "Spark Backend Offline");
}

function updateConnPill(online, label) {
  const pill = document.getElementById("backendConnPill");
  if (!pill) return;
  pill.textContent = label;
  pill.classList.toggle("offline", !online);
}

function setAuthError(msg) {
  const el = document.getElementById("authErrorBanner");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("visible");
}

function clearAuthError() {
  const el = document.getElementById("authErrorBanner");
  if (!el) return;
  el.textContent = "";
  el.classList.remove("visible");
}

function clearListeners() {
  unsubscribers.forEach((u) => {
    try { u(); } catch (_) {}
  });
  unsubscribers = [];
}

function subscribeLiveCollections() {
  unsubscribers.push(
    db.collection("mechanicProfiles").onSnapshot(
      (snap) => {
        mechanicsFleet = snap.docs.map((doc) => ({ mechanicId: doc.id, ...doc.data() }));
        renderAll();
      },
      (err) => showToast(`Mechanic listener error: ${err.message}`)
    )
  );

  unsubscribers.push(
    db.collection("serviceRequests").orderBy("createdAt", "desc").limit(100).onSnapshot(
      (snap) => {
        serviceRequests = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        renderAll();
      },
      (err) => showToast(`Requests listener error: ${err.message}`)
    )
  );

  unsubscribers.push(
    db.collection("adminAuditLogs").orderBy("timestamp", "desc").limit(50).onSnapshot(
      (snap) => {
        auditLogs = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        renderAll();
      },
      (err) => showToast(`Audit log listener error: ${err.message}`)
    )
  );

  unsubscribers.push(
    db.collection("applicationConfig").doc("current").onSnapshot((doc) => {
      if (doc.exists) {
        appConfig = { ...appConfig, ...doc.data() };
        syncConfigInputs();
        renderAll();
      }
    })
  );
}

function syncConfigInputs() {
  document.getElementById("cfgSearchRadius").value = appConfig.defaultSearchRadiusKm ?? 5;
  document.getElementById("cfgMaxRadius").value = appConfig.maxSearchRadiusKm ?? 15;
  document.getElementById("cfgBatchSize").value = appConfig.initialOfferBatchSize ?? 3;
  document.getElementById("cfgOfferTimeout").value = appConfig.offerTimeoutSeconds ?? 45;
  document.getElementById("cfgMaxRetries").value = appConfig.maxMechanicDispatchAttempts ?? 3;
  document.getElementById("cfgStaleness").value = appConfig.maxMechanicLocationStalenessMinutes ?? 20;
  document.getElementById("cfgLocalityName").value = appConfig.localityName || "Gurugram (Sector 29 Pilot Zone)";
  const locEl = document.getElementById("sidebarLocalityName");
  if (locEl) locEl.textContent = appConfig.localityName || "Gurugram (Sector 29 Hub)";
}

async function callSparkBackend(functionName, payload) {
  if (!currentUser) {
    throw new Error("Admin authentication required.");
  }
  const token = await currentUser.getIdToken();
  const baseUrl = window.FIXMECHANIC_CFG.sparkBackendUrl.replace(/\/+$/, "");
  const res = await fetch(`${baseUrl}/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ data: payload }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error?.message || `Backend error (${res.status})`);
  }
  return json.result;
}

function initNavigation() {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      const tabId = btn.getAttribute("data-tab");
      const pane = document.getElementById(`pane-${tabId}`);
      if (pane) pane.classList.add("active");

      const titles = {
        overview: ["Operations Overview", "Real-time dispatch telemetry, mechanic verification, and roadside incident status."],
        mechanics: ["Mechanic Fleet Directory", "Verify onboarding credentials, approval states, and service coverage."],
        requests: ["Emergency Incident Management", "Live roadside assistance incidents, assignments, and state transitions."],
        config: ["Dispatch Parameters", "Configure matching radius, batch sizing, timeout horizons, and coverage rules."],
        audit: ["Operational Audit Trail", "Zero-trust administrative event logs, reassignments, and security records."],
      };
      if (titles[tabId]) {
        document.getElementById("pageTitle").textContent = titles[tabId][0];
        document.getElementById("pageSubtitle").textContent = titles[tabId][1];
      }
    });
  });

  document.getElementById("btnRefreshData").addEventListener("click", () => {
    checkBackendHealth();
    renderAll();
    showToast("Synchronized with live Firestore & Spark backend.");
  });
}

function renderAll() {
  renderMetrics();
  renderMechanicsTable();
  renderRequestsTable();
  renderAuditTable();
  renderRadar();
}

function renderMetrics() {
  const totalMechs = mechanicsFleet.length;
  const onlineMechs = mechanicsFleet.filter((m) => m.isOnline && m.approvalStatus === "APPROVED").length;
  const pendingMechs = mechanicsFleet.filter((m) => m.approvalStatus === "PENDING").length;

  const activeStatuses = ["REQUESTED", "SEARCHING", "ASSIGNED", "ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"];
  const activeReqs = serviceRequests.filter((r) => activeStatuses.includes(r.status)).length;
  const completedReqs = serviceRequests.filter((r) => r.status === "COMPLETED").length;
  const cancelledReqs = serviceRequests.filter((r) => r.status === "CANCELLED").length;
  const failedDispatches =
    serviceRequests.filter((r) => r.status === "EXPIRED").length ||
    auditLogs.filter((l) => (l.action || "").includes("EXHAUSTED")).length;

  document.getElementById("kpiTotalMechanics").textContent = totalMechs;
  document.getElementById("kpiMechanicsSub").textContent = `${onlineMechs} Online & Ready`;
  document.getElementById("kpiPendingApprovals").textContent = pendingMechs;
  document.getElementById("kpiActiveRequests").textContent = activeReqs;
  document.getElementById("kpiActiveSub").textContent = `${activeReqs} In Dispatch / On-road`;
  document.getElementById("kpiCompletedRequests").textContent = completedReqs;
  document.getElementById("kpiCompletedSub").textContent = `${cancelledReqs} Cancelled`;
  document.getElementById("kpiFailedDispatches").textContent = failedDispatches;

  document.getElementById("badgePendingCount").textContent = pendingMechs;
  document.getElementById("badgeActiveReqCount").textContent = activeReqs;

  document.getElementById("countAllMechs").textContent = totalMechs;
  document.getElementById("countPendingMechs").textContent = pendingMechs;
  document.getElementById("countApprovedMechs").textContent = mechanicsFleet.filter((m) => m.approvalStatus === "APPROVED").length;
  document.getElementById("countSuspendedMechs").textContent = mechanicsFleet.filter((m) => m.approvalStatus === "SUSPENDED").length;
  document.getElementById("countRejectedMechs").textContent = mechanicsFleet.filter((m) => m.approvalStatus === "REJECTED").length;
}

function renderRadar() {
  const container = document.getElementById("radarMechanicDots");
  if (!container) return;
  container.innerHTML = "";
  mechanicsFleet.slice(0, 15).forEach((m, idx) => {
    const dot = document.createElement("span");
    let colorClass = "gray";
    if (m.approvalStatus === "APPROVED" && m.isBusy) colorClass = "orange";
    else if (m.approvalStatus === "APPROVED" && m.isOnline) colorClass = "green";
    dot.className = `dot ${colorClass}`;
    const angle = (idx / 15) * 2 * Math.PI;
    const r = 35 + (idx % 3) * 35;
    dot.style.position = "absolute";
    dot.style.left = `${50 + (Math.cos(angle) * r) / 2.5}%`;
    dot.style.top = `${50 + (Math.sin(angle) * r) / 2.5}%`;
    dot.title = `${m.name} (${m.approvalStatus})`;
    container.appendChild(dot);
  });
}

function initMechanicsView() {
  document.querySelectorAll(".filter-pill[data-filter]").forEach((pill) => {
    pill.addEventListener("click", () => {
      document.querySelectorAll(".filter-pill[data-filter]").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      activeMechanicFilter = pill.getAttribute("data-filter");
      renderMechanicsTable();
    });
  });

  document.getElementById("mechanicSearchInput").addEventListener("input", renderMechanicsTable);
}

function renderMechanicsTable() {
  const query = document.getElementById("mechanicSearchInput").value.toLowerCase().trim();
  const tbody = document.getElementById("mechanicsTableBody");
  tbody.innerHTML = "";

  const filtered = mechanicsFleet.filter((m) => {
    if (activeMechanicFilter !== "ALL" && m.approvalStatus !== activeMechanicFilter) return false;
    if (query) {
      return (
        (m.name || "").toLowerCase().includes(query) ||
        (m.phone || "").includes(query) ||
        (m.currentLocation?.address || "").toLowerCase().includes(query)
      );
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem;">No live mechanics found matching criteria.</td></tr>`;
    return;
  }

  filtered.forEach((m) => {
    const tr = document.createElement("tr");
    let statusBadge = `<span class="badge badge-warning">PENDING</span>`;
    if (m.approvalStatus === "APPROVED") statusBadge = `<span class="badge badge-success">APPROVED</span>`;
    else if (m.approvalStatus === "SUSPENDED") statusBadge = `<span class="badge badge-danger">SUSPENDED</span>`;
    else if (m.approvalStatus === "REJECTED") statusBadge = `<span class="badge badge-gray">REJECTED</span>`;

    let availBadge = `<span class="badge badge-gray">OFFLINE</span>`;
    if (m.isOnline && !m.isBusy) availBadge = `<span class="badge badge-success">READY</span>`;
    else if (m.isOnline && m.isBusy) availBadge = `<span class="badge badge-warning">BUSY (#${escapeHtml(m.activeJobId || "")})</span>`;

    tr.innerHTML = `
      <td>
        <strong>${escapeHtml(m.name)}</strong><br>
        <span class="text-muted">${escapeHtml(m.phone)}</span>
      </td>
      <td>${statusBadge}</td>
      <td>${availBadge}</td>
      <td style="max-width: 140px; font-size: 0.75rem;">${escapeHtml((m.vehicleTypes || []).join(", "))}</td>
      <td style="max-width: 140px; font-size: 0.75rem;">${escapeHtml((m.serviceCategories || []).join(", "))}</td>
      <td>⭐ ${m.ratingAverage ?? 5.0} <span class="text-muted">(${m.ratingCount ?? 0})</span></td>
      <td>${escapeHtml(m.currentLocation?.address || "Gurugram")}</td>
      <td>
        <div style="display: flex; gap: 0.35rem;">
          ${m.approvalStatus === "PENDING" ? `<button class="btn btn-sm btn-primary" onclick="setMechanicStatus('${escapeHtml(m.mechanicId)}', 'APPROVED')">Approve</button>` : ""}
          ${m.approvalStatus === "PENDING" ? `<button class="btn btn-sm btn-secondary" onclick="setMechanicStatus('${escapeHtml(m.mechanicId)}', 'REJECTED')">Reject</button>` : ""}
          ${m.approvalStatus === "APPROVED" ? `<button class="btn btn-sm btn-outline-danger" onclick="setMechanicStatus('${escapeHtml(m.mechanicId)}', 'SUSPENDED')">Suspend</button>` : ""}
          ${m.approvalStatus === "SUSPENDED" || m.approvalStatus === "REJECTED" ? `<button class="btn btn-sm btn-secondary" onclick="setMechanicStatus('${escapeHtml(m.mechanicId)}', 'APPROVED')">Re-activate</button>` : ""}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.setMechanicStatus = async function (mechanicId, newStatus) {
  try {
    await callSparkBackend("updateMechanicStatus", {
      mechanicId,
      targetStatus: newStatus,
      reason: `Admin set status to ${newStatus} via Web Console`,
    });
    showToast(`Mechanic status updated to ${newStatus}.`);
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
};

function initRequestsView() {
  document.querySelectorAll(".filter-pill[data-req-filter]").forEach((pill) => {
    pill.addEventListener("click", () => {
      document.querySelectorAll(".filter-pill[data-req-filter]").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      activeRequestFilter = pill.getAttribute("data-req-filter");
      renderRequestsTable();
    });
  });

  document.getElementById("requestSearchInput").addEventListener("input", renderRequestsTable);
  document.getElementById("btnCloseReqModal").addEventListener("click", () => {
    document.getElementById("requestDetailModal").classList.remove("open");
  });
}

function renderRequestsTable() {
  const query = document.getElementById("requestSearchInput").value.toLowerCase().trim();
  const tbody = document.getElementById("requestsTableBody");
  tbody.innerHTML = "";

  const activeStatuses = ["REQUESTED", "SEARCHING", "ASSIGNED", "ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"];
  const filtered = serviceRequests.filter((r) => {
    if (activeRequestFilter === "ACTIVE" && !activeStatuses.includes(r.status)) return false;
    else if (activeRequestFilter === "COMPLETED" && r.status !== "COMPLETED") return false;
    else if (activeRequestFilter === "CANCELLED" && r.status !== "CANCELLED") return false;
    else if (activeRequestFilter === "EXPIRED" && r.status !== "EXPIRED") return false;

    if (query) {
      return (
        (r.id || "").toLowerCase().includes(query) ||
        (r.customerName || "").toLowerCase().includes(query) ||
        (r.customerPhone || "").includes(query) ||
        (r.vehicleRegNumber || "").toLowerCase().includes(query)
      );
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">No roadside requests found.</td></tr>`;
    return;
  }

  filtered.forEach((r) => {
    const tr = document.createElement("tr");
    let statusBadge = `<span class="badge badge-warning">${escapeHtml(r.status)}</span>`;
    if (r.status === "COMPLETED") statusBadge = `<span class="badge badge-success">COMPLETED</span>`;
    else if (r.status === "CANCELLED" || r.status === "EXPIRED") statusBadge = `<span class="badge badge-danger">${escapeHtml(r.status)}</span>`;
    else if (r.status === "EN_ROUTE" || r.status === "ARRIVED") statusBadge = `<span class="badge badge-info">${escapeHtml(r.status)}</span>`;

    const minsAgo = Math.max(0, Math.round((Date.now() - (r.createdAt || Date.now())) / 60000));

    tr.innerHTML = `
      <td>
        <strong>${escapeHtml(r.id)}</strong><br>
        <span class="text-muted">${minsAgo} mins ago</span>
      </td>
      <td>
        ${escapeHtml(r.customerName || "Customer")} (${escapeHtml(r.customerPhone || "-")})<br>
        <span class="text-muted">${escapeHtml(r.vehicleType)} • ${escapeHtml(r.vehicleRegNumber)}</span>
      </td>
      <td><span class="badge badge-gray">${escapeHtml(r.serviceCategory)}</span></td>
      <td>${statusBadge}</td>
      <td>${r.assignedMechanicName ? `<strong>${escapeHtml(r.assignedMechanicName)}</strong>` : `<span class="text-muted">Unassigned</span>`}</td>
      <td>Batch #${r.dispatchBatch || 1} (${r.searchRadiusKm || 5} km)</td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="openRequestDetail('${escapeHtml(r.id)}')">Inspect</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.openRequestDetail = async function (requestId) {
  const req = serviceRequests.find((r) => r.id === requestId);
  if (!req) return;

  document.getElementById("modalReqTitle").textContent = `Incident #${req.id}`;
  document.getElementById("modalReqSub").textContent = `${req.serviceCategory} • ${req.status}`;
  document.getElementById("detCustPhone").textContent = `${req.customerPhone || "-"} (${req.customerName || "Customer"})`;
  document.getElementById("detVehicle").textContent = `${req.vehicleType} • ${req.vehicleRegNumber || "-"}`;
  document.getElementById("detCategory").textContent = req.serviceCategory;
  document.getElementById("detMechanic").textContent = req.assignedMechanicName || "Searching candidates...";

  const timelineBox = document.getElementById("reqTimelineList");
  timelineBox.innerHTML = `<div class="text-muted">Loading authoritative jobStatusEvents...</div>`;
  document.getElementById("requestDetailModal").classList.add("open");

  try {
    const eventsSnap = await db
      .collection("jobStatusEvents")
      .where("requestId", "==", requestId)
      .orderBy("timestamp", "asc")
      .get();
    timelineBox.innerHTML = "";
    if (eventsSnap.empty) {
      timelineBox.innerHTML = `<div class="text-muted">No status transitions logged yet.</div>`;
    } else {
      eventsSnap.forEach((doc) => {
        const t = doc.data();
        const item = document.createElement("div");
        item.className = "timeline-item";
        const dateStr = new Date(t.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        item.innerHTML = `
          <div class="timeline-time">${dateStr} • By ${escapeHtml(t.actorRole || t.actorId)}</div>
          <div class="timeline-text">${escapeHtml(t.fromStatus)} ➔ <strong>${escapeHtml(t.toStatus)}</strong></div>
        `;
        timelineBox.appendChild(item);
      });
    }
  } catch (err) {
    timelineBox.innerHTML = `<div class="text-muted">Could not load timeline: ${escapeHtml(err.message)}</div>`;
  }

  document.getElementById("btnAdminCancelReq").onclick = async () => {
    try {
      await callSparkBackend("adminCancelOrReassign", {
        requestId: req.id,
        action: "CANCEL",
        reason: "Admin emergency cancellation via Web Console",
      });
      document.getElementById("requestDetailModal").classList.remove("open");
      showToast(`Request #${req.id} cancelled.`);
    } catch (err) {
      showToast(`Cancel error: ${err.message}`);
    }
  };

  document.getElementById("btnAdminReassignReq").onclick = async () => {
    try {
      await callSparkBackend("adminCancelOrReassign", {
        requestId: req.id,
        action: "REASSIGN",
        reason: "Admin emergency reassignment via Web Console",
      });
      document.getElementById("requestDetailModal").classList.remove("open");
      showToast(`Request #${req.id} reopened for dispatch.`);
    } catch (err) {
      showToast(`Reassign error: ${err.message}`);
    }
  };
};

function initCsvImporter() {
  const modal = document.getElementById("csvModal");
  const openBtn = document.getElementById("btnOpenCsvModal");
  const closeBtn = document.getElementById("btnCloseCsvModal");
  const validateBtn = document.getElementById("btnValidateCsv");
  const commitBtn = document.getElementById("btnCommitCsvImport");
  const loadSampleBtn = document.getElementById("btnLoadSampleCsv");
  const textarea = document.getElementById("csvTextarea");

  openBtn.addEventListener("click", () => modal.classList.add("open"));
  closeBtn.addEventListener("click", () => modal.classList.remove("open"));

  loadSampleBtn.addEventListener("click", () => {
    textarea.value = `name,phone,email,vehicleTypes,serviceCategories,locality,lat,lng
Rajesh Sharma,9810123401,rajesh@example.com,"TWO_WHEELER,FOUR_WHEELER_CAR","FLAT_TYRE,BATTERY_JUMPSTART",Sector 29 Gurugram,28.4682,77.0617
Amit Kumar,9810123402,amit@example.com,"TWO_WHEELER,FOUR_WHEELER_CAR","FLAT_TYRE,LOCKOUT",DLF Phase 4 Gurugram,28.4725,77.0850`;
  });

  function extractCsvRows() {
    const raw = textarea.value.trim();
    const lines = raw.split("\n").map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith("#"));
    if (lines.length < 2) return [];
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      rows.push({
        name: cols[0] || "",
        phone: cols[1] || "",
        email: cols[2] || "",
        vehicleTypes: cols[3] || "TWO_WHEELER,FOUR_WHEELER_CAR",
        serviceCategories: cols[4] || "FLAT_TYRE",
        locality: cols[5] || "Gurugram Pilot Zone",
        lat: cols[6] || "28.4595",
        lng: cols[7] || "77.0266",
      });
    }
    return rows;
  }

  validateBtn.addEventListener("click", async () => {
    const rows = extractCsvRows();
    if (rows.length === 0) {
      showToast("CSV must contain a header line and at least one data row.");
      return;
    }
    try {
      const res = await callSparkBackend("processMechanicsCsv", { rows, commit: false });
      stagedCsvRows = rows;
      const v = res.validation;
      document.getElementById("csvValidationReport").style.display = "block";
      document.getElementById("valValidCount").textContent = v.validRows.length;
      document.getElementById("valInvalidCount").textContent = v.invalidRows.length;
      document.getElementById("valDupeCount").textContent = v.duplicateCount;

      const errorBox = document.getElementById("csvErrorsList");
      if (v.invalidRows.length > 0) {
        errorBox.style.display = "block";
        errorBox.innerHTML =
          `<strong>Row Validation Issues:</strong><br>` +
          v.invalidRows.map((inv) => `Line ${inv.rowIndex + 1}: ${escapeHtml(inv.errors.join(", "))}`).join("<br>");
      } else {
        errorBox.style.display = "none";
      }
      commitBtn.disabled = v.validRows.length === 0;
    } catch (err) {
      showToast(`Validation error: ${err.message}`);
    }
  });

  commitBtn.addEventListener("click", async () => {
    if (stagedCsvRows.length === 0) return;
    try {
      const res = await callSparkBackend("processMechanicsCsv", { rows: stagedCsvRows, commit: true });
      modal.classList.remove("open");
      stagedCsvRows = [];
      showToast(`Imported ${res.importedCount} mechanics in PENDING status.`);
    } catch (err) {
      showToast(`Import error: ${err.message}`);
    }
  });
}

function parseCsvLine(text) {
  const result = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === "," && !inQuotes) {
      result.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

function initConfigForm() {
  document.getElementById("configForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await callSparkBackend("updateApplicationConfig", {
        defaultSearchRadiusKm: parseFloat(document.getElementById("cfgSearchRadius").value),
        maxSearchRadiusKm: parseFloat(document.getElementById("cfgMaxRadius").value),
        initialOfferBatchSize: parseInt(document.getElementById("cfgBatchSize").value, 10),
        offerTimeoutSeconds: parseInt(document.getElementById("cfgOfferTimeout").value, 10),
        maxMechanicDispatchAttempts: parseInt(document.getElementById("cfgMaxRetries").value, 10),
        maxMechanicLocationStalenessMinutes: parseInt(document.getElementById("cfgStaleness").value, 10),
        localityName: document.getElementById("cfgLocalityName").value.trim(),
      });
      showToast("Operational parameters saved to Firestore.");
    } catch (err) {
      showToast(`Config save error: ${err.message}`);
    }
  });
}

function initSimulation() {
  document.getElementById("btnSimulateRequest").addEventListener("click", async () => {
    const vType = document.getElementById("simVehicleType").value;
    const cat = document.getElementById("simServiceCategory").value;
    const addr = document.getElementById("simAddress").value.trim();
    try {
      const res = await callSparkBackend("createServiceRequest", {
        vehicleType: vType,
        serviceCategory: cat,
        issueTitle: cat.replace(/_/g, " "),
        address: addr || "Sector 29 Gurugram",
        lat: 28.4595,
        lng: 77.0266,
      });
      showToast(`Request ${res.requestId} dispatched (${res.dispatchedCount} mechanics notified).`);
    } catch (err) {
      showToast(`Dispatch error: ${err.message}`);
    }
  });
}

function renderAuditTable() {
  const tbody = document.getElementById("auditTableBody");
  tbody.innerHTML = "";
  auditLogs.slice(0, 50).forEach((l) => {
    const tr = document.createElement("tr");
    const timeStr = new Date(l.timestamp || Date.now()).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const detailStr = typeof l.details === "string" ? l.details : JSON.stringify(l.details || {});
    tr.innerHTML = `
      <td style="white-space: nowrap;">${timeStr}</td>
      <td><strong>${escapeHtml(l.action)}</strong></td>
      <td><span class="badge badge-gray">${escapeHtml(l.adminEmail || l.adminId || "SYSTEM")}</span></td>
      <td>${escapeHtml(l.targetType)} • <span class="code-font">${escapeHtml(l.targetId)}</span></td>
      <td style="font-size: 0.8rem; color: var(--text-sub);">${escapeHtml(detailStr)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function showToast(msg) {
  let toast = document.getElementById("liveToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "liveToast";
    toast.style.position = "fixed";
    toast.style.bottom = "24px";
    toast.style.right = "24px";
    toast.style.backgroundColor = "#0F172A";
    toast.style.color = "white";
    toast.style.padding = "12px 20px";
    toast.style.borderRadius = "8px";
    toast.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
    toast.style.zIndex = "9999";
    toast.style.fontSize = "0.85rem";
    toast.style.fontWeight = "600";
    toast.style.transition = "all 0.3s ease";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = "1";
  toast.style.transform = "translateY(0)";
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
  }, 3200);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return str
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
