/**
 * FixMechanic Admin Operations Console
 * Client Controller for Fleet Management, Incident Dispatch, CSV Batch Import,
 * and Authoritative State Machine Audits.
 */

// Initial Seed Data for Gurugram Sector 29 Pilot Zone
let mechanicsFleet = [
  {
    mechanicId: "mech_101",
    name: "Rajesh Sharma",
    phone: "9810123401",
    email: "rajesh.sharma@example.com",
    approvalStatus: "APPROVED",
    isOnline: true,
    isBusy: false,
    activeJobId: null,
    vehicleTypes: ["TWO_WHEELER", "FOUR_WHEELER_CAR"],
    serviceCategories: ["FLAT_TYRE", "BATTERY_JUMPSTART", "MINOR_MECHANICAL"],
    currentLocation: { lat: 28.4682, lng: 77.0617, address: "Sector 29 Gurugram", updatedAt: Date.now() },
    ratingAverage: 4.8,
    ratingCount: 34,
  },
  {
    mechanicId: "mech_102",
    name: "Amit Kumar",
    phone: "9810123402",
    email: "amit.kumar@example.com",
    approvalStatus: "PENDING",
    isOnline: false,
    isBusy: false,
    activeJobId: null,
    vehicleTypes: ["TWO_WHEELER", "FOUR_WHEELER_CAR", "EV_TWO_WHEELER"],
    serviceCategories: ["FLAT_TYRE", "BATTERY_JUMPSTART", "LOCKOUT"],
    currentLocation: { lat: 28.4725, lng: 77.0850, address: "DLF Phase 4 Gurugram", updatedAt: Date.now() },
    ratingAverage: 5.0,
    ratingCount: 0,
  },
  {
    mechanicId: "mech_103",
    name: "Vikas Yadav",
    phone: "9810123403",
    email: "vikas.yadav@example.com",
    approvalStatus: "APPROVED",
    isOnline: true,
    isBusy: true,
    activeJobId: "REQ-901",
    vehicleTypes: ["FOUR_WHEELER_CAR", "COMMERCIAL_LIGHT"],
    serviceCategories: ["TOWING", "BATTERY_JUMPSTART"],
    currentLocation: { lat: 28.4231, lng: 77.0428, address: "Sohna Road Gurugram", updatedAt: Date.now() },
    ratingAverage: 4.9,
    ratingCount: 52,
  },
  {
    mechanicId: "mech_104",
    name: "Sunil Verma",
    phone: "9810123404",
    email: "sunil.verma@example.com",
    approvalStatus: "PENDING",
    isOnline: false,
    isBusy: false,
    activeJobId: null,
    vehicleTypes: ["TWO_WHEELER", "EV_TWO_WHEELER"],
    serviceCategories: ["FLAT_TYRE", "BATTERY_JUMPSTART", "FUEL_DELIVERY"],
    currentLocation: { lat: 28.4750, lng: 77.0392, address: "Sector 14 Gurugram", updatedAt: Date.now() },
    ratingAverage: 5.0,
    ratingCount: 0,
  },
  {
    mechanicId: "mech_105",
    name: "Manoj Saini",
    phone: "9810123405",
    email: "manoj.saini@example.com",
    approvalStatus: "SUSPENDED",
    rejectionReason: "Repeated customer no-shows under investigation",
    isOnline: false,
    isBusy: false,
    activeJobId: null,
    vehicleTypes: ["FOUR_WHEELER_CAR", "EV_FOUR_WHEELER"],
    serviceCategories: ["BATTERY_JUMPSTART", "LOCKOUT"],
    currentLocation: { lat: 28.4520, lng: 77.0980, address: "Golf Course Road", updatedAt: Date.now() },
    ratingAverage: 3.2,
    ratingCount: 18,
  },
  {
    mechanicId: "mech_106",
    name: "Deepak Singh",
    phone: "9810123406",
    email: "deepak.singh@example.com",
    approvalStatus: "APPROVED",
    isOnline: true,
    isBusy: false,
    activeJobId: null,
    vehicleTypes: ["TWO_WHEELER", "FOUR_WHEELER_CAR"],
    serviceCategories: ["FLAT_TYRE", "TOWING", "MINOR_MECHANICAL"],
    currentLocation: { lat: 28.4950, lng: 77.0890, address: "Cyber City Gurugram", updatedAt: Date.now() },
    ratingAverage: 4.7,
    ratingCount: 41,
  }
];

let serviceRequests = [
  {
    id: "REQ-901",
    customerId: "cust_301",
    customerName: "Ananya Gupta",
    customerPhone: "9811223344",
    vehicleType: "FOUR_WHEELER_CAR",
    vehicleRegNumber: "HR26-DK-4819",
    serviceCategory: "BATTERY_JUMPSTART",
    status: "EN_ROUTE",
    assignedMechanicId: "mech_103",
    assignedMechanicName: "Vikas Yadav",
    dispatchBatch: 1,
    searchRadiusKm: 5.0,
    location: { address: "Near Signature Tower, South City 1", lat: 28.4610, lng: 77.0530 },
    createdAt: Date.now() - 15 * 60 * 1000,
    timeline: [
      { from: "REQUESTED", to: "SEARCHING", time: Date.now() - 15 * 60 * 1000, actor: "CUSTOMER" },
      { from: "SEARCHING", to: "ASSIGNED", time: Date.now() - 14 * 60 * 1000, actor: "SYSTEM (Atomic Lock)" },
      { from: "ASSIGNED", to: "ACCEPTED", time: Date.now() - 13 * 60 * 1000, actor: "MECHANIC" },
      { from: "ACCEPTED", to: "EN_ROUTE", time: Date.now() - 10 * 60 * 1000, actor: "MECHANIC" },
    ]
  },
  {
    id: "REQ-902",
    customerId: "cust_302",
    customerName: "Rahul Sen",
    customerPhone: "9899112233",
    vehicleType: "TWO_WHEELER",
    vehicleRegNumber: "DL03-EM-9921",
    serviceCategory: "FLAT_TYRE",
    status: "COMPLETED",
    assignedMechanicId: "mech_101",
    assignedMechanicName: "Rajesh Sharma",
    dispatchBatch: 1,
    searchRadiusKm: 5.0,
    location: { address: "HUDA Metro Station Gate 2", lat: 28.4590, lng: 77.0720 },
    createdAt: Date.now() - 65 * 60 * 1000,
    completedAt: Date.now() - 20 * 60 * 1000,
    timeline: [
      { from: "REQUESTED", to: "SEARCHING", time: Date.now() - 65 * 60 * 1000, actor: "CUSTOMER" },
      { from: "SEARCHING", to: "ASSIGNED", time: Date.now() - 64 * 60 * 1000, actor: "SYSTEM" },
      { from: "ASSIGNED", to: "ACCEPTED", time: Date.now() - 63 * 60 * 1000, actor: "MECHANIC" },
      { from: "ACCEPTED", to: "EN_ROUTE", time: Date.now() - 60 * 60 * 1000, actor: "MECHANIC" },
      { from: "EN_ROUTE", to: "ARRIVED", time: Date.now() - 45 * 60 * 1000, actor: "MECHANIC" },
      { from: "ARRIVED", to: "IN_PROGRESS", time: Date.now() - 42 * 60 * 1000, actor: "MECHANIC" },
      { from: "IN_PROGRESS", to: "COMPLETED", time: Date.now() - 20 * 60 * 1000, actor: "MECHANIC" },
    ]
  }
];

let auditLogs = [
  {
    id: "LOG_001",
    action: "SYSTEM_INITIALIZATION",
    admin: "SYSTEM",
    targetType: "SYSTEM_CONFIG",
    targetId: "pilot_gurugram",
    details: "Sector 29 Gurugram pilot zone online with 5km default radius.",
    timestamp: Date.now() - 2 * 3600 * 1000,
  },
  {
    id: "LOG_002",
    action: "MECHANIC_STATUS_SUSPENDED",
    admin: "admin@fixmechanic.in",
    targetType: "MECHANIC",
    targetId: "mech_105",
    details: "Manoj Saini suspended due to 3 unconfirmed roadside dispatch cancellations.",
    timestamp: Date.now() - 1 * 3600 * 1000,
  }
];

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
let stagedCsvValidRows = [];

// DOM Elements
document.addEventListener("DOMContentLoaded", () => {
  initNavigation();
  initMechanicsView();
  initRequestsView();
  initCsvImporter();
  initConfigForm();
  initSimulation();
  renderAll();
});

function initNavigation() {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));

      btn.classList.add("active");
      const tabId = btn.getAttribute("data-tab");
      const pane = document.getElementById(`pane-${tabId}`);
      if (pane) pane.classList.add("active");

      // Update Header title
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
    renderAll();
    showToast("Data synchronized with backend records.");
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

  const activeReqs = serviceRequests.filter((r) => ["REQUESTED", "SEARCHING", "ASSIGNED", "ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"].includes(r.status)).length;
  const completedReqs = serviceRequests.filter((r) => r.status === "COMPLETED").length;
  const cancelledReqs = serviceRequests.filter((r) => r.status === "CANCELLED").length;
  const failedDispatches = auditLogs.filter((l) => l.action.includes("EXHAUSTED")).length;

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

  // Counts for tabs
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
    dot.className = "dot";
    let colorClass = "green";
    if (m.approvalStatus !== "APPROVED") colorClass = "gray";
    else if (m.isBusy) colorClass = "orange";
    dot.className = `dot ${colorClass}`;

    // Place randomly on radar
    const angle = (idx / 15) * 2 * Math.PI;
    const r = 35 + (idx % 3) * 35;
    const x = 50 + (Math.cos(angle) * r) / 2.5;
    const y = 50 + (Math.sin(angle) * r) / 2.5;

    dot.style.position = "absolute";
    dot.style.left = `${x}%`;
    dot.style.top = `${y}%`;
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

  document.getElementById("mechanicSearchInput").addEventListener("input", () => {
    renderMechanicsTable();
  });
}

function renderMechanicsTable() {
  const query = document.getElementById("mechanicSearchInput").value.toLowerCase().trim();
  const tbody = document.getElementById("mechanicsTableBody");
  tbody.innerHTML = "";

  const filtered = mechanicsFleet.filter((m) => {
    if (activeMechanicFilter !== "ALL" && m.approvalStatus !== activeMechanicFilter) {
      return false;
    }
    if (query) {
      const matchName = m.name.toLowerCase().includes(query);
      const matchPhone = m.phone.includes(query);
      const matchLoc = (m.currentLocation?.address || "").toLowerCase().includes(query);
      return matchName || matchPhone || matchLoc;
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem;">No mechanics found matching current criteria.</td></tr>`;
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
    else if (m.isOnline && m.isBusy) availBadge = `<span class="badge badge-warning">BUSY (#${m.activeJobId})</span>`;

    const vTypes = (m.vehicleTypes || []).join(", ");
    const services = (m.serviceCategories || []).join(", ");

    tr.innerHTML = `
      <td>
        <strong>${escapeHtml(m.name)}</strong><br>
        <span class="text-muted">${escapeHtml(m.phone)}</span>
      </td>
      <td>${statusBadge}</td>
      <td>${availBadge}</td>
      <td style="max-width: 140px; font-size: 0.75rem;">${escapeHtml(vTypes)}</td>
      <td style="max-width: 140px; font-size: 0.75rem;">${escapeHtml(services)}</td>
      <td>⭐ ${m.ratingAverage || 5.0} <span class="text-muted">(${m.ratingCount || 0})</span></td>
      <td>${escapeHtml(m.currentLocation?.address || "Gurugram Sector 29")}</td>
      <td>
        <div style="display: flex; gap: 0.35rem;">
          ${m.approvalStatus === "PENDING" ? `<button class="btn btn-sm btn-primary" onclick="setMechanicStatus('${m.mechanicId}', 'APPROVED')">Approve</button>` : ""}
          ${m.approvalStatus === "PENDING" ? `<button class="btn btn-sm btn-secondary" onclick="setMechanicStatus('${m.mechanicId}', 'REJECTED')">Reject</button>` : ""}
          ${m.approvalStatus === "APPROVED" ? `<button class="btn btn-sm btn-outline-danger" onclick="setMechanicStatus('${m.mechanicId}', 'SUSPENDED')">Suspend</button>` : ""}
          ${m.approvalStatus === "SUSPENDED" ? `<button class="btn btn-sm btn-secondary" onclick="setMechanicStatus('${m.mechanicId}', 'APPROVED')">Re-activate</button>` : ""}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.setMechanicStatus = function(mechanicId, newStatus) {
  const mech = mechanicsFleet.find((m) => m.mechanicId === mechanicId);
  if (!mech) return;

  mech.approvalStatus = newStatus;
  if (newStatus !== "APPROVED") {
    mech.isOnline = false;
  }

  // Audit log entry
  auditLogs.unshift({
    id: `LOG_${Date.now()}`,
    action: `MECHANIC_STATUS_${newStatus}`,
    admin: "admin@fixmechanic.in",
    targetType: "MECHANIC",
    targetId: mechanicId,
    details: `Admin changed ${mech.name} status to ${newStatus}`,
    timestamp: Date.now(),
  });

  renderAll();
  showToast(`Mechanic ${mech.name} status updated to ${newStatus}.`);
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

  document.getElementById("requestSearchInput").addEventListener("input", () => {
    renderRequestsTable();
  });

  document.getElementById("btnCloseReqModal").addEventListener("click", () => {
    document.getElementById("requestDetailModal").classList.remove("open");
  });
}

function renderRequestsTable() {
  const query = document.getElementById("requestSearchInput").value.toLowerCase().trim();
  const tbody = document.getElementById("requestsTableBody");
  tbody.innerHTML = "";

  const filtered = serviceRequests.filter((r) => {
    if (activeRequestFilter === "ACTIVE") {
      if (!["REQUESTED", "SEARCHING", "ASSIGNED", "ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"].includes(r.status)) return false;
    } else if (activeRequestFilter === "COMPLETED" && r.status !== "COMPLETED") {
      return false;
    } else if (activeRequestFilter === "CANCELLED" && r.status !== "CANCELLED") {
      return false;
    }

    if (query) {
      const matchId = r.id.toLowerCase().includes(query);
      const matchCust = (r.customerName || "").toLowerCase().includes(query) || (r.customerPhone || "").includes(query);
      const matchReg = (r.vehicleRegNumber || "").toLowerCase().includes(query);
      return matchId || matchCust || matchReg;
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">No roadside requests found.</td></tr>`;
    return;
  }

  filtered.forEach((r) => {
    const tr = document.createElement("tr");

    let statusBadge = `<span class="badge badge-warning">${r.status}</span>`;
    if (r.status === "COMPLETED") statusBadge = `<span class="badge badge-success">COMPLETED</span>`;
    else if (r.status === "CANCELLED") statusBadge = `<span class="badge badge-danger">CANCELLED</span>`;
    else if (r.status === "EN_ROUTE" || r.status === "ARRIVED") statusBadge = `<span class="badge badge-info">${r.status}</span>`;

    const minsAgo = Math.round((Date.now() - r.createdAt) / 60000);

    tr.innerHTML = `
      <td>
        <strong>${r.id}</strong><br>
        <span class="text-muted">${minsAgo} mins ago</span>
      </td>
      <td>
        ${escapeHtml(r.customerName || "Customer")} (${escapeHtml(r.customerPhone)})<br>
        <span class="text-muted">${r.vehicleType} • ${r.vehicleRegNumber}</span>
      </td>
      <td><span class="badge badge-gray">${r.serviceCategory}</span></td>
      <td>${statusBadge}</td>
      <td>${r.assignedMechanicName ? `<strong>${escapeHtml(r.assignedMechanicName)}</strong>` : `<span class="text-muted">Unassigned</span>`}</td>
      <td>Batch #${r.dispatchBatch || 1} (${r.searchRadiusKm || 5} km)</td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="openRequestDetail('${r.id}')">Inspect</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.openRequestDetail = function(requestId) {
  const req = serviceRequests.find((r) => r.id === requestId);
  if (!req) return;

  document.getElementById("modalReqTitle").textContent = `Incident #${req.id}`;
  document.getElementById("modalReqSub").textContent = `${req.serviceCategory} • ${req.status}`;
  document.getElementById("detCustPhone").textContent = `${req.customerPhone} (${req.customerName || "Customer"})`;
  document.getElementById("detVehicle").textContent = `${req.vehicleType} • ${req.vehicleRegNumber}`;
  document.getElementById("detCategory").textContent = req.serviceCategory;
  document.getElementById("detMechanic").textContent = req.assignedMechanicName || "Searching candidates...";

  const timelineBox = document.getElementById("reqTimelineList");
  timelineBox.innerHTML = "";

  (req.timeline || []).forEach((t) => {
    const item = document.createElement("div");
    item.className = "timeline-item";
    const dateStr = new Date(t.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    item.innerHTML = `
      <div class="timeline-time">${dateStr} • By ${escapeHtml(t.actor)}</div>
      <div class="timeline-text">${t.from} ➔ <strong>${t.to}</strong></div>
    `;
    timelineBox.appendChild(item);
  });

  // Action handlers
  document.getElementById("btnAdminCancelReq").onclick = () => {
    req.status = "CANCELLED";
    req.timeline.push({ from: "EN_ROUTE", to: "CANCELLED", time: Date.now(), actor: "ADMIN" });
    if (req.assignedMechanicId) {
      const m = mechanicsFleet.find((mech) => mech.mechanicId === req.assignedMechanicId);
      if (m) m.isBusy = false;
    }
    auditLogs.unshift({
      id: `LOG_${Date.now()}`,
      action: "ADMIN_CANCEL_REQUEST",
      admin: "admin@fixmechanic.in",
      targetType: "SERVICE_REQUEST",
      targetId: req.id,
      details: "Admin emergency cancellation",
      timestamp: Date.now(),
    });
    document.getElementById("requestDetailModal").classList.remove("open");
    renderAll();
    showToast(`Request #${req.id} cancelled by admin.`);
  };

  document.getElementById("btnAdminReassignReq").onclick = () => {
    req.status = "SEARCHING";
    req.assignedMechanicId = null;
    req.assignedMechanicName = null;
    req.dispatchBatch = (req.dispatchBatch || 1) + 1;
    req.timeline.push({ from: "ASSIGNED", to: "SEARCHING", time: Date.now(), actor: "ADMIN (Emergency Reassign)" });
    auditLogs.unshift({
      id: `LOG_${Date.now()}`,
      action: "ADMIN_REASSIGN_REQUEST",
      admin: "admin@fixmechanic.in",
      targetType: "SERVICE_REQUEST",
      targetId: req.id,
      details: `Reassigned to batch #${req.dispatchBatch}`,
      timestamp: Date.now(),
    });
    document.getElementById("requestDetailModal").classList.remove("open");
    renderAll();
    showToast(`Request #${req.id} reopened for mechanic dispatch.`);
  };

  document.getElementById("requestDetailModal").classList.add("open");
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
Amit Kumar,9810123402,amit@example.com,"TWO_WHEELER,FOUR_WHEELER_CAR","FLAT_TYRE,LOCKOUT",DLF Phase 4 Gurugram,28.4725,77.0850
Vikas Yadav,9810123403,vikas@example.com,"FOUR_WHEELER_CAR,COMMERCIAL_LIGHT","TOWING",Sohna Road Gurugram,28.4231,77.0428
Sunil Verma,9810123404,sunil@example.com,"TWO_WHEELER","FLAT_TYRE,FUEL_DELIVERY",Sector 14 Gurugram,28.4750,77.0392
Harish Kataria,9810123415,harish@example.com,"FOUR_WHEELER_CAR","BATTERY_JUMPSTART,LOCKOUT",Sector 51 Gurugram,28.4320,77.0780
Duplicate Rajesh,9810123401,dup@example.com,"TWO_WHEELER","FLAT_TYRE",Sector 29 Gurugram,28.4682,77.0617
Invalid Phone Person,12345,badphone@example.com,"FOUR_WHEELER_CAR","BATTERY_JUMPSTART",Sector 14 Gurugram,28.4750,77.0392`;
    showToast("Loaded sample mechanics into text area.");
  });

  validateBtn.addEventListener("click", () => {
    const raw = textarea.value.trim();
    if (!raw) {
      alert("Please provide CSV content to validate.");
      return;
    }

    const lines = raw.split("\n").map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith("#"));
    if (lines.length < 2) {
      alert("CSV must contain a header line and at least one data row.");
      return;
    }

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const validRows = [];
    const invalidRows = [];
    const seenPhones = new Set();
    const existingPhones = new Set(mechanicsFleet.map((m) => m.phone.replace(/\D/g, "")));
    let duplicates = 0;

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      const name = cols[0] || "";
      const phone = (cols[1] || "").replace(/\D/g, "");
      const email = cols[2] || "";
      const vTypes = cols[3] || "TWO_WHEELER,FOUR_WHEELER_CAR";
      const services = cols[4] || "FLAT_TYRE";
      const loc = cols[5] || "Gurugram Pilot Zone";
      const lat = parseFloat(cols[6]) || 28.4595;
      const lng = parseFloat(cols[7]) || 77.0266;

      const errors = [];
      if (!name || name.length < 2) errors.push("Missing or invalid name.");
      if (!phone || phone.length < 10) errors.push(`Invalid phone digits (${phone || "empty"}).`);

      if (existingPhones.has(phone)) {
        errors.push(`Duplicate phone already registered: ${phone}`);
        duplicates++;
      } else if (seenPhones.has(phone)) {
        errors.push(`Duplicate phone within this batch: ${phone}`);
        duplicates++;
      } else {
        seenPhones.add(phone);
      }

      if (errors.length > 0) {
        invalidRows.push({ row: i, name, errors });
      } else {
        validRows.push({
          mechanicId: `mech_csv_${phone.slice(-6)}`,
          name,
          phone,
          email,
          approvalStatus: "PENDING", // Starts in PENDING!
          isOnline: false,
          isBusy: false,
          activeJobId: null,
          vehicleTypes: vTypes.split(",").map((s) => s.trim()),
          serviceCategories: services.split(",").map((s) => s.trim()),
          currentLocation: { lat, lng, address: loc, updatedAt: Date.now() },
          ratingAverage: 5.0,
          ratingCount: 0,
        });
      }
    }

    stagedCsvValidRows = validRows;

    // Show report
    document.getElementById("csvValidationReport").style.display = "block";
    document.getElementById("valValidCount").textContent = validRows.length;
    document.getElementById("valInvalidCount").textContent = invalidRows.length;
    document.getElementById("valDupeCount").textContent = duplicates;

    const errorBox = document.getElementById("csvErrorsList");
    if (invalidRows.length > 0) {
      errorBox.style.display = "block";
      errorBox.innerHTML = `<strong>Row Validation Issues:</strong><br>` +
        invalidRows.map((inv) => `Line ${inv.row} (${inv.name || "Unknown"}): ${inv.errors.join(", ")}`).join("<br>");
    } else {
      errorBox.style.display = "none";
    }

    commitBtn.disabled = validRows.length === 0;
  });

  commitBtn.addEventListener("click", () => {
    if (stagedCsvValidRows.length === 0) return;

    mechanicsFleet.unshift(...stagedCsvValidRows);

    auditLogs.unshift({
      id: `LOG_${Date.now()}`,
      action: "CSV_MECHANICS_IMPORTED",
      admin: "admin@fixmechanic.in",
      targetType: "MECHANIC",
      targetId: "BATCH_IMPORT",
      details: `Imported ${stagedCsvValidRows.length} mechanics in PENDING approval status.`,
      timestamp: Date.now(),
    });

    modal.classList.remove("open");
    renderAll();
    showToast(`Successfully imported ${stagedCsvValidRows.length} mechanics! They are pending verification.`);
    stagedCsvValidRows = [];
  });
}

function parseCsvLine(text) {
  const result = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
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
  const form = document.getElementById("configForm");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    appConfig.defaultSearchRadiusKm = parseFloat(document.getElementById("cfgSearchRadius").value);
    appConfig.maxSearchRadiusKm = parseFloat(document.getElementById("cfgMaxRadius").value);
    appConfig.initialOfferBatchSize = parseInt(document.getElementById("cfgBatchSize").value);
    appConfig.offerTimeoutSeconds = parseInt(document.getElementById("cfgOfferTimeout").value);
    appConfig.maxMechanicDispatchAttempts = parseInt(document.getElementById("cfgMaxRetries").value);
    appConfig.maxMechanicLocationStalenessMinutes = parseInt(document.getElementById("cfgStaleness").value);
    appConfig.localityName = document.getElementById("cfgLocalityName").value;

    auditLogs.unshift({
      id: `LOG_${Date.now()}`,
      action: "CONFIG_UPDATED",
      admin: "admin@fixmechanic.in",
      targetType: "SYSTEM_CONFIG",
      targetId: "pilot_gurugram",
      details: `Radius: ${appConfig.defaultSearchRadiusKm}km, Batch: ${appConfig.initialOfferBatchSize}`,
      timestamp: Date.now(),
    });

    renderAll();
    showToast("Operational parameters updated.");
  });
}

function initSimulation() {
  document.getElementById("btnSimulateRequest").addEventListener("click", () => {
    const vType = document.getElementById("simVehicleType").value;
    const cat = document.getElementById("simServiceCategory").value;
    const addr = document.getElementById("simAddress").value;

    const newId = `REQ-${Math.floor(100 + Math.random() * 900)}`;
    const now = Date.now();

    // Find candidate mechanics (Approved & Online)
    const candidates = mechanicsFleet.filter((m) => m.approvalStatus === "APPROVED" && m.isOnline && !m.isBusy);

    let assignedMech = null;
    if (candidates.length > 0) {
      assignedMech = candidates[0]; // Nearest winner
      assignedMech.isBusy = true;
      assignedMech.activeJobId = newId;
    }

    const newReq = {
      id: newId,
      customerId: "cust_test_99",
      customerName: "Vikram Malhotra",
      customerPhone: "9818822331",
      vehicleType: vType,
      vehicleRegNumber: "HR26-BW-7712",
      serviceCategory: cat,
      status: assignedMech ? "ASSIGNED" : "SEARCHING",
      assignedMechanicId: assignedMech ? assignedMech.mechanicId : null,
      assignedMechanicName: assignedMech ? assignedMech.name : null,
      dispatchBatch: 1,
      searchRadiusKm: appConfig.defaultSearchRadiusKm,
      location: { address: addr, lat: 28.4682, lng: 77.0617 },
      createdAt: now,
      timeline: [
        { from: "REQUESTED", to: "SEARCHING", time: now, actor: "CUSTOMER" },
        ...(assignedMech ? [{ from: "SEARCHING", to: "ASSIGNED", time: now + 1000, actor: "SYSTEM (Atomic Lock Transaction)" }] : [])
      ]
    };

    serviceRequests.unshift(newReq);

    auditLogs.unshift({
      id: `LOG_${Date.now()}`,
      action: assignedMech ? "JOB_ATOMICALLY_ASSIGNED" : "REQUEST_DISPATCH_STARTED",
      admin: "SYSTEM",
      targetType: "SERVICE_REQUEST",
      targetId: newId,
      details: assignedMech ? `Winner: ${assignedMech.name} (${assignedMech.mechanicId})` : "Searching eligible fleet...",
      timestamp: now,
    });

    renderAll();
    showToast(`Simulated request ${newId} created! Status: ${newReq.status}`);
  });
}

function renderAuditTable() {
  const tbody = document.getElementById("auditTableBody");
  tbody.innerHTML = "";

  auditLogs.slice(0, 30).forEach((l) => {
    const tr = document.createElement("tr");
    const timeStr = new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    tr.innerHTML = `
      <td style="white-space: nowrap;">${timeStr}</td>
      <td><strong>${escapeHtml(l.action)}</strong></td>
      <td><span class="badge badge-gray">${escapeHtml(l.admin)}</span></td>
      <td>${escapeHtml(l.targetType)} • <span class="code-font">${escapeHtml(l.targetId)}</span></td>
      <td style="font-size: 0.8rem; color: var(--text-sub);">${escapeHtml(l.details)}</td>
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
  if (!str) return "";
  return str.toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
