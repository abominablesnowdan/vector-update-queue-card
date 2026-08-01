class VectorUpdateQueueCard extends HTMLElement {
  setConfig(config) {
    this.config = {
      updates_entity: "sensor.vector_ops_updates_available",
      queue_entity: "sensor.vector_ops_queue",
      review_entity: "sensor.vector_ops_review_required",
      title: "Vector Update Centre",
      ...config,
    };
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._openReviews = this._openReviews || new Set();
  }

  set hass(hass) {
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
    return `${backend}/icons/${key}.svg`;
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
      if (item.url) actions.push(`<a href="${this.esc(item.url)}" target="_blank" rel="noopener">RELEASE NOTES</a>`);
      const version = item.installed && item.latest ? `${item.installed} → ${item.latest}` : (item.image || "");
      const detail = item.review || {};
      const reviewPanel = reviewOpen ? `<div class="review-panel"><strong>${this.esc(detail.summary || "Operational review")}</strong><p>${this.esc(detail.justification || item.reason || "Manual review requested")}</p><p><b>IMPACT</b> · ${this.esc(detail.impact || "Brief service interruption may occur")}</p>${(detail.checks || []).length ? `<ul>${detail.checks.map((check) => `<li>${this.esc(check)}</li>`).join("")}</ul>` : ""}</div>` : "";
      return `<article class="update"><img src="${this.icon(item)}" alt=""><div class="identity"><strong>${this.esc(item.name)}</strong><small>${this.esc(version)}</small></div><span class="status ${status.toLowerCase().replaceAll(" ", "-")}">${status}</span>${reviewPanel}<div class="row-actions">${actions.join("")}</div></article>`;
    }).join("");
    const queueRows = queue.map((item, index) => `<div class="queue-row ${this.esc(item.status)}"><span>${String(index + 1).padStart(2, "0")}</span><span>${this.esc(item.name)}</span><b>${this.esc(item.status === "waiting" ? "STAGED" : item.status?.toUpperCase())}</b>${item.status === "failed" ? `<small>${this.esc(item.message)} · ${this.esc(item.recovery)}</small>` : ""}</div>`).join("");
    this.shadowRoot.innerHTML = `<style>${VectorUpdateQueueCard.styles}</style><ha-card>
      <header><div><h2>${this.esc(this.config.title)}</h2><small>${updateState.state} AVAILABLE · ${reviewState?.state || 0} REVIEW</small></div><div class="toolbar"><button data-service="refresh_updates">REFRESH</button><button class="danger" data-service="clear_queue" ${!queue.length || running ? "disabled" : ""}>CLEAR QUEUE</button><a href="${backend}/updates" target="_blank" rel="noopener">FULL CENTRE ↗</a></div></header>
      ${queue.length ? `<section><div class="section-title"><span>QUEUE</span><span>${this.esc(queueState.state).toUpperCase()}</span></div><div class="queue-list">${queueRows}</div><div class="queue-actions"><button data-service="run_pending" ${running || !queue.some((x) => x.status === "pending") ? "disabled" : ""}>RUN PENDING</button></div></section>` : ""}
      <section><div class="section-title"><span>AVAILABLE UPDATES</span><span>${available.length}</span></div><div class="updates">${rows || '<div class="empty">✓ EVERYTHING CURRENT</div>'}</div></section>
    </ha-card>`;
    this.shadowRoot.querySelectorAll("[data-service]").forEach((button) => button.addEventListener("click", async () => {
      const service = button.dataset.service;
      if (service === "clear_queue" && !confirm("Clear completed, failed, staged and pending queue entries? Active updates cannot be cleared.")) return;
      button.disabled = true;
      try { await this.service(service, button.dataset.id ? { item_id: button.dataset.id } : {}); }
      finally { setTimeout(() => { button.disabled = false; }, 1200); }
    }));
    this.shadowRoot.querySelectorAll("[data-toggle-review]").forEach((button) => button.addEventListener("click", () => {
      const id = button.dataset.toggleReview;
      if (this._openReviews.has(id)) this._openReviews.delete(id); else this._openReviews.add(id);
      this.render();
    }));
  }
}

VectorUpdateQueueCard.styles = `
  :host{--vc-primary:var(--primary-color,#03a9f4);--vc-accent:var(--accent-color,var(--primary-color,#03a9f4));--vc-success:var(--success-color,#43a047);--vc-warning:var(--warning-color,#ffa600);--vc-error:var(--error-color,#db4437);--vc-divider:var(--divider-color,rgba(0,0,0,.12));display:block;color:var(--primary-text-color)}
  ha-card{background:var(--ha-card-background,var(--card-background-color));color:var(--primary-text-color);border:1px solid var(--ha-card-border-color,var(--divider-color));border-radius:var(--ha-card-border-radius,12px);box-shadow:var(--ha-card-box-shadow);font-family:var(--paper-font-body1_-_font-family,inherit);overflow:hidden}
  header{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:16px;border-bottom:1px solid var(--vc-divider)}
  h2{font-size:18px;color:var(--primary-text-color);margin:0 0 5px;font-weight:500}small{display:block;color:var(--secondary-text-color);font-size:12px}.toolbar,.row-actions,.queue-actions{display:flex;gap:8px;flex-wrap:wrap}
  button,a{font:500 12px var(--paper-font-body1_-_font-family,inherit);background:transparent;color:var(--vc-primary);border:1px solid var(--vc-primary);border-radius:var(--control-button-border-radius,18px);padding:8px 12px;text-decoration:none;cursor:pointer}button:hover,a:hover{background:color-mix(in srgb,var(--vc-primary) 10%,transparent)}button:disabled{opacity:.38;cursor:not-allowed}.danger{color:var(--vc-error);border-color:var(--vc-error)}.now{color:var(--text-primary-color,#fff);background:var(--vc-primary);border-color:var(--vc-primary)}
  section{border-bottom:1px solid var(--vc-divider)}.section-title{display:flex;justify-content:space-between;padding:12px 16px;color:var(--secondary-text-color);font-size:12px;font-weight:500}.updates{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:0 12px 12px}
  .update{display:grid;grid-template-columns:54px 1fr auto;gap:11px;align-items:start;background:var(--secondary-background-color,var(--card-background-color));border:1px solid var(--vc-divider);border-radius:var(--ha-card-border-radius,12px);padding:12px}.update img{width:48px;height:48px;object-fit:contain}.identity{min-width:0}.identity strong{display:block;font-size:14px;margin:3px 0 6px;font-weight:500}.identity small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.status{grid-column:2/4;border-top:1px solid var(--vc-divider);padding-top:8px;font-size:11px;font-weight:600}.ready{color:var(--vc-success)}.review-required,.running{color:var(--vc-warning)}.pending,.staged{color:var(--vc-primary)}
  .review-panel{grid-column:2/4;border-left:3px solid var(--vc-warning);border-radius:4px;padding:10px;background:color-mix(in srgb,var(--vc-warning) 8%,transparent);color:var(--primary-text-color);font-size:12px;line-height:1.45}.review-panel strong,.review-panel b{color:var(--primary-text-color)}.review-panel p{margin:6px 0}.review-panel ul{margin:7px 0 0;padding-left:18px}.row-actions{grid-column:2/4}.queue-list{padding:0 16px}.queue-row{display:grid;grid-template-columns:26px 1fr auto;gap:8px;padding:10px 0;border-bottom:1px solid var(--vc-divider);font-size:13px}.queue-row small{grid-column:2/4;color:var(--vc-error)}.queue-row.done{color:var(--vc-success)}.queue-row.failed{color:var(--vc-error)}.queue-row.running{color:var(--vc-warning)}.queue-actions{padding:12px 16px}.empty,.missing{padding:28px;text-align:center;color:var(--secondary-text-color)}
  @media(max-width:700px){header{align-items:flex-start;flex-direction:column}.updates{grid-template-columns:1fr}.toolbar{width:100%}}
`;

customElements.define("vector-update-queue-card", VectorUpdateQueueCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "vector-update-queue-card", name: "Vector Update Queue", description: "Native Vector Ops update queue card" });
