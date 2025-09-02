// Node 18+ (built-in fetch). Generates ./public/data/latest.json
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('public/data');
const OUTFILE = path.join(OUT, 'latest.json');

const JINA = (url) => `https://r.jina.ai/http://${url.replace(/^https?:\/\//,'')}`;

// 1) AO (daily) from NOAA CPC text
async function fetchAOIndexDaily() {
  const res = await fetch(JINA('https://www.cpc.ncep.noaa.gov/products/precip/CWlink/daily_ao_index/ao.sprd2.txt'));
  const text = await res.text();
  const lines = text.trim().split('\n').filter(Boolean);
  const last = lines[lines.length-1];
  const v = parseFloat(last.trim().split(/\s+/).pop());
  return Number.isFinite(v) ? v : 0;
}

// 2) ENSO phase via ONI (±0.5閾値)
async function fetchENSOPhase() {
  const res = await fetch(JINA('https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt'));
  const text = await res.text();
  const lines = text.trim().split('\n').filter(l=>/\d/.test(l));
  const oni = parseFloat(lines.at(-1).trim().split(/\s+/).pop());
  return oni > 0.5 ? 1 : oni < -0.5 ? -1 : 0;
}

// 3) 日本海SST偏差 (ERA5, 40N/135E, 直近7日平均 - 月別平年値 近似)
async function fetchJapanSeaSSTAnom() {
  const lat=40.0, lon=135.0;
  const end = new Date();
  const start = new Date(end); start.setDate(end.getDate()-6);
  const qs = new URLSearchParams({
    latitude:String(lat), longitude:String(lon),
    start_date:start.toISOString().slice(0,10),
    end_date:end.toISOString().slice(0,10),
    daily:'sea_surface_temperature',
    timezone:'Asia/Tokyo'
  });
  const url = `https://archive-api.open-meteo.com/v1/era5?${qs.toString()}`;
  const js = await (await fetch(url)).json();
  const arr = (js?.daily?.sea_surface_temperature ?? []).filter(Number.isFinite);
  if (!arr.length) return 0;
  const mean = arr.reduce((a,b)=>a+b,0)/arr.length;
  const CLIM = [9.0,8.5,8.5,10.0,13.0,17.0,22.0,25.0,24.0,21.0,17.0,13.0][new Date().getMonth()];
  return Math.round((mean-CLIM)*10)/10;
}

// 4) シベリア高 代理指数 (ERA5 MSLP, 55N/100E, 直近7日平均, 1018hPa基準で±2スケール)
async function fetchSiberianHighIdx() {
  const lat=55.0, lon=100.0;
  const end = new Date();
  const start = new Date(end); start.setDate(end.getDate()-6);
  const qs = new URLSearchParams({
    latitude:String(lat), longitude:String(lon),
    start_date:start.toISOString().slice(0,10),
    end_date:end.toISOString().slice(0,10),
    daily:'mean_sea_level_pressure',
    timezone:'Asia/Tokyo'
  });
  const url = `https://archive-api.open-meteo.com/v1/era5?${qs.toString()}`;
  const js = await (await fetch(url)).json();
  const arr = (js?.daily?.mean_sea_level_pressure ?? []).filter(Number.isFinite);
  if (!arr.length) return 0;
  const hPa = (arr.reduce((a,b)=>a+b,0)/arr.length)/100.0;
  const baseline = 1018;
  return Math.max(-2, Math.min(2, Math.round(((hPa - baseline)/5)*10)/10));
}

async function main() {
  const today = new Date();
  const rec = {
    date: today.toISOString().slice(0,10),
    siberianHighIdx: await fetchSiberianHighIdx(),
    aoIndex: await fetchAOIndexDaily(),
    japanSeaSstAnom: await fetchJapanSeaSSTAnom(),
    ensoPhase: await fetchENSOPhase(),
    notes: 'auto via Actions',
  };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(OUTFILE, JSON.stringify(rec, null, 2));
  console.log('Wrote', OUTFILE, rec);
}

main().catch(err => { console.error(err); process.exit(1); });
