class VectorUpdateQueueCard extends HTMLElement {
  setConfig(config) {
    this.config = {
      updates_entity: "sensor.vector_ops_updates_available",
      queue_entity: "sensor.vector_ops_queue",
      review_entity: "sensor.vector_ops_review_required",
      title: "Vector Update Centre",
      ...config,
    };
    this._stateRefs = null;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._openReviews = this._openReviews || new Set();
    this._selected = this._selected || new Set();
    this._notice = this._notice || null;
  }

  set hass(hass) {
    const ids = this.config ? [this.config.updates_entity, this.config.queue_entity, this.config.review_entity] : [];
    const refs = ids.map((id) => hass.states[id]);
    if (this._stateRefs && refs.every((ref, index) => ref === this._stateRefs[index])) { this._hass = hass; return; }
    this._stateRefs = refs;
    this._hass = hass;
    this.render();
  }

  getCardSize() { return 8; }

  getGridOptions() {
    return {
      columns: 12,
      min_columns: 6,
      rows: 8,
      min_rows: 5,
    };
  }

  static getStubConfig() { return {}; }

  service(name, data = {}) {
    return this._hass.callService("vector_ops", name, data);
  }

  icon(item) {
    let key = item.service_key || "service";
    if (key === "postgres") key = "postgresql";
    if (key.includes("home-assistant") || key === "file-editor") key = "homeassistant";
    const backend = this._hass.states[this.config.updates_entity]?.attributes?.backend_url || "https://ops.dmhhome.uk";
    return `${this.safeUrl(backend, "https://ops.dmhhome.uk")}/icons/${encodeURIComponent(key)}.svg`;
  }

  safeUrl(value, fallback = "#") {
    try { const url = new URL(value, window.location.origin); return url.protocol === "https:" ? url.href.replace(/\/$/, "") : fallback; }
    catch { return fallback; }
  }

  esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  render() {
    if (!this._hass || !this.config) return;
    const updateState = this._hass.states[this.config.updates_entity];
    const queueState = this._hass.states[this.config.queue_entity];
    const reviewState = this._hass.states[this.config.review_entity];
    if (!updateState || !queueState) {
      this.shadowRoot.innerHTML = `<ha-card><div class="missing">Vector Ops entities are unavailable. Finish configuring the Vector Ops integration.</div></ha-card>`;
      return;
    }
    const available = updateState.attributes.items || [];
    const partialErrors = updateState.attributes.partial_errors || {};
    const queue = queueState.attributes.items || [];
    const running = queueState.state === "running";
    const backend = updateState.attributes.backend_url || "https://ops.dmhhome.uk";
    const rows = available.map((item) => {
      const id = item.id || (item.entity_id ? `ha:${item.entity_id}` : "");
      const queued = queue.find((x) => x.id === id && ["pending", "waiting", "running"].includes(x.status));
      const review = item.approved === false || item.review_required === true;
      const reviewOpen = review && this._openReviews.has(id);
      const status = queued ? (queued.status === "waiting" ? "STAGED" : queued.status.toUpperCase()) : (review ? "REVIEW REQUIRED" : "READY");
      const actions = [];
      if (!queued && review) actions.push(`<button data-toggle-review="${this.esc(id)}">${reviewOpen ? "CLOSE REVIEW" : "REVIEW"}</button>`);
      if (!queued && reviewOpen) {
        actions.push(`<button class="now" data-service="update_now" data-id="${this.esc(id)}">UPDATE NOW</button>`);
        actions.push(`<button data-service="add_to_queue" data-id="${this.esc(id)}">ADD TO QUEUE</button>`);
      }
      if (!queued && !review) {
        actions.push(`<button class="now" data-service="update_now" data-id="${this.esc(id)}">UPDATE NOW</button>`);
        actions.push(`<button data-service="add_to_queue" data-id="${this.esc(id)}">ADD TO QUEUE</button>`);
      }
      if (item.url && this.safeUrl(item.url) !== "#") actions.push(`<a href="${this.esc(this.safeUrl(item.url))}" target="_blank" rel="noopener">RELEASE NOTES</a>`);
      const version = item.installed && item.latest ? `${item.installed} → ${item.latest}` : (item.image || "");
      const detail = item.review || {};
      const reviewPanel = reviewOpen ? `<div class="review-panel"><strong>${this.esc(detail.summary || "Operational review")}</strong><p>${this.esc(detail.justification || item.reason || "Manual review requested")}</p><p><b>IMPACT</b> · ${this.esc(detail.impact || "Brief service interruption may occur")}</p>${(detail.checks || []).length ? `<ul>${detail.checks.map((check) => `<li>${this.esc(check)}</li>`).join("")}</ul>` : ""}</div>` : "";
      return `<article class="update"><input class="pick" type="checkbox" data-select="${this.esc(id)}" ${this._selected.has(id) ? "checked" : ""} ${queued ? "disabled" : ""}><img src="${this.icon(item)}" alt=""><div class="identity"><strong>${this.esc(item.name)}</strong><small>${this.esc(version)}</small></div><span class="status ${status.toLowerCase().replaceAll(" ", "-")}">${status}</span>${reviewPanel}<div class="row-actions">${actions.join("")}</div></article>`;
    }).join("");
    const queueRows = queue.map((item, index) => `<div class="queue-row ${this.esc(item.status)}"><span>${String(index + 1).padStart(2, "0")}</span><span>${this.esc(item.name)}</span><b>${this.esc(item.status === "waiting" ? "STAGED" : item.status?.toUpperCase())}</b>${item.status === "failed" ? `<small>${this.esc(item.message)} · ${this.esc(item.recovery)}</small>` : ""}</div>`).join("");
    this.shadowRoot.innerHTML = `<style>${VectorUpdateQueueCard.styles}</style><ha-card>
      <header><div><h2>${this.esc(this.config.title)}</h2><small>${updateState.state} AVAILABLE · ${reviewState?.state || 0} REVIEW</small></div><div class="toolbar"><button data-service="refresh_updates">REFRESH</button><button class="danger" data-service="clear_queue" ${!queue.length || running ? "disabled" : ""}>CLEAR QUEUE</button><a href="${backend}/updates" target="_blank" rel="noopener">FULL CENTRE ↗</a></div></header>
      <div class="batch-toolbar"><button data-select-all>${this._selected.size === available.length && available.length ? "CLEAR SELECTION" : "SELECT ALL"}</button><label>STAGING <select data-interval><option value="0">No delay</option><option value="5">5 minutes</option><option value="10" selected>10 minutes</option><option value="15">15 minutes</option></select></label><button class="now" data-update-selected ${this._selected.size ? "" : "disabled"}>UPDATE SELECTED${this._selected.size ? ` (${this._selected.size})` : ""}</button><button data-update-all ${available.length ? "" : "disabled"}>UPDATE ALL</button></div>
      ${Object.keys(partialErrors).length ? `<div class="notice error">Partial data: ${this.esc(Object.entries(partialErrors).map(([key, value]) => `${key}: ${value}`).join(" · "))}</div>` : ""}
      ${this._notice ? `<div class="notice ${this._notice.kind}">${this.esc(this._notice.text)}</div>` : ""}
      ${queue.length ? `<section><div class="section-title"><span>QUEUE</span><span>${this.esc(queueState.state).toUpperCase()}</span></div><div class="queue-list">${queueRows}</div><div class="queue-actions"><button data-service="run_pending" ${running || !queue.some((x) => x.status === "pending") ? "disabled" : ""}>RUN PENDING</button></div></section>` : ""}
      <section><div class="section-title"><span>AVAILABLE UPDATES</span><span>${available.length}</span></div><div class="updates">${rows || '<div class="empty">✓ EVERYTHING CURRENT</div>'}</div></section>
    </ha-card>`;
    this.shadowRoot.querySelectorAll("[data-service]").forEach((button) => button.addEventListener("click", async () => {
      const service = button.dataset.service;
      if (service === "clear_queue" && !confirm("Clear completed, failed, staged and pending queue entries? Active updates cannot be cleared.")) return;
      button.disabled = true;
      try { await this.service(service, button.dataset.id ? { item_id: button.dataset.id } : {}); this._notice = { kind: "success", text: "Command accepted by Vector Ops." }; }
      catch (error) { this._notice = { kind: "error", text: error?.message || "Vector Ops rejected the command." }; }
      finally { this.render(); setTimeout(() => { button.disabled = false; }, 1200); }
    }));
    this.shadowRoot.querySelectorAll("[data-toggle-review]").forEach((button) => button.addEventListener("click", () => {
      const id = button.dataset.toggleReview;
      if (this._openReviews.has(id)) this._openReviews.delete(id); else this._openReviews.add(id);
      this.render();
    }));
    this.shadowRoot.querySelectorAll("[data-select]").forEach((input) => input.addEventListener("change", () => {
      if (input.checked) this._selected.add(input.dataset.select); else this._selected.delete(input.dataset.select);
      this.render();
    }));
    this.shadowRoot.querySelector("[data-select-all]")?.addEventListener("click", () => {
      const selectable = available.filter((item) => !queue.some((q) => q.id === item.id && ["pending", "waiting", "running"].includes(q.status))).map((item) => item.id || (item.entity_id ? `ha:${item.entity_id}` : ""));
      if (selectable.length && selectable.every((id) => this._selected.has(id))) this._selected.clear(); else selectable.forEach((id) => this._selected.add(id));
      this.render();
    });
    const runBatch = async (ids) => {
      if (!ids.length || !confirm(`Start ${ids.length} selected update(s)? Host lanes remain sequential and the configured staging interval will be applied.`)) return;
      const interval = Number(this.shadowRoot.querySelector("[data-interval]")?.value || 10);
      try {
        await this.service("update_batch", { item_ids: ids, interval_minutes: interval });
        this._selected.clear();
        this._notice = { kind: "success", text: `Accepted ${ids.length} update(s) with ${interval}-minute staging.` };
      } catch (error) {
        this._notice = { kind: "error", text: error?.message || "Vector Ops rejected the batch." };
      }
      this.render();
    };
    this.shadowRoot.querySelector("[data-update-selected]")?.addEventListener("click", () => runBatch([...this._selected]));
    this.shadowRoot.querySelector("[data-update-all]")?.addEventListener("click", () => runBatch(available.map((item) => item.id || (item.entity_id ? `ha:${item.entity_id}` : "")).filter(Boolean)));
  }
}

VectorUpdateQueueCard.styles = `
  :host{--vc-primary:var(--primary-color,#03a9f4);--vc-accent:var(--accent-color,var(--primary-color,#03a9f4));--vc-success:var(--success-color,#43a047);--vc-warning:var(--warning-color,#ffa600);--vc-error:var(--error-color,#db4437);--vc-divider:var(--divider-color,rgba(0,0,0,.12));display:block;color:var(--primary-text-color)}
  ha-card{background:var(--ha-card-background,var(--card-background-color));color:var(--primary-text-color);border:1px solid var(--ha-card-border-color,var(--divider-color));border-radius:var(--ha-card-border-radius,12px);box-shadow:var(--ha-card-box-shadow);font-family:var(--paper-font-body1_-_font-family,inherit);overflow:hidden}
  header{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:16px;border-bottom:1px solid var(--vc-divider)}
  h2{font-size:18px;color:var(--primary-text-color);margin:0 0 5px;font-weight:500}small{display:block;color:var(--secondary-text-color);font-size:12px}.toolbar,.row-actions,.queue-actions,.batch-toolbar{display:flex;gap:8px;flex-wrap:wrap}.batch-toolbar{align-items:center;padding:12px 16px;border-bottom:1px solid var(--vc-divider)}.batch-toolbar label{display:flex;align-items:center;gap:7px;color:var(--secondary-text-color);font-size:12px}.batch-toolbar select{background:var(--card-background-color);color:var(--primary-text-color);border:1px solid var(--vc-divider);border-radius:8px;padding:7px}.notice{margin:10px 16px;padding:10px 12px;border-radius:8px;background:var(--secondary-background-color);font-size:12px}.notice.success{color:var(--vc-success);border-left:3px solid var(--vc-success)}.notice.error{color:var(--vc-error);border-left:3px solid var(--vc-error)}
  button,a{font:500 12px var(--paper-font-body1_-_font-family,inherit);background:transparent;color:var(--vc-primary);border:1px solid var(--vc-primary);border-radius:var(--control-button-border-radius,18px);padding:8px 12px;text-decoration:none;cursor:pointer}button:hover,a:hover{background:color-mix(in srgb,var(--vc-primary) 10%,transparent)}button:disabled{opacity:.38;cursor:not-allowed}.danger{color:var(--vc-error);border-color:var(--vc-error)}.now{color:var(--text-primary-color,#fff);background:var(--vc-primary);border-color:var(--vc-primary)}
  section{border-bottom:1px solid var(--vc-divider)}.section-title{display:flex;justify-content:space-between;padding:12px 16px;color:var(--secondary-text-color);font-size:12px;font-weight:500}.updates{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:0 12px 12px}
  .update{display:grid;grid-template-columns:28px 54px 1fr auto;gap:11px;align-items:start;background:var(--secondary-background-color,var(--card-background-color));border:1px solid var(--vc-divider);border-radius:var(--ha-card-border-radius,12px);padding:12px}.update img{width:48px;height:48px;object-fit:contain}.identity{min-width:0}.identity strong{display:block;font-size:14px;margin:3px 0 6px;font-weight:500}.identity small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.status{grid-column:3/5;border-top:1px solid var(--vc-divider);padding-top:8px;font-size:11px;font-weight:600}.ready{color:var(--vc-success)}.review-required,.running{color:var(--vc-warning)}.pending,.staged{color:var(--vc-primary)}
  .review-panel{grid-column:3/5;border-left:3px solid var(--vc-warning);border-radius:4px;padding:10px;background:color-mix(in srgb,var(--vc-warning) 8%,transparent);color:var(--primary-text-color);font-size:12px;line-height:1.45}.review-panel strong,.review-panel b{color:var(--primary-text-color)}.review-panel p{margin:6px 0}.review-panel ul{margin:7px 0 0;padding-left:18px}.row-actions{grid-column:3/5}.queue-list{padding:0 16px}.queue-row{display:grid;grid-template-columns:26px 1fr auto;gap:8px;padding:10px 0;border-bottom:1px solid var(--vc-divider);font-size:13px}.queue-row small{grid-column:2/4;color:var(--vc-error)}.queue-row.done{color:var(--vc-success)}.queue-row.failed{color:var(--vc-error)}.queue-row.running{color:var(--vc-warning)}.queue-actions{padding:12px 16px}.empty,.missing{padding:28px;text-align:center;color:var(--secondary-text-color)}
  @media(max-width:700px){header{align-items:flex-start;flex-direction:column}.updates{grid-template-columns:1fr}.toolbar{width:100%}}
`;

class VectorOpsOverviewCard extends HTMLElement {
  setConfig(config) {
    this.config = {
      health_entity: "sensor.vector_ops_service_health",
      infrastructure_entity: "sensor.vector_ops_infrastructure",
      backup_entity: "sensor.vector_ops_backup",
      incidents_entity: "sensor.vector_ops_incidents",
      weather_entity: "sensor.vector_ops_weather",
      updates_entity: "sensor.vector_ops_updates_available",
      update_path: "/update-centre/updates",
      ...config,
    };
    this._filter = this._filter || "all";
    this._stateRefs = null;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
  }

  set hass(hass) {
    const ids = this.config ? [this.config.health_entity, this.config.infrastructure_entity, this.config.backup_entity, this.config.incidents_entity, this.config.weather_entity, this.config.updates_entity] : [];
    const refs = ids.map((id) => hass.states[id]);
    if (this._stateRefs && refs.every((ref, index) => ref === this._stateRefs[index])) { this._hass = hass; return; }
    this._stateRefs = refs;
    this._hass = hass;
    this.render();
  }
  getCardSize() { return 16; }
  getGridOptions() { return { columns: 12, min_columns: 6, rows: 16, min_rows: 8 }; }
  static getStubConfig() { return {}; }
  esc(value) { return String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  safeUrl(value, fallback = "#") { try { const url = new URL(value, window.location.origin); return url.protocol === "https:" ? url.href.replace(/\/$/, "") : fallback; } catch { return fallback; } }
  icon(key, backend) { return `${this.safeUrl(backend, "https://ops.dmhhome.uk")}/icons/${encodeURIComponent(key || "service")}.svg`; }
  age(hours) { return hours == null ? "—" : hours < 1 ? `${Math.round(hours * 60)}m` : `${Number(hours).toFixed(1)}h`; }

  render() {
    if (!this._hass || !this.config) return;
    const state = (id) => this._hass.states[id];
    const health = state(this.config.health_entity), infra = state(this.config.infrastructure_entity), backup = state(this.config.backup_entity), incidents = state(this.config.incidents_entity), weather = state(this.config.weather_entity), updates = state(this.config.updates_entity);
    if (!health || !infra || !backup || !incidents || !weather || !updates) {
      this.shadowRoot.innerHTML = `<ha-card><div class="missing">Vector Ops overview entities are unavailable.</div></ha-card>`;
      return;
    }
    const h = health.attributes, ia = infra.attributes, b = backup.attributes, w = weather.attributes;
    const backend = updates.attributes.backend_url || "https://ops.dmhhome.uk";
    const allRoutes = h.routes || [];
    const routes = allRoutes.filter((x) => this._filter === "all" || (this._filter === "ok" && x.ok) || (this._filter === "bad" && !x.ok));
    const incidentItems = incidents.attributes.items || [], updateCount = Number(updates.state) || 0;
    const concerns = [];
    Object.entries(h.partial_errors || {}).forEach(([key, value]) => concerns.push(`${key} data — ${value}`));
    allRoutes.filter((x) => !x.ok).forEach((x) => concerns.push(`${x.name} route — HTTP ${x.code || "error"}`));
    (ia.items || []).filter((x) => !x.ok).forEach((x) => concerns.push(`${x.name} uptime — ${x.detail || "data unavailable"}`));
    (ia.uptime_concerns || []).forEach((x) => concerns.push(`${x.name || "Service"} — ${x.reason || "not up"}`));
    (ia.hosts || []).forEach((host) => {
      if (!host.ok) concerns.push(`${host.name} inventory — ${host.error || "collector unavailable"}`);
      (host.abnormal || []).forEach((x) => concerns.push(`${host.name}: ${x.name} — ${x.status || "abnormal"}`));
    });
    if (backup.state !== "healthy") concerns.push(`Backup — ${b.error || this.age(b.age_hours) + " old"}`);
    const now = new Date();
    const routeRows = routes.map((x) => `<a class="service" href="${this.esc(this.safeUrl(x.url))}" target="_blank" rel="noopener"><img src="${this.icon(x.service_key, backend)}" alt=""><span><strong>${this.esc(x.name)}</strong><small>HTTP ${this.esc(x.code || "ERR")} · ${this.esc(x.ms)}ms</small></span><span class="dot ${x.ok ? "good" : "bad"}"></span></a>`).join("") || `<div class="empty">No matching services</div>`;
    const forecast = (w.forecast || []).map((day) => `<div class="forecast"><strong>${new Date(day.date + "T12:00:00").toLocaleDateString("en-GB", {weekday:"short"})}</strong><span>${this.esc(day.summary)}</span><b>${this.esc(day.high)}°</b><small>${this.esc(day.low)}° · ${this.esc(day.rain)}% rain</small></div>`).join("");
    const hostRows = (ia.hosts || []).map((host) => `<div class="host"><div><strong>${this.esc(host.name)}</strong><small>${this.esc(host.total)} containers</small></div><span class="label ${host.ok && !(host.abnormal || []).length ? "success" : "error"}">${host.ok && !(host.abnormal || []).length ? "All running" : `${(host.abnormal || []).length} abnormal`}</span></div>`).join("");
    const uptimeRows = (ia.items || []).map((item) => `<div class="uptime"><img src="${this.icon(item.service_key, backend)}" alt=""><span><strong>${this.esc(item.name)}</strong><small>Continuous uptime</small></span><b class="${item.ok ? "success-text" : "error-text"}">${this.esc(item.display)}</b></div>`).join("");
    this.shadowRoot.innerHTML = `<style>${VectorOpsOverviewCard.styles}</style><ha-card>
      <header><div><h2>Vector Ops</h2><small>${concerns.length ? `${concerns.length} need attention` : "All systems nominal"}</small></div><div class="actions"><button data-refresh>Refresh</button><a href="${this.esc(this.config.update_path)}">Update Centre${updateCount ? ` · ${updateCount}` : ""}</a></div></header>
      <section class="top"><div class="clock"><strong>${now.toLocaleTimeString("en-GB", {hour:"2-digit",minute:"2-digit"})}</strong><span>${now.toLocaleDateString("en-GB", {weekday:"long",day:"2-digit",month:"long",year:"numeric"})}</span></div><div class="weather"><strong>${this.esc(w.temperature)}°C</strong><span>${this.esc(weather.state)} · feels ${this.esc(w.feels_like)}°</span><small>Wind ${this.esc(w.wind)} km/h · rain ${this.esc(w.precipitation)} mm</small></div><details><summary>Five-day forecast</summary><div class="forecasts">${forecast}</div></details></section>
      <section><div class="section-title"><span>Overview</span></div><div class="metrics"><div><span>Service routes</span><b>${this.esc(h.services_ok)}/${this.esc(h.services_total)}</b></div><div><span>24h uptime</span><b>${ia.uptime_percent == null ? "—" : this.esc(ia.uptime_percent) + "%"}</b></div><div><span>Last backup</span><b>${this.age(b.age_hours)}</b></div><div><span>24h incidents</span><b>${incidentItems.length}</b></div><div><span>Updates</span><b>${updateCount}</b></div></div></section>
      <section><div class="section-title"><span>Services</span><div class="filters"><button data-filter="all" class="${this._filter === "all" ? "active" : ""}">All</button><button data-filter="ok" class="${this._filter === "ok" ? "active" : ""}">Healthy</button><button data-filter="bad" class="${this._filter === "bad" ? "active" : ""}">Attention</button></div></div><div class="services">${routeRows}</div></section>
      <section class="split"><div><div class="section-title"><span>Infrastructure uptime</span></div><div class="stack">${uptimeRows}</div></div><div><div class="section-title"><span>Fleet</span></div><div class="stack">${hostRows}</div></div></section>
      <section class="split"><div><div class="section-title"><span>Operations</span></div><div class="stack"><div class="host"><div><strong>Backup</strong><small>${this.esc(b.services)} services · ${this.esc(b.size)} · ${this.esc(b.duration)}</small></div><span class="label ${backup.state === "healthy" ? "success" : "error"}">${this.esc(backup.state)}</span></div><div class="host"><div><strong>Hermes gateway log</strong><small>Diagnostics retained locally · raw warnings hidden</small></div><span class="label success">Available</span></div></div></div><div><div class="section-title"><span>Attention</span></div><div class="stack">${concerns.length ? concerns.map((x) => `<div class="concern">${this.esc(x)}</div>`).join("") : `<div class="empty success-text">Nothing needs your attention</div>`}</div></div></section>
      <section><div class="section-title"><span>Incidents · 24 hours</span></div><div class="stack incidents">${incidentItems.length ? incidentItems.map((x) => `<div class="host"><div><strong>${this.esc(x.service)}</strong><small>${this.esc(x.reason || "Recorded event")}</small></div><span class="label">${this.esc(x.action)}</span></div>`).join("") : `<div class="empty success-text">No incidents recorded</div>`}</div></section>
      <footer>Refreshed ${h.generated_at ? new Date(h.generated_at).toLocaleString("en-GB") : "—"}</footer>
    </ha-card>`;
    this.shadowRoot.querySelector("[data-refresh]")?.addEventListener("click", () => this._hass.callService("homeassistant", "update_entity", {entity_id: this.config.health_entity}));
    this.shadowRoot.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => { this._filter = button.dataset.filter; this.render(); }));
  }
}

VectorOpsOverviewCard.styles = `
  :host{--vc-primary:var(--primary-color,#03a9f4);--vc-success:var(--success-color,#43a047);--vc-warning:var(--warning-color,#ffa600);--vc-error:var(--error-color,#db4437);--vc-divider:var(--divider-color,rgba(0,0,0,.12));display:block;color:var(--primary-text-color)}ha-card{background:var(--ha-card-background,var(--card-background-color));color:var(--primary-text-color);border:1px solid var(--ha-card-border-color,var(--vc-divider));border-radius:var(--ha-card-border-radius,12px);box-shadow:var(--ha-card-box-shadow);overflow:hidden}header{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:18px;border-bottom:1px solid var(--vc-divider)}h2{margin:0 0 4px;font-size:22px;font-weight:500}small{color:var(--secondary-text-color)}.actions,.filters{display:flex;gap:8px;flex-wrap:wrap}button,a{font:500 12px inherit;background:transparent;color:var(--vc-primary);border:1px solid var(--vc-primary);border-radius:var(--control-button-border-radius,18px);padding:8px 12px;text-decoration:none;cursor:pointer}button.active{color:var(--text-primary-color,#fff);background:var(--vc-primary)}section{border-bottom:1px solid var(--vc-divider)}.top{display:grid;grid-template-columns:1fr 1fr;gap:18px;padding:18px}.clock,.weather{display:flex;flex-direction:column;gap:4px}.clock strong,.weather>strong{font-size:28px;font-weight:400;color:var(--primary-text-color)}details{grid-column:1/3}summary{color:var(--vc-primary);cursor:pointer}.forecasts{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:12px}.forecast{display:flex;flex-direction:column;gap:4px;padding:10px;background:var(--secondary-background-color,var(--card-background-color));border-radius:var(--ha-card-border-radius,12px)}.forecast b{color:var(--vc-primary)}.section-title{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;color:var(--secondary-text-color);font-size:13px;font-weight:500}.metrics{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:var(--vc-divider)}.metrics>div{display:flex;flex-direction:column;gap:7px;background:var(--ha-card-background,var(--card-background-color));padding:16px}.metrics span{color:var(--secondary-text-color);font-size:12px}.metrics b{font-size:20px;font-weight:500}.services{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:0 14px 14px}.service{display:grid;grid-template-columns:42px 1fr auto;align-items:center;gap:10px;color:var(--primary-text-color);border-color:var(--vc-divider);border-radius:var(--ha-card-border-radius,12px)}.service img,.uptime img{width:36px;height:36px;object-fit:contain}.service span,.uptime span{display:flex;flex-direction:column;gap:3px}.dot{width:9px;height:9px;border-radius:50%;background:var(--vc-success)}.dot.bad{background:var(--vc-error)}.split{display:grid;grid-template-columns:1fr 1fr}.split>div+div{border-left:1px solid var(--vc-divider)}.stack{display:flex;flex-direction:column;padding:0 16px 14px}.uptime,.host{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 0;border-bottom:1px solid var(--vc-divider)}.uptime>span,.host>div{flex:1;display:flex;flex-direction:column;gap:3px}.label{padding:4px 8px;border-radius:12px;background:var(--secondary-background-color);font-size:11px;text-transform:capitalize}.label.success,.success-text{color:var(--vc-success)}.label.error,.error-text,.concern{color:var(--vc-error)}.concern,.empty{padding:10px 0}.incidents{padding-bottom:14px}footer{padding:12px 16px;color:var(--secondary-text-color);font-size:11px;text-align:right}@media(max-width:800px){header{align-items:flex-start;flex-direction:column}.top,.split{grid-template-columns:1fr}.top details{grid-column:1}.split>div+div{border-left:0;border-top:1px solid var(--vc-divider)}.forecasts{grid-template-columns:repeat(2,1fr)}.metrics{grid-template-columns:repeat(2,1fr)}.services{grid-template-columns:1fr}}
`;

if (!customElements.get("vector-update-queue-card")) customElements.define("vector-update-queue-card", VectorUpdateQueueCard);
if (!customElements.get("vector-ops-overview-card")) customElements.define("vector-ops-overview-card", VectorOpsOverviewCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "vector-update-queue-card", name: "Vector Update Queue", description: "Native Vector Ops update queue card" });
window.customCards.push({ type: "vector-ops-overview-card", name: "Vector Ops Overview", description: "Theme-aware native Vector Ops overview card" });
