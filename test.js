const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync('vector-update-queue-card.js', 'utf8');
const registered = {};
class HTMLElement { attachShadow(){ this.shadowRoot = {}; } }
const context = { HTMLElement, URL, customElements: { get: (n) => registered[n], define: (n,c) => registered[n]=c }, window: { location: { origin: 'https://homeassistant.dmhhome.uk' } }, console };
vm.createContext(context); vm.runInContext(code, context);
if (!registered['vector-update-queue-card']) throw new Error('queue card not registered');
if (!registered['vector-ops-overview-card']) throw new Error('overview card not registered');
const Card = registered['vector-update-queue-card'];
const card = new Card(); card.setConfig({});
if (card.config.queue_entity !== 'sensor.vector_ops_queue') throw new Error('bad queue defaults');
let queueRenders = 0; card.render = () => queueRenders++;
const queueStates = {
  'sensor.vector_ops_updates_available': {},
  'sensor.vector_ops_queue': {},
  'sensor.vector_ops_review_required': {},
};
card.hass = { states: queueStates };
card.hass = { states: { ...queueStates, 'sensor.unrelated': {} } };
if (queueRenders !== 1) throw new Error('queue card rerendered for unrelated state');
const Overview = registered['vector-ops-overview-card'];
const overview = new Overview(); overview.setConfig({ uptime_kuma_status_entities: ['sensor.plex_status', 'sensor.sonarr_status'] });
if (overview.config.health_entity !== 'sensor.vector_ops_service_health') throw new Error('bad overview defaults');
const kumaStates = {
  'sensor.plex_status': { state: 'up', attributes: { friendly_name: 'Plex Status', config_entry_id: 'kuma' } },
  'sensor.sonarr_status': { state: 'down', attributes: { friendly_name: 'Sonarr Status', config_entry_id: 'kuma' } },
  'sensor.radarr_response_time': { state: '42', attributes: { friendly_name: 'Radarr Response time', config_entry_id: 'kuma' } },
};
const kuma = overview.kumaStatusItems(kumaStates);
if (kuma.length !== 2 || !kuma.find((x) => x.name === 'Sonarr' && x.state === 'down')) throw new Error('native Kuma status sensors not selected');
let overviewRenders = 0; overview.render = () => overviewRenders++;
const overviewStates = Object.fromEntries([
  overview.config.health_entity, overview.config.infrastructure_entity, overview.config.backup_entity,
  overview.config.incidents_entity, overview.config.weather_entity, overview.config.updates_entity,
].map((id) => [id, {}]));
overview.hass = { states: overviewStates };
overview.hass = { states: { ...overviewStates, 'sensor.unrelated': {} } };
if (overviewRenders !== 1) throw new Error('overview card rerendered for unrelated state');
overview.hass = { states: { ...overviewStates, 'sensor.plex_status': { state: 'up' }, 'sensor.plex_response_time': { state: '10' } } };
overview.hass = { states: { ...overviewStates, 'sensor.plex_status': { state: 'down' }, 'sensor.plex_response_time': { state: '10' } } };
overview.hass = { states: { ...overviewStates, 'sensor.plex_status': { state: 'down' }, 'sensor.plex_response_time': { state: '20' } } };
overview.hass = { states: overviewStates };
if (overviewRenders !== 5) throw new Error('overview card did not rerender for Kuma status, response-time, and removal changes');
if (!code.includes('/vector_ops_static/icons/')) throw new Error('icons are not served from the Home Assistant origin');
if (!code.includes('.dot.warn{background:var(--vc-warning)}')) throw new Error('authentication warning style missing');
if (!code.includes('rows: "auto"')) throw new Error('overview card does not advertise auto height');
const generatedAt = '2026-08-05T22:40:20+01:00';
const finishedAfterInventory = { id: 'apollo:sonarr', status: 'done', finished_at: '2026-08-05T22:40:25+01:00' };
const finishedBeforeInventory = { id: 'apollo:sonarr', status: 'done', finished_at: '2026-08-05T22:40:15+01:00' };
if (card.queuePresentation(finishedAfterInventory, generatedAt) !== 'verifying') throw new Error('recent completion should remain locked while inventory is stale');
if (card.queuePresentation(finishedBeforeInventory, generatedAt) !== null) throw new Error('verified completion should become actionable when still offered');
if (card.queuePresentation(null, generatedAt, true) !== 'sending') throw new Error('accepted command should lock immediately before entity refresh');
console.log('card_contract=passed');
