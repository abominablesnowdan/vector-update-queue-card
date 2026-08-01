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
  }

  set hass(hass) {
    this._hass = hass;
    this.render();
  }

  getCardSize() { return 8; }

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
    const activeIds = new Set(queue.filter((x) => ["pending", "waiting", "running"].includes(x.status)).map((x) => x.id));
    const running = queueState.state === "running";
    const backend = updateState.attributes.backend_url || "https://ops.dmhhome.uk";
    const rows = available.map((item) => {
      const id = item.id || (item.entity_id ? `ha:${item.entity_id}` : "");
      const queued = queue.find((x) => x.id === id && ["pending", "waiting", "running"].includes(x.status));
      const review = item.approved === false || item.review_required === true;
      const status = queued ? (queued.status === "waiting" ? "STAGED" : queued.status.toUpperCase()) : (review ? "REVIEW REQUIRED" : "READY");
      const actions = [];
      if (!queued && review) actions.push(`<button data-open-review="${this.esc(id)}">REVIEW</button>`);
      if (!queued && !review) {
        actions.push(`<button class="now" data-service="update_now" data-id="${this.esc(id)}">UPDATE NOW</button>`);
        actions.push(`<button data-service="add_to_queue" data-id="${this.esc(id)}">ADD TO QUEUE</button>`);
      }
      if (item.url) actions.push(`<a href="${this.esc(item.url)}" target="_blank" rel="noopener">RELEASE NOTES</a>`);
      const version = item.installed && item.latest ? `${item.installed} → ${item.latest}` : (item.image || "");
      return `<article class="update"><img src="${this.icon(item)}" alt=""><div class="identity"><strong>${this.esc(item.name)}</strong><small>${this.esc(version)}</small></div><span class="status ${status.toLowerCase().replaceAll(" ", "-")}">${status}</span><div class="row-actions">${actions.join("")}</div></article>`;
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
    this.shadowRoot.querySelectorAll("[data-open-review]").forEach((button) => button.addEventListener("click", () => window.open(`${backend}/review?id=${encodeURIComponent(button.dataset.openReview)}`, "_blank", "noopener")));
  }
}

VectorUpdateQueueCard.styles = `
  :host{--ops-bg:#181818;--ops-surface:#1d1d1d;--ops-line:#555;--ops-blue:#b4d9fe;--ops-amber:#f5a100;--ops-green:#6bcb77;--ops-red:#ff6b6b;display:block}
  ha-card{background:var(--ops-bg);color:#e7e7e7;border:1px dashed var(--ops-amber);font-family:"Courier New",monospace;overflow:hidden}
  header{display:flex;justify-content:space-between;gap:14px;align-items:center;padding:16px;border-bottom:1px dashed var(--ops-line)}h2{font-size:18px;color:var(--ops-amber);margin:0 0 5px;text-transform:uppercase}small{display:block;color:#858585;font-size:10px}.toolbar,.row-actions,.queue-actions{display:flex;gap:7px;flex-wrap:wrap}button,a{font:10px "Courier New",monospace;letter-spacing:.05em;text-transform:uppercase;background:#191919;color:var(--ops-blue);border:1px dashed var(--ops-blue);padding:8px 10px;text-decoration:none;cursor:pointer}button:disabled{opacity:.35;cursor:not-allowed}.danger{color:var(--ops-red);border-color:var(--ops-red)}.now{color:#111;background:var(--ops-green);border-color:var(--ops-green)}section{border-bottom:1px dashed #363636}.section-title{display:flex;justify-content:space-between;padding:10px 14px;color:var(--ops-blue);font-size:10px;letter-spacing:.1em}.updates{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;padding:0 12px 12px}.update{display:grid;grid-template-columns:54px 1fr auto;gap:11px;align-items:start;background:var(--ops-surface);border:1px dashed var(--ops-line);padding:12px}.update img{width:48px;height:48px;object-fit:contain}.identity{min-width:0}.identity strong{display:block;font-size:12px;margin:3px 0 6px}.identity small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.status{grid-column:2/4;border-top:1px dashed #3a3a3a;padding-top:7px;font-size:9px;letter-spacing:.09em}.ready{color:var(--ops-green)}.review-required,.running{color:var(--ops-amber)}.pending,.staged{color:var(--ops-blue)}.row-actions{grid-column:2/4}.queue-list{padding:0 14px}.queue-row{display:grid;grid-template-columns:26px 1fr auto;gap:8px;padding:8px 0;border-bottom:1px dashed #353535;font-size:11px}.queue-row small{grid-column:2/4;color:var(--ops-red)}.queue-row.done{color:var(--ops-green)}.queue-row.failed{color:var(--ops-red)}.queue-row.running{color:var(--ops-amber)}.queue-actions{padding:10px 14px}.empty,.missing{padding:28px;text-align:center;color:#858585}@media(max-width:700px){header{align-items:flex-start;flex-direction:column}.updates{grid-template-columns:1fr}.toolbar{width:100%}}
`;

customElements.define("vector-update-queue-card", VectorUpdateQueueCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "vector-update-queue-card", name: "Vector Update Queue", description: "Native Vector Ops update queue card" });
