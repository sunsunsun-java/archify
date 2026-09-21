import { readFileSync } from 'node:fs';

// Frozen semantic capacity examples. Baseline runs remove only canvas_fit;
// candidate runs use these objects unchanged. Do not tune them to fit a frame.
const meta = (title) => ({ title, output: 'diagram.html', canvas_fit: 'content', quality_profile: 'standard' });

export const capacityCases = {
  'architecture-outer-route': {
    schema_version: 1, diagram_type: 'architecture', meta: meta('Remote recovery path'),
    components: [{ id: 'a', type: 'backend', label: 'Gateway', pos: [80, 80] },
      { id: 'b', type: 'database', label: 'Recovery', pos: [320, 80] }],
    connections: [{ id: 'recover', from: 'a', to: 'b', fromSide: 'bottom', toSide: 'bottom', via: [[140, 1000], [380, 1000]] }],
  },
  'architecture-thick-marker': {
    schema_version: 1, diagram_type: 'architecture', meta: meta('External archive route'),
    components: [{ id: 'a', type: 'backend', label: 'Writer', pos: [80, 80] },
      { id: 'b', type: 'database', label: 'Archive', pos: [320, 320] }],
    connections: [{ id: 'archive', from: 'a', to: 'b', fromSide: 'right', toSide: 'right', width: 20,
      via: [[1100, 110], [1100, 350]] }],
  },
  'architecture-marker-only-capacity': {
    schema_version: 1, diagram_type: 'architecture', meta: meta('Wide delivery arrow'),
    components: [{ id: 'a', type: 'backend', label: 'Gateway', pos: [80, 200] },
      { id: 'b', type: 'database', label: 'Store', pos: [320, 200] }],
    connections: [{ id: 'deliver', from: 'a', to: 'b', width: 30 }],
  },
  'architecture-boundary-legend': {
    schema_version: 1, diagram_type: 'architecture',
    meta: { ...meta('Trust boundary legend'), locale: 'zh-CN', legend: { mode: 'all', entries: {
      backend: { label: '负责处理身份验证和请求分发以及审计记录的后端服务模块' },
      database: { label: '持久化存储用户配置和历史任务运行数据的数据库模块' },
    } } },
    components: [{ id: 'a', type: 'backend', label: '服务', pos: [160, 120] },
      { id: 'b', type: 'database', label: '存储', pos: [480, 120] }],
    boundaries: [{ kind: 'region', label: '可信运行区域与持久化数据边界', wraps: ['a', 'b'] }],
    connections: [{ id: 'save', from: 'a', to: 'b' }],
  },
  'architecture-long-legend-paint': {
    schema_version: 1, diagram_type: 'architecture',
    meta: { ...meta('Backend responsibility legend'), locale: 'zh-CN', legend: { entries: {
      backend: { label: '负责处理身份验证请求分发访问控制任务排队运行上下文保存故障恢复结果校验以及完整审计记录的后端服务模块' },
    } } },
    components: [{ id: 'a', type: 'backend', label: '入口', pos: [80, 80] },
      { id: 'b', type: 'backend', label: '任务', pos: [320, 80] }],
    connections: [{ id: 'dispatch', from: 'a', to: 'b' }],
  },
  'architecture-ascii-legend-paint': {
    schema_version: 1, diagram_type: 'architecture',
    meta: { ...meta('Backend service responsibilities'), legend: { entries: {
      backend: { label: 'Backend authentication, authorization, queueing, recovery and audit handling' },
    } } },
    components: [{ id: 'a', type: 'backend', label: 'Ingress', pos: [80, 80] },
      { id: 'b', type: 'backend', label: 'Tasks', pos: [320, 80] }],
    connections: [{ id: 'dispatch', from: 'a', to: 'b' }],
  },
  'dataflow-high-row': {
    schema_version: 1, diagram_type: 'dataflow', meta: meta('Archive delivery'),
    stages: [{ label: 'Input' }, { label: 'Archive' }],
    nodes: [{ id: 'input', type: 'backend', label: 'Input', stage: 0, row: 0 },
      { id: 'archive', type: 'database', label: 'Archive', stage: 1, row: 4, yOffset: 500 }],
    flows: [{ id: 'save', from: 'input', to: 'archive', label: 'records' }],
  },
  'dataflow-wide-stage': {
    schema_version: 1, diagram_type: 'dataflow', meta: meta('Governed distribution'),
    stages: [{ label: 'Input' }, { label: 'Parse' }, { label: 'Validate' }, { label: 'Enrich' },
      { label: 'Audited downstream distribution and retention' }],
    nodes: ['input', 'parse', 'validate', 'enrich', 'distribute'].map((id, stage) => ({ id, type: 'backend', label: id, stage, row: 0 })),
    flows: ['input', 'parse', 'validate', 'enrich'].map((from, i) => ({ id: `transfer-${i}`, from,
      to: ['parse', 'validate', 'enrich', 'distribute'][i], label: 'record' })),
  },
  'dataflow-channel-legend': {
    schema_version: 1, diagram_type: 'dataflow',
    meta: { ...meta('Encrypted archive transfer'), locale: 'zh-CN', legend: { entries: {
      security: { label: '需要经过加密传输并保留完整审计记录的数据流' },
    } } },
    stages: [{ label: 'Source' }, { label: 'Vault' }],
    nodes: [{ id: 'source', type: 'backend', label: 'Source', stage: 0, row: 0 },
      { id: 'vault', type: 'database', label: 'Vault', stage: 1, row: 0 }],
    flows: [{ id: 'encrypt', from: 'source', to: 'vault', label: 'records', classification: 'confidential',
      variant: 'security', fromSide: 'bottom', toSide: 'bottom', via: [[100, 1050], [315, 1050]], labelAt: [210, 1010] }],
  },
  'sequence-fixed-timeline': {
    schema_version: 1, diagram_type: 'sequence', meta: meta('Release acknowledgements'),
    participants: Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, type: 'backend', label: `Service ${i}` })),
    messages: Array.from({ length: 11 }, (_, i) => ({ id: `m${i}`, from: `p${i}`, to: `p${i + 1}`, label: 'ack', y: 200 + i * 100 })),
  },
  'sequence-spread-fleet': {
    schema_version: 1, diagram_type: 'sequence', meta: { ...meta('Fleet rollout'), column_fit: 'spread' },
    participants: Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, type: 'backend', label: `Node ${i}` })),
    messages: Array.from({ length: 29 }, (_, i) => ({ id: `m${i}`, from: `p${i}`, to: `p${i + 1}`, label: 'deploy', y: 200 + i * 48 })),
  },
  'sequence-segment-activation': {
    schema_version: 1, diagram_type: 'sequence', meta: meta('Long-running job retention'),
    participants: [{ id: 'client', type: 'frontend', label: 'Client' }, { id: 'job', type: 'backend', label: 'Job' }],
    messages: [{ id: 'submit', from: 'client', to: 'job', label: 'submit', y: 200, note: 'asynchronous completion' }],
    segments: [{ label: 'Background execution and completion retention', from: 280, to: 1450 }],
    activations: [{ participant: 'job', from: 300, to: 1600 }],
  },
  'lifecycle-high-state': {
    schema_version: 1, diagram_type: 'lifecycle', meta: meta('Recovery completion'),
    lanes: [{ id: 'main', label: 'Execution' }, { id: 'terminal', label: 'Outcome' }],
    states: [{ id: 'run', type: 'active', label: 'Run', lane: 'main', col: 2 },
      { id: 'done', type: 'success', label: 'Done', lane: 'terminal', col: 0, yOffset: 650 }],
    transitions: [{ id: 'finish', from: 'run', to: 'done', label: 'complete', labelAt: [470, 640] }],
  },
  'lifecycle-rounded-channel': {
    schema_version: 1, diagram_type: 'lifecycle', meta: meta('Recovery channel'),
    lanes: [{ id: 'main', label: 'Execution' }, { id: 'event', label: 'Recovery' }],
    states: [{ id: 'run', type: 'active', label: 'Run', lane: 'main', col: 4 },
      { id: 'retry', type: 'waiting', label: 'Retry', lane: 'event', col: 2 }],
    transitions: [{ id: 'recover', from: 'run', to: 'retry', label: 'recover', note: 'preserve context',
      fromSide: 'right', toSide: 'right', route: 'right-channel', channelX: 1300, cornerRadius: 20, labelAt: [1160, 220] }],
  },
  'lifecycle-band-legend': {
    schema_version: 1, diagram_type: 'lifecycle',
    meta: { ...meta('Execution responsibilities'), locale: 'zh-CN', legend: { mode: 'all', entries: {
      active: { label: '正在执行并持续维护上下文的生命周期活动状态' },
      waiting: { label: '等待外部工具结果或者需要人工审核才能继续的状态' },
    } } },
    lanes: [{ id: 'main', label: '负责接收用户任务并执行规划校验和交付且持续保存每个阶段的操作记录以及必要的诊断信息' }],
    states: [{ id: 'plan', type: 'active', label: 'Plan', lane: 'main', col: 2 },
      { id: 'run', type: 'active', label: 'Run', lane: 'main', col: 3 }],
    transitions: [{ id: 'execute', from: 'plan', to: 'run' }],
  },
  'lifecycle-bottom-channel': {
    schema_version: 1, diagram_type: 'lifecycle', meta: meta('Deferred release completion'),
    lanes: [{ id: 'main', label: 'Execution and delivery' }],
    states: [{ id: 'run', type: 'active', label: 'Run', lane: 'main', col: 2 },
      { id: 'deliver', type: 'success', label: 'Deliver', lane: 'main', col: 4 }],
    transitions: [{ id: 'complete', from: 'run', to: 'deliver', label: 'complete', note: 'after deferred checks',
      route: 'bottom-channel', channelY: 1200, fromSide: 'bottom', toSide: 'bottom', cornerRadius: 18, labelAt: [556,1160] }],
  },
};

// Reader examples are authoritative package inputs, not duplicated test graphs.
export const browserCases = Object.fromEntries([
  ['architecture', 'content-services'], ['dataflow', 'content-pipelines'],
  ['sequence', 'content-release'], ['lifecycle', 'content-recovery'],
].map(([type, name]) => [type, JSON.parse(readFileSync(new URL(`../../examples/${name}.${type}.json`, import.meta.url), 'utf8'))]));

export const controlCases = Object.fromEntries([
  'web-app.architecture', 'brand-aware-delivery.architecture', 'production-deployment.architecture',
  'product-analytics.dataflow', 'event-stream.dataflow',
  'cache-miss-request.sequence', 'async-job-roundtrip.sequence',
  'agent-run.lifecycle', 'deployment-release.lifecycle',
].map((name) => [name, JSON.parse(readFileSync(new URL(`../../examples/${name}.json`, import.meta.url), 'utf8'))]));
controlCases['minimal.dataflow'] = {
  ...structuredClone(capacityCases['dataflow-high-row']),
  nodes: [{ id: 'input', type: 'backend', label: 'Input', stage: 0, row: 0 },
    { id: 'archive', type: 'database', label: 'Archive', stage: 1, row: 0 }],
};
controlCases['minimal.sequence'] = {
  ...structuredClone(capacityCases['sequence-segment-activation']), segments: [], activations: [],
};
controlCases['minimal.lifecycle'] = {
  ...structuredClone(capacityCases['lifecycle-band-legend']), meta: meta('Execution phases'),
  lanes: [{ id: 'main', label: 'Phases' }],
};
for (const source of Object.values(controlCases)) delete source.meta.canvas_fit;
