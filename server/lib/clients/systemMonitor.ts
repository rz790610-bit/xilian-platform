/**
 * 真实系统资源监控客户端
 * 使用 systeminformation 获取真实系统指标
 */

import si from 'systeminformation';
import os from 'os';
import type { SystemResource } from '../../services/monitoring.service';

/**
 * 获取系统资源状态
 */
export async function getSystemResources(): Promise<SystemResource> {
  try {
    const [cpu, mem, disk, network, processes, diskIO] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.networkStats(),
      si.processes(),
      si.disksIO(),
    ]);

    const mainDisk = disk[0] || { used: 0, size: 0, use: 0 };
    const mainNetwork = network[0] || { rx_sec: 0, tx_sec: 0 };

    return {
      cpu: {
        usage: cpu.currentLoad || 0,
        cores: os.cpus().length,
        loadAvg: os.loadavg() as [number, number, number],
      },
      memory: {
        usedMB: Math.round(mem.used / 1024 / 1024),
        totalMB: Math.round(mem.total / 1024 / 1024),
        usagePercent: (mem.used / mem.total) * 100,
        cached: Math.round((mem.cached || 0) / 1024 / 1024),
        buffers: Math.round((mem.buffers || 0) / 1024 / 1024),
      },
      disk: {
        usedGB: Math.round(mainDisk.used / 1024 / 1024 / 1024),
        totalGB: Math.round(mainDisk.size / 1024 / 1024 / 1024),
        usagePercent: mainDisk.use || 0,
        readMBps: diskIO ? (diskIO.rIO_sec || 0) / 1024 / 1024 : 0,
        writeMBps: diskIO ? (diskIO.wIO_sec || 0) / 1024 / 1024 : 0,
        iops: diskIO ? (diskIO.tIO_sec || 0) : 0,
      },
      network: {
        rxMBps: (mainNetwork.rx_sec || 0) / 1024 / 1024,
        txMBps: (mainNetwork.tx_sec || 0) / 1024 / 1024,
        connections: 0, // 需要额外获取
        errors: 0,
      },
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        threads: processes.all || 0,
        openFiles: 0, // Linux 特定
      },
    };
  } catch (error: any) {
    console.error('[SystemMonitor] Failed to get system resources:', error);
    
    // 返回基本信息（使用 Node.js 原生 API）
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    return {
      cpu: {
        usage: calculateCpuUsage(cpus),
        cores: cpus.length,
        loadAvg: os.loadavg() as [number, number, number],
      },
      memory: {
        usedMB: Math.round(usedMem / 1024 / 1024),
        totalMB: Math.round(totalMem / 1024 / 1024),
        usagePercent: (usedMem / totalMem) * 100,
        cached: 0,
        buffers: 0,
      },
      disk: {
        usedGB: 0,
        totalGB: 0,
        usagePercent: 0,
        readMBps: 0,
        writeMBps: 0,
        iops: 0,
      },
      network: {
        rxMBps: 0,
        txMBps: 0,
        connections: 0,
        errors: 0,
      },
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        threads: 0,
        openFiles: 0,
      },
    };
  }
}

/**
 * 获取详细的 CPU 信息
 */
export async function getCpuDetails(): Promise<{
  manufacturer: string;
  brand: string;
  speed: number;
  cores: number;
  physicalCores: number;
  processors: number;
  temperature?: number;
}> {
  try {
    const [cpuInfo, cpuTemp] = await Promise.all([
      si.cpu(),
      si.cpuTemperature(),
    ]);

    return {
      manufacturer: cpuInfo.manufacturer,
      brand: cpuInfo.brand,
      speed: cpuInfo.speed,
      cores: cpuInfo.cores,
      physicalCores: cpuInfo.physicalCores,
      processors: cpuInfo.processors,
      temperature: cpuTemp.main || undefined,
    };
  } catch {
    return {
      manufacturer: 'Unknown',
      brand: 'Unknown',
      speed: 0,
      cores: os.cpus().length,
      physicalCores: os.cpus().length,
      processors: 1,
    };
  }
}

/**
 * 获取详细的内存信息
 */
export async function getMemoryDetails(): Promise<{
  total: number;
  free: number;
  used: number;
  active: number;
  available: number;
  buffcache: number;
  swaptotal: number;
  swapused: number;
  swapfree: number;
}> {
  try {
    const mem = await si.mem();
    return {
      total: mem.total,
      free: mem.free,
      used: mem.used,
      active: mem.active,
      available: mem.available,
      buffcache: mem.buffcache,
      swaptotal: mem.swaptotal,
      swapused: mem.swapused,
      swapfree: mem.swapfree,
    };
  } catch {
    const total = os.totalmem();
    const free = os.freemem();
    return {
      total,
      free,
      used: total - free,
      active: total - free,
      available: free,
      buffcache: 0,
      swaptotal: 0,
      swapused: 0,
      swapfree: 0,
    };
  }
}

/**
 * 获取磁盘详情
 */
export async function getDiskDetails(): Promise<Array<{
  fs: string;
  type: string;
  size: number;
  used: number;
  available: number;
  use: number;
  mount: string;
}>> {
  try {
    const disks = await si.fsSize();
    return disks.map(disk => ({
      fs: disk.fs,
      type: disk.type,
      size: disk.size,
      used: disk.used,
      available: disk.available || disk.size - disk.used,
      use: disk.use,
      mount: disk.mount,
    }));
  } catch {
    return [];
  }
}

/**
 * 获取网络接口详情
 */
export async function getNetworkDetails(): Promise<Array<{
  iface: string;
  ip4: string;
  ip6: string;
  mac: string;
  operstate: string;
  rx_bytes: number;
  tx_bytes: number;
  rx_sec: number;
  tx_sec: number;
}>> {
  try {
    const [interfaces, stats] = await Promise.all([
      si.networkInterfaces(),
      si.networkStats(),
    ]);

    const statsMap = new Map(stats.map(s => [s.iface, s]));
    
    const ifaceArray = Array.isArray(interfaces) ? interfaces : [interfaces];

    return ifaceArray.map(iface => {
      const stat = statsMap.get(iface.iface) || {
        rx_bytes: 0,
        tx_bytes: 0,
        rx_sec: 0,
        tx_sec: 0,
      };
      return {
        iface: iface.iface,
        ip4: iface.ip4,
        ip6: iface.ip6,
        mac: iface.mac,
        operstate: iface.operstate,
        rx_bytes: stat.rx_bytes,
        tx_bytes: stat.tx_bytes,
        rx_sec: stat.rx_sec || 0,
        tx_sec: stat.tx_sec || 0,
      };
    });
  } catch {
    return [];
  }
}

/**
 * 获取进程列表
 */
export async function getProcessList(limit: number = 20): Promise<Array<{
  pid: number;
  name: string;
  cpu: number;
  mem: number;
  command: string;
  started: string;
}>> {
  try {
    const processes = await si.processes();
    
    // 按 CPU 使用率排序
    const sorted = processes.list
      .sort((a, b) => (b.cpu || 0) - (a.cpu || 0))
      .slice(0, limit);

    return sorted.map(proc => ({
      pid: proc.pid,
      name: proc.name,
      cpu: proc.cpu || 0,
      mem: proc.mem || 0,
      command: proc.command || '',
      started: proc.started || '',
    }));
  } catch {
    return [];
  }
}

/**
 * 获取系统信息
 */
export async function getSystemInfo(): Promise<{
  platform: string;
  distro: string;
  release: string;
  kernel: string;
  arch: string;
  hostname: string;
  uptime: number;
}> {
  try {
    const [osInfo, time] = await Promise.all([
      si.osInfo(),
      si.time(),
    ]);

    return {
      platform: osInfo.platform,
      distro: osInfo.distro,
      release: osInfo.release,
      kernel: osInfo.kernel,
      arch: osInfo.arch,
      hostname: osInfo.hostname,
      uptime: time.uptime,
    };
  } catch {
    return {
      platform: os.platform(),
      distro: 'Unknown',
      release: os.release(),
      kernel: os.release(),
      arch: os.arch(),
      hostname: os.hostname(),
      uptime: os.uptime(),
    };
  }
}

/**
 * 计算 CPU 使用率（使用 Node.js 原生 API）
 */
function calculateCpuUsage(cpus: os.CpuInfo[]): number {
  let totalIdle = 0;
  let totalTick = 0;

  cpus.forEach(cpu => {
    for (const type in cpu.times) {
      totalTick += cpu.times[type as keyof typeof cpu.times];
    }
    totalIdle += cpu.times.idle;
  });

  return ((totalTick - totalIdle) / totalTick) * 100;
}
