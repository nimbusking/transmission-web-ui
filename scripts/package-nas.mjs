#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const packageInfo = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const usage = `NAS 离线打包（在开发电脑运行）
用法：npm run package:nas -- [--version <版本>] [--output-dir <目录>]

--version     默认使用 package.json 的版本；重复部署请使用新版本
--output-dir  默认 artifacts/nas-<版本>；相对路径以仓库根目录为准
--help        显示帮助

需要 Node.js >=22.12、npm、GNU tar、POSIX sh，以及已安装的项目依赖。
依次执行单元测试、安装器测试、生产构建、离线打包和 SHA256 校验。
输出目录必须不存在或为空，以免覆盖已有部署包。
`;

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} 执行失败（${result.status ?? result.signal}）`);
}

try {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(usage);
    process.exit(0);
  }
  let version = packageInfo.version;
  let output;
  const seen = new Set();
  for (let i = 0; i < args.length; i += 2) {
    const option = args[i],
      value = args[i + 1];
    if (
      !['--version', '--output-dir'].includes(option) ||
      !value ||
      value.startsWith('--') ||
      seen.has(option)
    )
      throw new Error(`无效参数：${option}\n${usage}`);
    seen.add(option);
    if (option === '--version') version = value;
    else output = value;
  }
  if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version))
    throw new Error('无效版本号，例如 2.1.3-status.2');
  const directory = path.resolve(root, output ?? `artifacts/nas-${version}`);
  try {
    if ((await readdir(directory)).length)
      throw new Error(`输出目录非空，请指定新目录：${directory}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  run('tar', ['--version']);
  run('npm', ['test']);
  run('npm', ['run', 'test:installer']);
  run('npm', ['run', 'build']);
  run(process.execPath, ['scripts/release.mjs', '--version', version, '--output-dir', directory]);
  for (const name of [
    `transmission-web-ui-${version}.tar.gz`,
    'transmission-web-ui.tar.gz',
    'install-transmission-web-ui.sh',
  ]) {
    const data = await readFile(path.join(directory, name));
    const expected = `${createHash('sha256').update(data).digest('hex')}  ${name}\n`;
    if ((await readFile(path.join(directory, `${name}.sha256`), 'utf8')) !== expected)
      throw new Error(`SHA256 校验失败：${name}`);
  }
  run('sh', ['-n', path.join(directory, 'install-transmission-web-ui.sh')]);
  console.log(
    `\nNAS 打包完成：${directory}\n上传 install-transmission-web-ui.sh 和对应 .sha256 文件到 NAS。\nSSH 执行：\n  sha256sum -c install-transmission-web-ui.sh.sha256\n  sudo sh install-transmission-web-ui.sh --check\n  sudo sh install-transmission-web-ui.sh\n\n归档版本：${version}；界面版本：${packageInfo.version}`,
  );
} catch (error) {
  console.error(`打包失败：${error.message}`);
  process.exitCode = 1;
}
