#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { capacityCases, controlCases } from '../archify/test/fixtures/content-canvas.mjs';

const candidate = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [baseline, output] = process.argv.slice(2).map((value) => path.resolve(value));
if (!baseline || !output) throw new Error('Usage: node scripts/benchmark-content-canvas.mjs <baseline-repository> <receipt.json>');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-canvas-benchmark-'));
const pairs = Number(process.env.ARCHIFY_CONTENT_BENCH_PAIRS || 10);
if (!Number.isInteger(pairs) || pairs < 10) throw new Error('Benchmark requires at least 10 pairs.');
const filter = process.env.ARCHIFY_CONTENT_BENCH_CASE;
const sha = (value) => createHash('sha256').update(value).digest('hex');
const quantile = (values, p) => [...values].sort((a,b) => a-b)[Math.ceil(values.length*p)-1];
const summary = (values) => ({ median: quantile(values,0.5), p95: quantile(values,0.95) });
const report = { baseline, candidate, node:process.version, platform:process.platform, arch:process.arch,
  cpu:os.cpus()[0]?.model, warmups:3, pairs, capacity:[], controls:[], agentEndToEnd:'unmeasured' };
function run(repository, command, source, file, target) {
  const start=performance.now();
  const result=spawnSync(process.execPath,[path.join(repository,'archify/bin/archify.mjs'),command,source.diagram_type,file,
    ...(command==='render'?[target]:['--json'])],{encoding:'utf8',cwd:repository});
  return {ms:performance.now()-start,status:result.status,stdout:result.stdout,stderr:result.stderr};
}
try {
  for(const [name, source] of Object.entries(capacityCases)) {
    const before=structuredClone(source);delete before.meta.canvas_fit;
    const sources=[before,source];
    const observations=sources.map((document,index)=>{
      const bytes=JSON.stringify(document),file=path.join(scratch,`${name}-${index}.json`),target=path.join(scratch,`${name}-${index}.html`);
      fs.writeFileSync(file,bytes);
      const result=run(index?candidate:baseline,'render',document,file,target);
      const html=result.status===0?fs.readFileSync(target,'utf8'):'';
      return {sha256:sha(bytes),status:result.status,stderr:result.stderr,
        frame:html.match(/<svg\b[^>]*viewBox="([^"]+)"/)?.[1] || null};
    });
    report.capacity.push({name,modeDifference:'B adds only meta.canvas_fit=content',observations});
  }
  for(const [name, source] of Object.entries(controlCases)) {
    if(filter && name!==filter)continue;
    const bytes=JSON.stringify(source),file=path.join(scratch,`${name}.json`);
    fs.writeFileSync(file,bytes);
    for(const command of ['render','validate']) {
      const samples={A:[],B:[]};
      for(let pair=-3;pair<pairs;pair++) {
        for(const label of pair%2===0?['A','B']:['B','A']) {
          const result=run(label==='A'?baseline:candidate,command,source,file,path.join(scratch,`${name}-${label}.html`));
          if(result.status!==0) throw new Error(`${name} ${command} ${label}: ${result.stdout}\n${result.stderr}`);
          if(pair>=0)samples[label].push(result.ms);
        }
      }
      const A=summary(samples.A),B=summary(samples.B);
      const limits={median:Math.max(A.median*1.10,A.median+5),p95:Math.max(A.p95*1.15,A.p95+15)};
      const passed=B.median<=limits.median && B.p95<=limits.p95;
      const row={name,command,inputSha256:sha(bytes),samples,A,B,limits,passed};
      if(!passed) {
        const noise={A1:[],A2:[]};
        for(let pair=0;pair<10;pair++)for(const label of pair%2?['A1','A2']:['A2','A1']) {
          noise[label].push(run(baseline,command,source,file,path.join(scratch,`${name}-noise.html`)).ms);
        }
        row.noise={samples:noise,A1:summary(noise.A1),A2:summary(noise.A2)};
      }
      report.controls.push(row);
      console.log(`${name} ${command}: ${passed?'pass':'FAIL'} A ${A.median.toFixed(1)}ms B ${B.median.toFixed(1)}ms`);
    }
  }
} finally {
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  fs.rmSync(scratch,{recursive:true,force:true});
}
if(report.controls.some(row=>!row.passed))process.exitCode=1;
